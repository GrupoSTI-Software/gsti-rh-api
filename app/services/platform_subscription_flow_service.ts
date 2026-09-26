import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { getBusinessTimeZone, toBusinessDateString } from '../utils/business_date.js'
import { PLATFORM_METRIC_ERROR_CODES } from '../constants/platform_metric_error_codes.js'
import { PlatformMetricServiceError } from '../exceptions/platform_metric_service_error.js'
import type { BillingSubscriptionTransitionReason } from '#models/billing_subscription_transition'

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
    diasDelMes: start.daysInMonth ?? 0,
  }
}

/** Frontera civil `[inicio, fin)` como fechas `YYYY-MM-DD`, para la columna DATE de corte. */
function monthDateBounds(month: string): { inicio: string; fin: string } {
  const zone = getBusinessTimeZone()
  const start = DateTime.fromISO(`${month}-01`, { zone }).startOf('day')
  return {
    inicio: start.toISODate()!,
    fin: start.plus({ months: 1 }).toISODate()!,
  }
}

/**
 * El primer pago de una suscripción: el de `paid_at` más temprano, y a igual
 * instante el `id` menor. Texto idéntico, carácter por carácter, al que ya
 * sostenía `loadFirstPaymentConversionIdsForMonth` antes de la extracción de
 * USRH1789101459905 — se sube a constante para que el lector mensual y el
 * lector por suscripción compartan la misma definición, sin posibilidad de
 * que se separen con el tiempo. Se apoya en el índice
 * `(billing_subscription_id, billing_payment_paid_at)`
 * (`database/migrations/1784300000014_create_billing_payments_table.ts:52-53`).
 */
const FIRST_PAYMENT_OF_SUBSCRIPTION =
  'bp.billing_payment_id = (SELECT bp2.billing_payment_id FROM billing_payments bp2 WHERE bp2.billing_subscription_id = bp.billing_subscription_id ORDER BY bp2.billing_payment_paid_at ASC, bp2.billing_payment_id ASC LIMIT 1)'

/** Las dos razones de transición que nacen de que la prueba terminó (excluye `period_expired`). */
const TRIAL_TRANSITION_REASONS: BillingSubscriptionTransitionReason[] = [
  'trial_expired_covered',
  'trial_expired_uncovered',
]

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
 *   `trial_expired_covered` con `cut_date` en el mes y (b) el primer pago
 *   (el de `paid_at` más temprano) de una suscripción que sí tuvo prueba
 *   (`trial_ends_at IS NOT NULL`, USRH1789151097443 RN-01) con `paid_at` en
 *   el mes. El pago que
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
    const diasDelMes = parcial ? targetBounds.diasDelMes : null
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
   * Universo compartido de "primer pago de la suscripción" (USRH1789101459905
   * §7.2): `billing_payments` + join a `billing_subscriptions` + join a
   * `business_units`, los dos `whereNull` a mano y la subconsulta
   * correlacionada de `FIRST_PAYMENT_OF_SUBSCRIPTION`. Dueño único de este
   * SQL: el lector mensual (`loadFirstPaymentConversionIdsForMonth`) y el
   * lector por suscripción (`getFirstPaymentBySubscription`) se construyen
   * **encima** de esta misma base, así que no pueden divergir.
   */
  private firstPaymentBaseQuery() {
    return db
      .from('billing_payments as bp')
      .join(
        'billing_subscriptions as bs',
        'bs.billing_subscription_id',
        'bp.billing_subscription_id'
      )
      .join('business_units as bu', 'bu.business_unit_id', 'bs.business_unit_id')
      .whereNull('bs.billing_subscription_deleted_at')
      .whereNull('bu.business_unit_deleted_at')
      .whereRaw(FIRST_PAYMENT_OF_SUBSCRIPTION)
  }

  /**
   * Universo compartido de "transición de fin de prueba de la suscripción"
   * (USRH1789101459905 §7.2): `billing_subscription_transitions` + los dos
   * joins + los dos `whereNull` + acotado a las dos razones que nacen de que
   * la prueba terminó (`trial_expired_covered` / `trial_expired_uncovered`,
   * excluye `period_expired`: esa es morosidad de periodo, no de prueba).
   */
  private trialTransitionsBaseQuery() {
    return db
      .from('billing_subscription_transitions as bst')
      .join(
        'billing_subscriptions as bs',
        'bs.billing_subscription_id',
        'bst.billing_subscription_id'
      )
      .join('business_units as bu', 'bu.business_unit_id', 'bs.business_unit_id')
      .whereNull('bs.billing_subscription_deleted_at')
      .whereNull('bu.business_unit_deleted_at')
      .whereIn('bst.billing_subscription_transition_reason', TRIAL_TRANSITION_REASONS)
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
    const rows = (await this.trialTransitionsBaseQuery()
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
   * Conversiones por primer pago en un mes civil de negocio: el primer pago
   * (`paid_at` más temprano; a igual instante, el id menor) de cada
   * suscripción viva que sí tuvo prueba, cuando cayó en el rango UTC del mes.
   *
   * Solo cuentan suscripciones con `trial_ends_at IS NOT NULL` (USRH1789151097443
   * RN-01/RN-02): una de pago directo sin prueba es alta, no conversión (el
   * contrato dice "pasó de prueba a pagando"). NUNCA `contracted_trial_days`
   * — se reescribe en cada cambio de plan (`changePlan()`) y una empresa que
   * entró pagando y luego cambió a un plan con días de prueba quedaría
   * marcada, desde ese cambio, como si hubiera tenido prueba sin haberla
   * tenido nunca. `trial_ends_at` se escribe una sola vez, al dar de alta, y
   * ninguna operación lo vuelve a tocar.
   *
   * Este filtro de "empresa con prueba" es del universo de la tarjeta —
   * `getFirstPaymentBySubscription` (lector por suscripción, más abajo) NO lo
   * lleva a propósito: quien elige la suscripción de la prueba ya es
   * `PlatformTrialService` vía `USRH1789079078169` (§7.3 del spec de
   * USRH1789101459905). Duplicarlo ahí metería el defecto conocido del
   * marcador de la tarjeta también en la ficha.
   */
  private async loadFirstPaymentConversionIdsForMonth(month: string): Promise<string[]> {
    const { inicioUtc, finUtc } = monthBounds(month)
    const rows = (await this.firstPaymentBaseQuery()
      .whereNotNull('bs.billing_subscription_trial_ends_at')
      .where('bp.billing_payment_paid_at', '>=', inicioUtc)
      .where('bp.billing_payment_paid_at', '<', finUtc)
      .select('bp.billing_subscription_id as subscriptionId')) as Array<
      Record<string, unknown>
    >

    return rows.map((row) => String(row.subscriptionId))
  }

  /**
   * Primer pago de cada suscripción del lote, sin filtro de mes ni de "tuvo
   * prueba" (USRH1789101459905 §7.2 paso 4): quien decide si aplica es el
   * llamador (`PlatformTrialService`, que ya eligió la suscripción de la
   * prueba). Guarda de lote vacío antes de tocar la base — `whereIn([])`
   * devuelve todo en algunos motores.
   *
   * Claves del mapa: `string`. `billing_subscription_id` es `bigInteger`
   * (`1784300000014_create_billing_payments_table.ts:19`) y el resto del
   * área ya normaliza con `String(...)` en ambos extremos; mezclar `string`
   * con `number` produce un `Map` que nunca acierta.
   */
  async getFirstPaymentBySubscription(subscriptionIds: string[]): Promise<Map<string, Date>> {
    const result = new Map<string, Date>()
    if (subscriptionIds.length === 0) {
      return result
    }

    const rows = (await this.firstPaymentBaseQuery()
      .whereIn('bp.billing_subscription_id', subscriptionIds)
      .select(
        'bp.billing_subscription_id as subscriptionId',
        'bp.billing_payment_paid_at as paidAt'
      )) as Array<{ subscriptionId: number | string; paidAt: Date }>

    for (const row of rows) {
      result.set(String(row.subscriptionId), row.paidAt)
    }
    return result
  }

  /**
   * Transición de fin de prueba de cada suscripción del lote (USRH1789101459905
   * §7.2 paso 5). El UNIQUE `(subscription_id, cut_date)` es idempotencia
   * **diaria**, no "una transición por suscripción" (R16): una suscripción
   * puede traer una `trial_*` y, más tarde, una `period_expired` — la
   * primera fila por suscripción, ordenada por `cut_date ASC, id ASC`, es
   * siempre la de fin de prueba porque `trialTransitionsBaseQuery()` ya
   * excluye `period_expired`.
   */
  async getTrialTransitionBySubscription(
    subscriptionIds: string[]
  ): Promise<Map<string, { reason: BillingSubscriptionTransitionReason; cutDate: unknown }>> {
    const result = new Map<string, { reason: BillingSubscriptionTransitionReason; cutDate: unknown }>()
    if (subscriptionIds.length === 0) {
      return result
    }

    const rows = (await this.trialTransitionsBaseQuery()
      .whereIn('bst.billing_subscription_id', subscriptionIds)
      .orderBy('bst.billing_subscription_transition_cut_date', 'asc')
      .orderBy('bst.billing_subscription_transition_id', 'asc')
      .select(
        'bst.billing_subscription_id as subscriptionId',
        'bst.billing_subscription_transition_reason as reason',
        'bst.billing_subscription_transition_cut_date as cutDate'
      )) as Array<{
      subscriptionId: number | string
      reason: BillingSubscriptionTransitionReason
      cutDate: unknown
    }>

    for (const row of rows) {
      const key = String(row.subscriptionId)
      // Primera fila por suscripción gana (ya viene ordenada ASC): es la
      // transición de fin de prueba, nunca la más reciente.
      if (!result.has(key)) {
        result.set(key, { reason: row.reason, cutDate: row.cutDate })
      }
    }
    return result
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
      .select(db.raw('COUNT(DISTINCT bs.billing_subscription_id) as total'))
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
