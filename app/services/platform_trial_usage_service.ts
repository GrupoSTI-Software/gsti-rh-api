import type { I18n } from '@adonisjs/i18n'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
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
import { ASSIST_ORIGIN } from '../constants/assist_origin.js'
import { getBusinessTimeZone } from '../utils/business_date.js'
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
 * Desglose por canal de las checadas de la prueba (USRH1789079078172).
 *
 * Los seis campos son el vocabulario cerrado de `ASSIST_ORIGIN`
 * (`assist_origin`) traducido literal — no se agregan, no se fusionan (RN-1).
 * Salen SIEMPRE los seis, en `0` cuando no se usaron (RN-2): un canal ausente
 * se leería como "no tengo el dato"; en `0` se lee como "esa vía no se usó".
 * `total` es la suma exacta de los seis (RN-4).
 */
export interface TrialCanalesChecadas {
  autoservicio: number
  capturaAdministrador: number
  sincronizacion: number
  manualLegado: number
  /** Reservado para el kiosco por conexión permanente (RN-5 de Anexo). Hoy siempre `0` (Supuestos y decisiones abiertas). */
  dispositivo: number
  checadorAdms: number
  total: number
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

/** Fila cruda de la agrupación `GROUP BY assist_origin` sobre `assists`. */
interface AssistOriginCountRow {
  origin: string | null
  cantidad: number | string
}

/**
 * Vocabulario cerrado `assist_origin` → campo del desglose (RN-1, USRH1789079078172).
 * Traducción literal, uno a uno con `ASSIST_ORIGIN` (`app/constants/assist_origin.ts`).
 */
const ORIGIN_TO_CANAL: Record<string, keyof Omit<TrialCanalesChecadas, 'total'>> = {
  [ASSIST_ORIGIN.SELF_SERVICE]: 'autoservicio',
  [ASSIST_ORIGIN.ADMIN_CAPTURE]: 'capturaAdministrador',
  [ASSIST_ORIGIN.SYNC]: 'sincronizacion',
  [ASSIST_ORIGIN.MANUAL]: 'manualLegado',
  [ASSIST_ORIGIN.DEVICE]: 'dispositivo',
  [ASSIST_ORIGIN.ADMS]: 'checadorAdms',
}

/**
 * Traduce las filas crudas de `GROUP BY assist_origin` al desglose de seis
 * canales + total (RN-1/RN-2/RN-4). Puro — sin base de datos, es lo que
 * prueba `tests/unit/services/platform_trial_channels.spec.ts`.
 *
 * Una fila con `origin` fuera del vocabulario cerrado (no debería ocurrir:
 * la query ya filtra `whereNotNull` y el dominio solo escribe los seis
 * valores de `ASSIST_ORIGIN`) se ignora sin sumar al total y sin lanzar —
 * un origen inesperado no es motivo de 500 en esta traducción.
 */
export function toCanales(rows: AssistOriginCountRow[]): TrialCanalesChecadas {
  const canales: TrialCanalesChecadas = {
    autoservicio: 0,
    capturaAdministrador: 0,
    sincronizacion: 0,
    manualLegado: 0,
    dispositivo: 0,
    checadorAdms: 0,
    total: 0,
  }

  for (const row of rows) {
    const campo = row.origin ? ORIGIN_TO_CANAL[row.origin] : undefined
    if (!campo) continue
    const cantidad = Number(row.cantidad)
    canales[campo] = cantidad
    canales.total += cantidad
  }

  return canales
}

/**
 * Bordes de `assist_punch_time_utc` que delimitan la ventana de la prueba en
 * día civil de México, INCLUSIVE en ambos extremos (RN-5: "el día de inicio y
 * el día de fin entran completos").
 *
 * Post-`multitenant` (integrado a esta rama tras USRH1789079078172):
 * `assist_punch_time_utc` es un instante UTC real para todos los canales —
 * quien escribe la checada ya convierte la hora del equipo
 * (`attendance-stats.repository.mysql.ts:2-13`, `attendance_clock.ts:11-18`).
 * Por eso el borde se resuelve con conversión de zona IANA lisa y llana
 * (`America/Mexico_City`, sin horario de verano desde 2022 pero con el DST
 * histórico correcto para fechas anteriores, porque la propia tzdata de
 * IANA ya lo modela) — **nunca** un offset calculado a mano: ese cálculo
 * quedó centralizado en `attendance_clock.ts` ("Nunca se calcula un offset a
 * mano fuera de este slice", línea 18) y esta función respeta esa regla.
 *
 * Este desglose usa la zona de negocio (México), no la del sitio del
 * colaborador (`SiteTimeZoneService`): la ventana de la prueba es una fecha
 * de facturación a nivel tenant (RN-5 dice "día civil de México" a secas),
 * no una fecha de turno por sucursal.
 */
export function resolveVentanaUtcBounds(
  inicio: string,
  fin: string
): { startUtc: string; endUtc: string } {
  const zone = getBusinessTimeZone()
  // `toSQL` de Luxon no tiene opción para omitir milisegundos (esa es de
  // `toISO`); se recorta el sufijo `.000` a mano — siempre 23 caracteres
  // (`yyyy-MM-dd HH:mm:ss.SSS`), nunca variable, porque parte de un
  // `DateTime` construido en este mismo archivo sin fracción de segundo.
  const startUtc = DateTime.fromISO(`${inicio}T00:00:00`, { zone })
    .toUTC()
    .toSQL({ includeOffset: false })!
    .slice(0, 19)
  const endUtc = DateTime.fromISO(`${fin}T23:59:59`, { zone })
    .toUTC()
    .toSQL({ includeOffset: false })!
    .slice(0, 19)
  return { startUtc, endUtc }
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
    canales: TrialCanalesChecadas | null
  }> {
    const { tenant, prueba } = await this.trialService.getTenantTrial(publicId)

    if (!prueba) {
      // Ausencia explícita, NUNCA un desglose en ceros (RN-7, USRH1789079078172):
      // una empresa que nunca tuvo prueba no recibe canales.
      return { tenant, ventana: null, frecuencia: null, serie: [], canales: null }
    }

    // `getTenantTrial` ya probó que el tenant existe (lanzó 404 si no); esta
    // segunda lectura es de una sola columna y nunca vuelve a resolver el
    // tenant por su cuenta (§8.2). `null` aquí sería una carrera imposible
    // bajo transacciones normales; se cubre de forma defensiva, sin motor.
    const businessUnitId = await this.trialService.resolveBusinessUnitId(publicId)
    if (businessUnitId === null) {
      return { tenant, ventana: null, frecuencia: null, serie: [], canales: null }
    }

    const ventana = { inicio: prueba.inicio, fin: prueba.finEfectivo }
    const [{ frecuencia, serie }, canales] = await Promise.all([
      this.runMotor(businessUnitId, ventana),
      this.resolveCanales(businessUnitId, ventana),
    ])

    return { tenant, ventana, frecuencia, serie, canales }
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

  /**
   * Desglose por canal de las checadas de la prueba (USRH1789079078172).
   *
   * Conteo aparte del motor de asistencia (RN-1 a RN-10 del ticket): NO
   * corre `AttendanceStatsService`, solo agrupa `assists` por `assist_origin`
   * dentro de la ventana ya resuelta `[inicio, finEfectivo]`, en día civil de
   * México (RN-5). Aislamiento por tenant explícito con `business_unit_id`
   * exacto (RN-8, misma disciplina que `runMotor`/RB-10 de 078171) — Knex
   * crudo, sin scope de Lucid, porque esta consulta corre a nivel Panel, por
   * encima de todas las empresas (mismo patrón que `platform_trial_service.ts`).
   *
   * `assist_origin IS NULL` (checadas de la demo del recorrido guiado, sin
   * canal) queda fuera por el propio `whereNotNull` (RN-3). `assist_active`
   * respeta la misma convención que el motor: solo `= 1`, sin excluir
   * `assist_deleted_at` (deuda declarada, `attendance-stats.repository.mysql.ts:384-385`).
   *
   * `assist_punch_time_utc` se lee como instante UTC real (post-`multitenant`,
   * ver `resolveVentanaUtcBounds`); no depende de que el respaldo
   * `attendance:backfill-biotime-utc` ya haya corrido sobre el histórico —
   * esa garantía es responsabilidad de esa migración/comando, no de este
   * servicio, igual que el resto de `attendance-stats` la asume sin marcarla.
   */
  private async resolveCanales(
    businessUnitId: number,
    ventana: { inicio: string; fin: string }
  ): Promise<TrialCanalesChecadas> {
    const { startUtc, endUtc } = resolveVentanaUtcBounds(ventana.inicio, ventana.fin)

    const rows = await db
      .from('assists')
      .where('business_unit_id', businessUnitId)
      .where('assist_active', 1)
      .whereNotNull('assist_origin')
      .andWhere('assist_punch_time_utc', '>=', startUtc)
      .andWhere('assist_punch_time_utc', '<=', endUtc)
      .groupBy('assist_origin')
      .select('assist_origin as origin')
      .count('* as cantidad')

    return toCanales(rows as AssistOriginCountRow[])
  }
}
