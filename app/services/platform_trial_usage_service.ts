import type { I18n } from '@adonisjs/i18n'
import AttendanceStatsService from '../modules/attendance-stats/attendance-stats.service.js'
import type {
  AttendanceStatsFilters,
  OverviewResponse,
  OverviewStatistics,
  ResolvedScope,
} from '../modules/attendance-stats/dto/attendance-stats.dto.js'
import {
  PLATFORM_METRIC_ERROR_CODES,
  TRIAL_USAGE_METRIC_ERROR_TEXTS,
} from '../constants/platform_metric_error_codes.js'
import { PlatformMetricServiceError } from '../exceptions/platform_metric_service_error.js'
import PlatformTrialService from './platform_trial_service.js'

// ─── Tipos de retorno (contrato fijado por USRH1789079078171) ───────────────

/**
 * `'no-disponible'` se declara aquí para que `USRH1789079078173` degrade una
 * fila del listado sin inventar un segundo vocabulario — este servicio
 * **nunca** lo devuelve (CA-12): un fallo del motor se responde como error
 * (§6), no como un tercer estado de la frecuencia.
 */
export type FrecuenciaEstado = 'con-base' | 'sin-base' | 'no-disponible'

export interface TrialFrecuencia {
  estado: FrecuenciaEstado
  /** Un decimal. `null` si `estado !== 'con-base'`. NUNCA `0` en lugar de `null` (RB-3). */
  porcentaje: number | null
  /** `assists + tolerances + delays` — `earlyOuts` NO entra (RB-1, dto:24-31). */
  registros: number
  /** `totalAvailable` del motor: empleado-días evaluables del tramo medido. */
  empleadoDiasEvaluables: number
  /** `employeesQty` del motor: empleados distintos con ≥1 día evaluable. No es sumable ni promediable entre puntos de la serie. */
  empleadosEvaluados: number
}

export interface TrialFrecuenciaDia extends TrialFrecuencia {
  dia: string
}

/**
 * Porcentaje con un decimal. `null` cuando la base es `0`: un tramo sin
 * denominador es "sin a quién medir", **no** `0 %` (RB-3).
 *
 * Deliberadamente NO es `resolveFlowRate` (`platform_subscription_flow_service.ts:52-57`),
 * que devuelve `0` cuando la base es `0` — exactamente lo contrario de *sin
 * base*: ahí un mes sin movimiento es un cero legítimo; aquí un tramo sin
 * empleado-días evaluables no es "0 % de uso", es "no hay a quién medir".
 */
export function resolveFrecuenciaPct(registros: number, base: number): number | null {
  if (base === 0) return null
  return Math.round((registros / base) * 1000) / 10
}

/**
 * Traduce las estadísticas crudas del motor (`OverviewStatistics`) al
 * vocabulario del set. Contadores crudos siempre — los porcentajes del
 * propio motor se ignoran por completo: con `totalAvailable === 0` los
 * devuelve todos en `0` (`toStatistics`, `attendance-stats.rules.ts`),
 * y leerlos convertiría el *sin base* en un cero (Anexo A, trampa #2).
 */
function toFrecuencia(stats: OverviewStatistics): TrialFrecuencia {
  const base = stats.totalAvailable
  const registros = stats.assists + stats.tolerances + stats.delays
  return {
    estado: base === 0 ? 'sin-base' : 'con-base',
    porcentaje: resolveFrecuenciaPct(registros, base),
    registros,
    empleadoDiasEvaluables: base,
    empleadosEvaluados: stats.employeesQty,
  }
}

/**
 * Frecuencia de registro de la prueba de un tenant (USRH1789079078171).
 *
 * Corre el mismo motor que usa el propio cliente en su monitor de asistencia
 * (`AttendanceStatsService.getOverview`, `app/modules/attendance-stats/`) sobre
 * el tramo medido de la prueba `[prueba.inicio, prueba.finEfectivo]` que
 * resuelve `PlatformTrialService` (USRH1789079078169) — **nunca se recalcula
 * la ventana ni se lee `billing_subscription_canceled_at` aquí** (RB-9, §8.3):
 * el borde de cancelación llega resuelto en `finEfectivo`.
 *
 * No se toca `app/modules/attendance-stats/` en absoluto: se usa tal cual,
 * con **una sola llamada por tenant** y `allowedBusinessUnitIds` de
 * exactamente un elemento (RB-10) — pasarle varias empresas juntas suma sus
 * resultados en uno solo, con números plausibles y aislamiento roto en
 * silencio (F13, la fuga que este servicio existe para impedir).
 */
export default class PlatformTrialUsageService {
  private readonly trialService: PlatformTrialService
  private readonly attendanceStatsService: AttendanceStatsService

  /**
   * @param i18n - Requerido por el motor (`AttendanceStatsService`
   *   constructor); entra desde `ctx.i18n`, igual que
   *   `attendance-stats.controller.ts`.
   * @param attendanceStatsService - Inyección para pruebas: permite pasar un
   *   doble cuyo `getOverview` regrese un `ServiceResult` con `status !== 200`
   *   sin depender de vaciar `allowedBusinessUnitIds` (que en producción
   *   nunca ocurre bajo uso correcto, RB-10) ni de forzar una falla real de
   *   BD. Mismo patrón de testabilidad que el propio motor usa para su
   *   `repo`/`dependencies` (`attendance-stats.service.ts` constructor).
   */
  constructor(i18n: I18n, attendanceStatsService?: AttendanceStatsService) {
    this.trialService = new PlatformTrialService()
    this.attendanceStatsService = attendanceStatsService ?? new AttendanceStatsService(i18n)
  }

  /**
   * Uso (frecuencia acumulada + serie diaria) de la prueba de un tenant por
   * su `publicId`. `ventana`/`frecuencia`/`serie` salen en `null`/`[]` sin
   * prueba (RB-8) — el motor **no se invoca** en ese caso. El 404 de tenant
   * inexistente/borrado lo produce y lo propaga `PlatformTrialService`
   * (USRH1789079078169); esta HU no lo redefine.
   */
  async getTenantTrialUsage(publicId: string): Promise<{
    tenant: { publicId: string; nombre: string }
    ventana: { inicio: string; fin: string } | null
    frecuencia: TrialFrecuencia | null
    serie: TrialFrecuenciaDia[]
  }> {
    const { tenant, prueba } = await this.trialService.getTenantTrial(publicId)

    if (!prueba) {
      return { tenant, ventana: null, frecuencia: null, serie: [] }
    }

    // `getTenantTrial` ya probó que el tenant existe (lanzó 404 si no); esta
    // segunda lectura es de una sola columna y nunca vuelve a resolver el
    // tenant por su cuenta (§8.2). `null` aquí sería una carrera imposible
    // bajo transacciones normales; se cubre de forma defensiva, sin motor.
    const businessUnitId = await this.trialService.resolveBusinessUnitId(publicId)
    if (businessUnitId === null) {
      return { tenant, ventana: null, frecuencia: null, serie: [] }
    }

    const ventana = { inicio: prueba.inicio, fin: prueba.finEfectivo }
    const { frecuencia, serie } = await this.runMotor(businessUnitId, ventana)

    return { tenant, ventana, frecuencia, serie }
  }

  /**
   * Frecuencia acumulada de un tenant sobre una ventana ya resuelta —
   * contrato para `USRH1789079078173` (R13): una corrida del motor por
   * tenant, nunca en lote (el motor suma varias empresas en un solo
   * resultado si se le pasan juntas, §12 del spec).
   */
  async resolveFrecuencia(
    businessUnitId: number,
    ventana: { inicio: string; fin: string }
  ): Promise<TrialFrecuencia> {
    const { frecuencia } = await this.runMotor(businessUnitId, ventana)
    return frecuencia
  }

  /**
   * Única llamada al motor por tenant. Traduce su `ServiceResult` fallido
   * (`status !== 200`, solo alcanzable en producción si `allowedBusinessUnitIds`
   * quedara vacío) al catálogo de plataforma: el sobre del motor
   * (`{status, type, title, message, key: 'scope-insuficiente', data}`)
   * **nunca se propaga** (RB-11, CA-11) — se mapea con `httpStatus` explícito,
   * porque el default de la excepción es `400` (`platform_metric_service_error.ts:18`)
   * y omitirlo deja el endpoint respondiendo 400 sin que nadie lo note.
   */
  private async runMotor(
    businessUnitId: number,
    ventana: { inicio: string; fin: string }
  ): Promise<{ frecuencia: TrialFrecuencia; serie: TrialFrecuenciaDia[] }> {
    const scope: ResolvedScope = { allowedBusinessUnitIds: [businessUnitId] }
    const filters: AttendanceStatsFilters = { startDay: ventana.inicio, endDay: ventana.fin }

    const result = await this.attendanceStatsService.getOverview(filters, scope)

    if (result.status !== 200 || !result.data) {
      throw new PlatformMetricServiceError(
        `getOverview falló para ${businessUnitId}: ${result.status} ${result.key ?? ''}`,
        PLATFORM_METRIC_ERROR_CODES.USAGE_UNAVAILABLE,
        500, // Obligatorio: el default de la excepción es 400 (§9, Anexo A trampa fatal).
        TRIAL_USAGE_METRIC_ERROR_TEXTS.failureKey,
        'No fue posible calcular el uso de la prueba en este momento.'
      )
    }

    const overview: OverviewResponse = result.data
    const frecuencia = toFrecuencia(overview.statistics)
    // `daily[]` ya viene completo, un punto por cada día de [startDay, endDay]
    // inclusive, ascendente (Anexo A trampa #1): no se construye la serie ni
    // se rellenan huecos, solo se traduce cada punto al vocabulario del set.
    const serie: TrialFrecuenciaDia[] = overview.daily.map((row) => ({
      dia: row.day,
      ...toFrecuencia(row.statistics),
    }))

    return { frecuencia, serie }
  }
}
