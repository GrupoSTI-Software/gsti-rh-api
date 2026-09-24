import type { I18n } from '@adonisjs/i18n'
import logger from '@adonisjs/core/services/logger'
import { TenantContext } from '../utils/tenant_context.js'
import PlatformTrialService from './platform_trial_service.js'
import PlatformTenantMilestoneService from './platform_tenant_milestone_service.js'
import PlatformTrialUsageService, { type FrecuenciaEstado } from './platform_trial_usage_service.js'
import {
  PLATFORM_LIVE_TRIAL_RUN_UNSCOPED_REASON,
  PLATFORM_LIVE_TRIALS_CONCURRENCY,
  PLATFORM_LIVE_TRIALS_EXPECTED_MAX,
} from '../constants/platform_trial_live.js'

// ─── Tipos de retorno (contrato fijado por USRH1789079078173, §9 del spec) ──

/** Solo `estado`/`porcentaje` — el resto de `TrialFrecuencia` (RN-41) no baja al listado. */
export interface PlatformLiveTrialFrecuencia {
  estado: FrecuenciaEstado
  porcentaje: number | null
}

export interface PlatformLiveTrialRow {
  tenant: { publicId: string; nombre: string }
  /** Día civil `YYYY-MM-DD`, contratado. */
  fin: string
  diasRestantes: number
  hitosCumplidos: number
  /** `hitos.length`, nunca el literal `7` (§7): si USRH1789079078170 agrega un hito, este contrato lo sigue solo. */
  hitosTotales: number
  frecuencia: PlatformLiveTrialFrecuencia
}

export interface PlatformLiveTrialsListResult {
  total: number
  pruebas: PlatformLiveTrialRow[]
}

/** `TrialFrecuencia` degradada cuando el motor falla para ESTA empresa (RN-53). Nunca `sin-base` ni `0` disfrazados. */
const FRECUENCIA_NO_DISPONIBLE: PlatformLiveTrialFrecuencia = { estado: 'no-disponible', porcentaje: null }

/** Rango de ordenamiento del grupo de `estado` (RN-36): sin-base primero, no-disponible al final. */
const ESTADO_RANK: Record<FrecuenciaEstado, number> = {
  'sin-base': 0,
  'con-base': 1,
  'no-disponible': 2,
}

/**
 * Comparador **total** del orden del listado (RN-36/RN-37/RN-54): nunca se
 * apoya en la estabilidad de `Array.prototype.sort`, siempre resuelve un
 * orden — devuelve `0` solo para la misma fila.
 *
 * 1. Grupo por `frecuencia.estado`: sin-base → con-base → no-disponible.
 * 2. Dentro de con-base, de menor a mayor `porcentaje` (nunca `null` ahí).
 * 3. Dentro de cada grupo (y tras el paso 2), por `diasRestantes` ascendente.
 * 4. Desempate final por `tenant.publicId` ascendente — sin significado
 *    comercial, solo para que dos cargas seguidas den el mismo orden.
 *
 * Los hitos cumplidos NUNCA entran aquí (RN-37: informan, no ordenan).
 */
export function comparePlatformLiveTrialRows(a: PlatformLiveTrialRow, b: PlatformLiveTrialRow): number {
  const rankDiff = ESTADO_RANK[a.frecuencia.estado] - ESTADO_RANK[b.frecuencia.estado]
  if (rankDiff !== 0) return rankDiff

  if (a.frecuencia.estado === 'con-base') {
    const pctDiff = (a.frecuencia.porcentaje ?? 0) - (b.frecuencia.porcentaje ?? 0)
    if (pctDiff !== 0) return pctDiff
  }

  if (a.diasRestantes !== b.diasRestantes) return a.diasRestantes - b.diasRestantes

  if (a.tenant.publicId < b.tenant.publicId) return -1
  if (a.tenant.publicId > b.tenant.publicId) return 1
  return 0
}

/**
 * Ejecuta `fn` sobre `items` en tandas de a lo mucho `limit` en paralelo
 * (§7: "bucle acotado al motor", nunca `Promise.all` sin límite ni una
 * corrida en lote). Cada resultado se devuelve en el mismo orden de
 * entrada, pero **no se usa esa posición para cruzar nada** (§14): cada
 * tarea del bucle de frecuencia devuelve su propia llave (`businessUnitId`)
 * dentro del payload, así que un `allSettled` rechazado nunca puede perder
 * el dato ni obligar a recuperarlo por índice.
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0

  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor
      cursor += 1
      if (i >= items.length) return
      results[i] = await fn(items[i]!)
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () => worker())
  await Promise.all(workers)
  return results
}

/**
 * Listado de todas las pruebas vivas de la plataforma, con sus hitos
 * cumplidos y su frecuencia de registro (USRH1789079078173).
 *
 * Rebanada de una sola capa que **solo compone** tres insumos ya resueltos
 * por separado, cada uno con su propia definición (fuera de alcance
 * explícito redefinir cualquiera de los tres, §2):
 *   - `PlatformTrialService.listLiveTrials()` (USRH1789079078169): universo
 *     de pruebas vivas, sin el tope de 100 que arrastra la tarjeta actual.
 *   - `PlatformTenantMilestoneService.resolveMilestones()` (USRH1789079078170):
 *     los siete hitos, en LOTE para todo el universo — sí es seguro pedirlo
 *     junto porque no suma resultados entre empresas.
 *   - `PlatformTrialUsageService.resolveFrecuencia()` (USRH1789079078171): la
 *     frecuencia, **una corrida del motor por tenant, acotada a
 *     `PLATFORM_LIVE_TRIALS_CONCURRENCY` en paralelo** — nunca en lote: el
 *     motor de asistencia, con varias empresas juntas, las suma en un solo
 *     resultado que "parece correcto" (F21, CA-12).
 *
 * Cruce SIEMPRE por `businessUnitId` (RN-49/F20, el cuidado central de la
 * historia) — nunca por la posición en que llegó cada insumo. `businessUnitId`
 * es interno: nunca sale al cuerpo HTTP.
 *
 * Toda la composición corre dentro de un único `TenantContext.runUnscoped`
 * (F25): es la única consulta del set que mira a todas las empresas a la
 * vez, a propósito, y el motivo queda auditado en constante. Nunca dentro
 * del bucle: un `logger.warn` por cada una de N pruebas sería una bitácora
 * inservible.
 */
export default class PlatformLiveTrialService {
  private readonly trialService: PlatformTrialService
  private readonly milestoneService: PlatformTenantMilestoneService
  private readonly usageService: PlatformTrialUsageService

  /**
   * @param i18n - Requerido por el motor vía `PlatformTrialUsageService`.
   *   Este servicio no puede ser sin dependencias: se instancia por
   *   petición con `ctx.i18n`, igual que `attendance-stats.controller.ts`
   *   (§7, "única desviación del molde" respecto a
   *   `PlatformDeviceDiscrepancyController`).
   * @param deps - Inyección para pruebas: cada dependencia puede
   *   sustituirse por un doble sin depender de sembrar el universo real
   *   para probar el orden, el degradado por fila (RN-53) o el conteo de
   *   invocaciones al motor (CA-12).
   */
  constructor(
    i18n: I18n,
    deps?: {
      trialService?: PlatformTrialService
      milestoneService?: PlatformTenantMilestoneService
      usageService?: PlatformTrialUsageService
    }
  ) {
    this.trialService = deps?.trialService ?? new PlatformTrialService()
    this.milestoneService = deps?.milestoneService ?? new PlatformTenantMilestoneService()
    this.usageService = deps?.usageService ?? new PlatformTrialUsageService(i18n)
  }

  async listLiveTrials(): Promise<PlatformLiveTrialsListResult> {
    return TenantContext.runUnscoped(() => this.listWithin(), PLATFORM_LIVE_TRIAL_RUN_UNSCOPED_REASON)
  }

  private async listWithin(): Promise<PlatformLiveTrialsListResult> {
    // Universo (RN-35: sin umbral de días, sin tope de cantidad) — un
    // fallo aquí rompe TODA la lista (regla local "fallo global ≠ fallo de
    // fila", §4): no se atrapa, el controller lo propaga como 500.
    const universo = await this.trialService.listLiveTrials()
    if (universo.length === 0) {
      // RN-39: lista vacía explícita, nunca error.
      return { total: 0, pruebas: [] }
    }

    // Señal de volumen sin truncar (RN-35/F23): un tope duro aquí
    // reintroduce exactamente el defecto que esta HU existe para quitar.
    if (universo.length > PLATFORM_LIVE_TRIALS_EXPECTED_MAX) {
      logger.warn(
        { count: universo.length, expectedMax: PLATFORM_LIVE_TRIALS_EXPECTED_MAX },
        'PlatformLiveTrialService: el universo de pruebas vivas rebasa el supuesto de volumen — la lista sale completa igual, sin truncar'
      )
    }

    // Hitos en lote: UNA llamada, ocho consultas fijas que no crecen con N
    // (USRH1789079078170). También rompe TODA la lista si falla — no se
    // atrapa aquí.
    const businessUnitIds = universo.map((t) => t.businessUnitId)
    const milestonesByBu = await this.milestoneService.resolveMilestones(businessUnitIds)

    // Frecuencia: una corrida del motor por prueba viva, acotada en
    // paralelo (CA-12). Cada tarea atrapa su propio fallo y devuelve su
    // propia llave — nunca se cruza por índice (§14).
    const pares = await mapWithConcurrency(universo, PLATFORM_LIVE_TRIALS_CONCURRENCY, async (live) => {
      const ventana = { inicio: live.trial.inicio, fin: live.trial.finEfectivo }
      try {
        const { estado, porcentaje } = await this.usageService.resolveFrecuencia(live.businessUnitId, ventana)
        return { businessUnitId: live.businessUnitId, frecuencia: { estado, porcentaje } }
      } catch (error) {
        logger.warn(
          {
            businessUnitId: live.businessUnitId,
            error: error instanceof Error ? error.message : String(error),
          },
          'PlatformLiveTrialService: el cálculo de frecuencia falló para esta empresa — se entrega como no-disponible, el resto de la lista sigue intacto'
        )
        return { businessUnitId: live.businessUnitId, frecuencia: FRECUENCIA_NO_DISPONIBLE }
      }
    })
    const frecuenciasByBu = new Map(pares.map((p) => [p.businessUnitId, p.frecuencia]))

    const pruebas: PlatformLiveTrialRow[] = universo.map((live) => {
      // Decisión declarada (§7): hitos ausentes para un `businessUnitId` del
      // universo NUNCA se degradan a `hitosCumplidos: 0` — es un contrato
      // roto de USRH1789079078170 y se falla ruidoso (500 con status
      // explícito vía el catch del controller), no en silencio.
      const hitos = milestonesByBu.get(live.businessUnitId)
      if (hitos === undefined) {
        throw new Error(
          `PlatformLiveTrialService: sin hitos resueltos para businessUnitId=${live.businessUnitId} — contrato roto de USRH1789079078170`
        )
      }
      const frecuencia = frecuenciasByBu.get(live.businessUnitId)!

      return {
        tenant: { publicId: live.publicId, nombre: live.nombre },
        fin: live.trial.fin,
        diasRestantes: live.trial.diasRestantes,
        hitosCumplidos: hitos.filter((h) => h.cumplido).length,
        hitosTotales: hitos.length,
        frecuencia,
      }
    })

    pruebas.sort(comparePlatformLiveTrialRows)

    return { total: pruebas.length, pruebas }
  }
}
