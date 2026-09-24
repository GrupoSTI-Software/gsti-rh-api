import type { I18n } from '@adonisjs/i18n'
import PlatformTrialService from './platform_trial_service.js'
import PlatformTenantMilestoneService from './platform_tenant_milestone_service.js'
import PlatformTrialUsageService, { type TrialFrecuencia } from './platform_trial_usage_service.js'

// ─── Tipos de retorno (contrato fijado por USRH1789079078173) ───────────────

export interface PlatformLiveTrialRow {
  tenant: { publicId: string; nombre: string }
  /** Día civil `YYYY-MM-DD`, contratado — NUNCA `finEfectivo` (RN-5: "su fecha de fin", no el borde de medición). */
  fin: string
  diasRestantes: number
  /** Cuántos de los siete hitos de puesta en marcha lleva cumplidos hoy (0-7, RN-informa/no ordena). */
  hitosCumplidos: number
  /** Mismo tipo que la consulta individual (USRH1789079078171) — RN-12: mismos valores, misma forma. */
  frecuencia: TrialFrecuencia
}

/** `TrialFrecuencia` degradada cuando el motor falla para ESTA empresa (RN-7/RN-8). Nunca `sin-base` ni `0` disfrazados. */
const FRECUENCIA_NO_DISPONIBLE: TrialFrecuencia = {
  estado: 'no-disponible',
  porcentaje: null,
  registros: 0,
  empleadoDiasEvaluables: 0,
  empleadosEvaluados: 0,
}

/** Rango de ordenamiento del grupo de `estado` (RN-10): sin-base primero, no-disponible al final. */
const ESTADO_RANK: Record<TrialFrecuencia['estado'], number> = {
  'sin-base': 0,
  'con-base': 1,
  'no-disponible': 2,
}

/**
 * Comparador puro del orden del listado (RN-10/RN-11).
 *
 * 1. Grupo por `frecuencia.estado`: sin-base → con-base → no-disponible.
 * 2. Dentro de con-base, de menor a mayor `porcentaje`.
 * 3. Dentro de cada grupo (y tras el paso 2), por `diasRestantes` ascendente
 *    ("primero la que vence antes").
 * 4. Desempate final por `tenant.publicId` ascendente — sin significado
 *    comercial, solo para que dos cargas seguidas den el mismo orden
 *    (supuesto cerrado del ticket).
 *
 * Los hitos cumplidos NUNCA entran aquí (RN-11: informan, no ordenan).
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
 * Listado de todas las pruebas vivas de la plataforma, con sus hitos
 * cumplidos y su frecuencia de registro (USRH1789079078173).
 *
 * Orquesta tres rebanadas ya construidas, cada una con su propia definición
 * — esta historia no redefine ninguna (fuera de alcance explícito, §"Qué
 * información hay que guardar"):
 *   - `PlatformTrialService.listLiveTrials()` (USRH1789079078169): universo
 *     de pruebas vivas, sin el tope de 100 que arrastra la tarjeta actual.
 *   - `PlatformTenantMilestoneService.resolveMilestones()` (USRH1789079078170):
 *     los siete hitos, en LOTE para todo el universo — sí es seguro pedirlo
 *     junto porque no suma resultados entre empresas.
 *   - `PlatformTrialUsageService.resolveFrecuencia()` (USRH1789079078171): la
 *     frecuencia, **una corrida del motor por tenant** (RN declarado del
 *     ticket) — el motor de asistencia, si recibe varias empresas juntas,
 *     las suma en un solo resultado que "parece correcto"; pedirla en lote
 *     rompería el aislamiento entre empresas sin que se note.
 *
 * Cruce SIEMPRE por `businessUnitId` (RN-6, el cuidado central de la
 * historia) — nunca por la posición en que llegó cada insumo.
 */
export default class PlatformLiveTrialsService {
  private readonly trialService: PlatformTrialService
  private readonly milestoneService: PlatformTenantMilestoneService
  private readonly usageService: PlatformTrialUsageService

  /**
   * @param i18n - Requerido por el motor vía `PlatformTrialUsageService`.
   * @param deps - Inyección para pruebas: cada dependencia puede sustituirse
   *   por un doble (mismo patrón de testabilidad que
   *   `PlatformTrialUsageService`) sin depender de sembrar el universo real
   *   para probar el orden o el degradado por fallo (RN-8).
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

  async listLiveTrials(): Promise<PlatformLiveTrialRow[]> {
    // Universo (RN-1: sin umbral de días, sin tope de cantidad) y hitos en
    // lote — un fallo de cualquiera de los dos rompe TODA la lista (RN-9),
    // así que no se atrapan aquí: el controller los propaga como error.
    const liveTrials = await this.trialService.listLiveTrials()
    if (liveTrials.length === 0) {
      return []
    }

    const businessUnitIds = liveTrials.map((t) => t.businessUnitId)
    const milestonesByBu = await this.milestoneService.resolveMilestones(businessUnitIds)

    // La frecuencia SÍ es una corrida por tenant (declarado en el ticket) y
    // SÍ se atrapa por tenant (RN-8): una empresa rota nunca deja ciego a
    // GSTI sobre las demás.
    const rows = await Promise.all(
      liveTrials.map(async (live) => {
        const milestones = milestonesByBu.get(live.businessUnitId) ?? []
        const hitosCumplidos = milestones.filter((m) => m.cumplido).length
        const ventana = { inicio: live.trial.inicio, fin: live.trial.finEfectivo }
        const frecuencia = await this.resolveFrecuenciaSafe(live.businessUnitId, ventana)

        const row: PlatformLiveTrialRow = {
          tenant: { publicId: live.publicId, nombre: live.nombre },
          fin: live.trial.fin,
          diasRestantes: live.trial.diasRestantes,
          hitosCumplidos,
          frecuencia,
        }
        return row
      })
    )

    return rows.sort(comparePlatformLiveTrialRows)
  }

  /**
   * Frecuencia de una sola empresa, con el motor real. Un fallo (RN-8, RB-11
   * heredado de USRH1789079078171: el motor puede tirar `PlatformMetricServiceError`
   * con 500 explícito) se degrada a `no-disponible` para ESA fila, sin
   * detener el resto del listado ni propagar el sobre del error del motor.
   */
  private async resolveFrecuenciaSafe(
    businessUnitId: number,
    ventana: { inicio: string; fin: string }
  ): Promise<TrialFrecuencia> {
    try {
      return await this.usageService.resolveFrecuencia(businessUnitId, ventana)
    } catch {
      return FRECUENCIA_NO_DISPONIBLE
    }
  }
}
