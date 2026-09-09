import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { getBusinessTimeZone, toBusinessDateString } from '../utils/business_date.js'
import { PLATFORM_METRIC_ERROR_CODES } from '../constants/platform_metric_error_codes.js'
import { PlatformMetricServiceError } from '../exceptions/platform_metric_service_error.js'

// ─── Tipos de retorno ─────────────────────────────────────────────────────────

/** Los siete números de un mes: cuatro movimientos, la base y las dos tasas. */
export interface PlatformFlowPeriod {
  altas: number
  conversiones: number
  cancelaciones: number
  morosidad: number
  suscripcionesInicioMes: number
  tasaCancelacionPct: number
  tasaMorosidadPct: number
}

/** Respuesta 200 completa: mes pedido + anterior, marca de parcialidad y días. */
export interface PlatformSubscriptionFlows {
  /** Mes pedido, `YYYY-MM`. */
  mes: string
  /** Mes calendario inmediato anterior, `YYYY-MM`. */
  mesAnterior: string
  /** `true` cuando `mes` es el mes en curso (cifras incompletas por definición). */
  parcial: boolean
  /** Día en curso del mes / días del mes. `null` cuando `parcial` es `false`. */
  diasTranscurridos: number | null
  diasDelMes: number | null
  actual: PlatformFlowPeriod
  anterior: PlatformFlowPeriod
}

/** Un mes sin movimiento se ve como ceros, nunca como error ni como hueco. */
const EMPTY_PERIOD: PlatformFlowPeriod = {
  altas: 0,
  conversiones: 0,
  cancelaciones: 0,
  morosidad: 0,
  suscripcionesInicioMes: 0,
  tasaCancelacionPct: 0,
  tasaMorosidadPct: 0,
}

// ─── Puras (sin base de datos) ────────────────────────────────────────────────

/**
 * Tasa en porcentaje con un decimal. `0` cuando la base es `0`: un mes sin
 * base no es un error de división, es un mes sin denominador.
 */
export function resolveFlowRate(numerador: number, base: number): number {
  if (base === 0) {
    return 0
  }
  return Math.round((numerador / base) * 1000) / 10
}

/**
 * Mes `YYYY-MM` desplazado `delta` meses. Las claves se comparan como texto:
 * su orden lexicográfico es el cronológico.
 */
function shiftMonth(month: string, delta: number): string {
  return DateTime.fromISO(`${month}-01`).plus({ months: delta }).toFormat('yyyy-MM')
}

/**
 * Fronteras semiabiertas `[inicioUtc, finUtc)` del mes civil en zona de negocio,
 * expresadas como instantes UTC (`YYYY-MM-DD HH:mm:ss`) para comparar columnas
 * TIMESTAMP/DATETIME almacenadas en UTC bajo sesión `timezone: 'Z'`.
 */
function monthBounds(month: string): { inicioUtc: string; finUtc: string; diasDelMes: number } {
  const zone = getBusinessTimeZone()
  const start = DateTime.fromISO(`${month}-01`, { zone }).startOf('day')
  return {
    inicioUtc: start.toUTC().toFormat('yyyy-MM-dd HH:mm:ss'),
    finUtc: start.plus({ months: 1 }).toUTC().toFormat('yyyy-MM-dd HH:mm:ss'),
    diasDelMes: start.daysInMonth as number,
  }
}

/** Frontera civil `[inicio, fin)` como fechas `YYYY-MM-DD`, para la columna DATE de corte. */
function monthDateBounds(month: string): { inicio: string; fin: string } {
  const start = DateTime.fromISO(`${month}-01`).startOf('day')
  return {
    inicio: start.toISODate()!,
    fin: start.plus({ months: 1 }).toISODate()!,
  }
}

// ─── Servicio ─────────────────────────────────────────────────────────────────

/**
 * Flujos de suscripción del mes (USRH1788052455656). Solo lectura.
 *
 * Consultas en paralelo, cada una con los dos `whereNull` de borrado lógico a
 * mano (las queries crudas de Knex no pasan por el hook de `SoftDeletes`):
 * altas, cancelaciones y conversiones por primer pago usan un rango UTC por mes
 * civil de negocio; morosidad y conversiones por reloj agrupan por DATE de corte;
 * más la base de cada mes.
 * Sin filtro de estado y sin "mejor suscripción por empresa": los agregados
 * suman sobre `billing_subscriptions` con filtro de fecha directo.
 *
 * Definiciones operacionales (una por cifra, sin mezcla):
 * - altas: `billing_subscription_subscribed_at` en el mes.
 * - cancelaciones: `billing_subscription_canceled_at` en el mes.
 * - conversiones: unión deduplicada por suscripción de (a) transiciones
 *   `trial_expired_covered` con `cut_date` en el mes y (b) el primer pago de la
 *   suscripción (`MIN(billing_payment_id)`) con `paid_at` en el mes. El pago que
 *   activa un `trialing` no deja bitácora: leer solo transitions subcuenta.
 * - morosidad: transiciones `period_expired` / `trial_expired_uncovered` con
 *   `cut_date` en el mes. Cliente vivo, no baja.
 * - suscripcionesInicioMes: `subscribed_at < inicio` y (`canceled_at IS NULL`
 *   o `canceled_at >= inicio`). Denominador único de ambas tasas.
 */
export default class PlatformSubscriptionFlowService {
  /**
   * Flujos del mes pedido y del inmediato anterior, calculados al momento.
   *
   * @param mes - Mes pedido `YYYY-MM`. Omitido = mes en curso.
   * @returns Los dos periodos, la marca de parcialidad y los días.
   */
  async getSubscriptionFlows(mes?: string): Promise<PlatformSubscriptionFlows> {
    const currentMonth = toBusinessDateString().slice(0, 7)
    const target = mes ?? currentMonth

    if (target > currentMonth) {
      throw new PlatformMetricServiceError(
        'Mes futuro rechazado',
        PLATFORM_METRIC_ERROR_CODES.VAL_INPUT,
        422,
        'no-fue-posible-obtener-los-flujos-de-suscripcion',
        'El mes pedido aún no empieza: pide el mes en curso o uno pasado.'
      )
    }

    const mesAnterior = shiftMonth(target, -1)
    const targetBounds = monthBounds(target)
    const anteriorBounds = monthBounds(mesAnterior)
    const dateRange = {
      inicio: monthDateBounds(mesAnterior).inicio,
      fin: monthDateBounds(target).fin,
    }

    const [
      altasActual,
      altasAnterior,
      cancelacionesActual,
      cancelacionesAnterior,
      morosidad,
      clockIds,
      firstPayIdsActual,
      firstPayIdsAnterior,
      baseActual,
      baseAnterior,
    ] = await Promise.all([
      this.loadDistinctCountForMonth('bs.billing_subscription_subscribed_at', target),
      this.loadDistinctCountForMonth('bs.billing_subscription_subscribed_at', mesAnterior),
      this.loadDistinctCountForMonth('bs.billing_subscription_canceled_at', target),
      this.loadDistinctCountForMonth('bs.billing_subscription_canceled_at', mesAnterior),
      this.loadDelinquencyCountsByMonth(dateRange.inicio, dateRange.fin),
      this.loadClockConversionIdsByMonth(dateRange.inicio, dateRange.fin),
      this.loadFirstPaymentConversionIdsForMonth(target),
      this.loadFirstPaymentConversionIdsForMonth(mesAnterior),
      this.loadBase(targetBounds.inicioUtc),
      this.loadBase(anteriorBounds.inicioUtc),
    ])

    const altas = new Map<string, number>([
      [target, altasActual],
      [mesAnterior, altasAnterior],
    ])
    const cancelaciones = new Map<string, number>([
      [target, cancelacionesActual],
      [mesAnterior, cancelacionesAnterior],
    ])
    const firstPayIds = new Map<string, string[]>([
      [target, firstPayIdsActual],
      [mesAnterior, firstPayIdsAnterior],
    ])

    const actual = this.buildPeriod(
      target,
      altas,
      cancelaciones,
      morosidad,
      clockIds,
      firstPayIds,
      baseActual
    )
    const anterior = this.buildPeriod(
      mesAnterior,
      altas,
      cancelaciones,
      morosidad,
      clockIds,
      firstPayIds,
      baseAnterior
    )

    const parcial = target === currentMonth
    const diasDelMes = parcial ? monthBounds(target).diasDelMes : null
    const diasTranscurridos = parcial
      ? DateTime.now().setZone(getBusinessTimeZone()).day
      : null

    return {
      mes: target,
      mesAnterior,
      parcial,
      diasTranscurridos,
      diasDelMes,
      actual,
      anterior,
    }
  }

  /**
   * Universo de los flujos: suscripciones de empresas vivas. Sin filtro de
   * estado — lo pone cada llamador. Los dos `whereNull` van a mano (gotcha del
   * área: Knex crudo no pasa por el hook).
   */
  private flowsBaseQuery() {
    return db
      .from('billing_subscriptions as bs')
      .join('business_units as bu', 'bu.business_unit_id', 'bs.business_unit_id')
      .whereNull('bs.billing_subscription_deleted_at')
      .whereNull('bu.business_unit_deleted_at')
  }

  /**
   * Conteo deduplicado por suscripción de una columna TIMESTAMP de
   * `billing_subscriptions` (`subscribed_at` o `canceled_at`) en un mes civil
   * de negocio, comparando contra fronteras UTC del mes.
   */
  private async loadDistinctCountForMonth(
    column: 'bs.billing_subscription_subscribed_at' | 'bs.billing_subscription_canceled_at',
    month: string
  ): Promise<number> {
    const { inicioUtc, finUtc } = monthBounds(month)
    const row = (await this.flowsBaseQuery()
      .where(column, '>=', inicioUtc)
      .where(column, '<', finUtc)
      .select(db.raw('COUNT(DISTINCT bs.billing_subscription_id) as total'))
      .first()) as Record<string, unknown> | null

    return Number(row?.total ?? 0)
  }

  /**
   * Morosidad por mes: transiciones `period_expired` / `trial_expired_uncovered`
   * con corte en el rango, deduplicadas por suscripción.
   *
   * `billing_subscription_transitions` no tiene soft delete; el filtro de
   * borrado va sobre la suscripción y la empresa del join.
   */
  private async loadDelinquencyCountsByMonth(
    inicio: string,
    fin: string
  ): Promise<Map<string, number>> {
    const rows = (await db
      .from('billing_subscription_transitions as bst')
      .join(
        'billing_subscriptions as bs',
        'bs.billing_subscription_id',
        'bst.billing_subscription_id'
      )
      .join('business_units as bu', 'bu.business_unit_id', 'bs.business_unit_id')
      .whereNull('bs.billing_subscription_deleted_at')
      .whereNull('bu.business_unit_deleted_at')
      .whereIn('bst.billing_subscription_transition_reason', [
        'period_expired',
        'trial_expired_uncovered',
      ])
      .where('bst.billing_subscription_transition_cut_date', '>=', inicio)
      .where('bst.billing_subscription_transition_cut_date', '<', fin)
      .select(
        db.raw(
          "DATE_FORMAT(bst.billing_subscription_transition_cut_date, '%Y-%m') as mes"
        )
      )
      .select(db.raw('COUNT(DISTINCT bst.billing_subscription_id) as total'))
      .groupByRaw(
        "DATE_FORMAT(bst.billing_subscription_transition_cut_date, '%Y-%m')"
      )) as Array<Record<string, unknown>>

    return new Map(rows.map((row) => [String(row.mes), Number(row.total ?? 0)]))
  }

  /**
   * Conversiones por reloj y por mes: transiciones `trial_expired_covered`.
   * Es solo un camino de los dos: el armado la une con el primer pago.
   *
   * @returns Mapa `YYYY-MM` → ids de suscripción (sin dedupe entre caminos: lo hace el armado).
   */
  private async loadClockConversionIdsByMonth(
    inicio: string,
    fin: string
  ): Promise<Map<string, string[]>> {
    const rows = (await db
      .from('billing_subscription_transitions as bst')
      .join(
        'billing_subscriptions as bs',
        'bs.billing_subscription_id',
        'bst.billing_subscription_id'
      )
      .join('business_units as bu', 'bu.business_unit_id', 'bs.business_unit_id')
      .whereNull('bs.billing_subscription_deleted_at')
      .whereNull('bu.business_unit_deleted_at')
      .where('bst.billing_subscription_transition_reason', 'trial_expired_covered')
      .where('bst.billing_subscription_transition_cut_date', '>=', inicio)
      .where('bst.billing_subscription_transition_cut_date', '<', fin)
      .select(
        db.raw(
          "DATE_FORMAT(bst.billing_subscription_transition_cut_date, '%Y-%m') as mes"
        )
      )
      .select('bst.billing_subscription_id as subscriptionId')) as Array<
      Record<string, unknown>
    >

    return this.groupIdsByMonth(rows)
  }

  /**
   * Conversiones por primer pago en un mes civil de negocio: el pago con
   * `MIN(billing_payment_id)` de cada suscripción viva, cuando cayó en el rango
   * UTC del mes.
   *
   * `billing_payments` es append-only sin borrado: no lleva filtro de borrado
   * propio; el universo lo acotan la suscripción y la empresa.
   */
  private async loadFirstPaymentConversionIdsForMonth(month: string): Promise<string[]> {
    const { inicioUtc, finUtc } = monthBounds(month)
    const rows = (await db
      .from('billing_payments as bp')
      .join(
        'billing_subscriptions as bs',
        'bs.billing_subscription_id',
        'bp.billing_subscription_id'
      )
      .join('business_units as bu', 'bu.business_unit_id', 'bs.business_unit_id')
      .whereNull('bs.billing_subscription_deleted_at')
      .whereNull('bu.business_unit_deleted_at')
      .whereRaw(
        'bp.billing_payment_id = (SELECT MIN(bp2.billing_payment_id) FROM billing_payments bp2 WHERE bp2.billing_subscription_id = bp.billing_subscription_id)'
      )
      .where('bp.billing_payment_paid_at', '>=', inicioUtc)
      .where('bp.billing_payment_paid_at', '<', finUtc)
      .select('bp.billing_subscription_id as subscriptionId')) as Array<
      Record<string, unknown>
    >

    return rows.map((row) => String(row.subscriptionId))
  }

  /**
   * Agrupa filas `(mes, subscriptionId)` en un mapa mes → ids.
   */
  private groupIdsByMonth(
    rows: Array<Record<string, unknown>>
  ): Map<string, string[]> {
    const grouped = new Map<string, string[]>()
    for (const row of rows) {
      const month = String(row.mes)
      const ids = grouped.get(month) ?? []
      ids.push(String(row.subscriptionId))
      grouped.set(month, ids)
    }
    return grouped
  }

  /**
   * Base del mes: existían antes del inicio UTC y no estaban canceladas al primer día.
   */
  private async loadBase(inicioUtc: string): Promise<number> {
    const row = (await this.flowsBaseQuery()
      .where('bs.billing_subscription_subscribed_at', '<', inicioUtc)
      .whereRaw(
        '(bs.billing_subscription_canceled_at IS NULL OR bs.billing_subscription_canceled_at >= ?)',
        [inicioUtc]
      )
      .select(db.raw('COUNT(*) as total'))
      .first()) as Record<string, unknown> | null

    return Number(row?.total ?? 0)
  }

  /**
   * Arma un periodo: lee los mapas por mes (0 cuando el mes no trae filas),
   * une los dos caminos de conversión en un `Set` y deriva las tasas.
   */
  private buildPeriod(
    month: string,
    altas: Map<string, number>,
    cancelaciones: Map<string, number>,
    morosidad: Map<string, number>,
    clockIds: Map<string, string[]>,
    firstPayIds: Map<string, string[]>,
    base: number
  ): PlatformFlowPeriod {
    const period: PlatformFlowPeriod = {
      ...EMPTY_PERIOD,
      altas: altas.get(month) ?? 0,
      cancelaciones: cancelaciones.get(month) ?? 0,
      morosidad: morosidad.get(month) ?? 0,
      suscripcionesInicioMes: base,
    }
    period.conversiones = new Set([
      ...(clockIds.get(month) ?? []),
      ...(firstPayIds.get(month) ?? []),
    ]).size
    period.tasaCancelacionPct = resolveFlowRate(period.cancelaciones, base)
    period.tasaMorosidadPct = resolveFlowRate(period.morosidad, base)
    return period
  }
}
