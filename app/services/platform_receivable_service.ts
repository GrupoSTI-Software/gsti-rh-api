import db from '@adonisjs/lucid/services/db'
import {
  daysBetweenBusinessDates,
  toBusinessDateString,
  toCalendarIsoDate,
} from '../utils/business_date.js'
import {
  PENDING_INCREASE_AMOUNT_COLUMN,
  PENDING_INCREASE_CHANGES_TABLE,
  pendingIncreaseChangeConditionSql,
} from '../helpers/billing_pending_increase_change_filter.js'

// ─── Tipos de retorno ─────────────────────────────────────────────────────────

/** Tramo de antigüedad de un adeudo vencido. Las llaves son las del contrato. */
export type ReceivableBucket = 'hasta30' | 'de31a60' | 'mas60'

/**
 * Cotas superiores, en días de atraso, de los dos primeros tramos (regla 5).
 * Es la única definición de los bordes: la usan el helper puro de la fila y el
 * `CASE` del resumen, para que no puedan desincronizarse.
 */
export const RECEIVABLE_BUCKET_UPPER_BOUNDS = { hasta30: 30, de31a60: 60 } as const

/** Cuántos morosos y cuánto dinero hay en un tramo. */
export interface ReceivableBucketSlice {
  tenants: number
  montoCents: number
}

/**
 * Lectura de conjunto de la cartera vencida, calculada sobre el universo
 * **completo** (regla 9): nunca sobre la página que se está devolviendo.
 */
export interface ReceivablesSummary {
  /** Suma de los importes con IVA de toda la cartera, en centavos enteros. */
  totalVencidoCents: number
  /** Cuántas empresas están en `past_due`. Es también el `meta.total`. */
  tenantsVencidos: number
  /** Saldo a favor agregado. Informativo: NUNCA se resta del adeudo (regla 6). */
  saldoAFavorCents: number
  porBucket: Record<ReceivableBucket, ReceivableBucketSlice>
  /** Fecha de negocio del cálculo, `YYYY-MM-DD`. */
  calculadoAl: string
  /**
   * Suma del adeudo por aumento de asientos de **toda** la cartera, en centavos
   * (regla 6). Es facturación pendiente, no cobranza: **nunca** se suma a
   * `totalVencidoCents` ni se publica junto con él como una sola cifra (regla 1).
   */
  totalAdeudoPorAumentoCents: number
  /** Cuántas empresas tienen adeudo por aumento mayor a cero. No es un subconjunto de `tenantsVencidos`. */
  tenantsConAdeudoPorAumento: number
}

/** Una empresa morosa tal como viaja en el contrato. Sin identificadores internos. */
export interface ReceivableTenantItem {
  businessUnitPublicId: string
  businessUnitName: string
  /** `0` cuando la empresa está desactivada. La vista lo marca; no filtra (regla 8). */
  businessUnitActive: number
  planName: string | null
  /** `contracted_total` (CON IVA) en centavos enteros. Un solo periodo (regla 3). */
  montoVencidoCents: number
  diasAtraso: number
  bucket: ReceivableBucket
  /** `current_period_end` recortado a `YYYY-MM-DD`. */
  periodoFin: string
  /** Saldo a favor de la empresa. Viaja aparte y no se netea (regla 6). */
  saldoAFavorCents: number
  /**
   * Adeudo por aumento de asientos de la empresa, en centavos: la suma de todos
   * sus aumentos pendientes de pago (regla 3). `0` cuando no tiene ninguno.
   *
   * Es facturación pendiente y viaja aparte de `montoVencidoCents` a propósito:
   * sumarlos convertiría a un cliente que creció en un moroso (regla 1).
   */
  adeudoPorAumentoCents: number
}

/**
 * Suscripción cancelada cuyo último periodo cerró sin pagarse **antes** de que
 * la empresa se fuera (regla 7). Conjunto ajeno a la cartera vencida: no se
 * cobra por la vía recurrente y su importe jamás suma al total vencido.
 *
 * La deuda va congelada: no trae `bucket` ni días de atraso contra hoy, porque
 * ya no es una cobranza en curso y un tramo de antigüedad sobre una deuda
 * muerta invitaría a leerla como si lo fuera.
 */
export interface CanceledReceivableItem {
  businessUnitPublicId: string
  businessUnitName: string
  /** `0` cuando la empresa está desactivada. Viaja igual que en la cartera vencida. */
  businessUnitActive: number
  planName: string | null
  /** `contracted_total` (CON IVA) en centavos enteros. Congelado. */
  montoAdeudadoCents: number
  /** `current_period_end` recortado a `YYYY-MM-DD`. */
  periodoFin: string
  /** `canceled_at` recortado a `YYYY-MM-DD`. */
  canceladoEl: string
  /** Días civiles completos entre `periodoFin` y `canceladoEl`. Siempre `0` o más. */
  diasAtrasoAlCancelar: number
}

/** Parámetros de paginación para el listado de morosos de la plataforma. */
export interface ListReceivablesFilters {
  page?: number
  limit?: number
}

/** Respuesta paginada con resumen global de cartera vencida y filas del tramo. */
export interface ListReceivablesResult {
  data: {
    resumen: ReceivablesSummary
    tenants: ReceivableTenantItem[]
    /**
     * Canceladas con adeudo (regla 6). Conjunto **ajeno** a `tenants[]` y a
     * `resumen`: ni una de estas filas entra al universo `past_due` ni suma al
     * total vencido. No se pagina en esta rebanada (hoy son unidades).
     *
     * Invariante del contrato: ningún campo de la respuesta es —ni podrá ser—
     * la suma de `resumen.totalVencidoCents` y el importe de este arreglo.
     */
    canceladas: CanceledReceivableItem[]
  }
  meta: { total: number; page: number; limit: number; lastPage: number }
}

// ─── Helpers puros ────────────────────────────────────────────────────────────

/**
 * Ubica un atraso en su tramo de antigüedad (regla 5). Cada atraso cae en uno
 * solo. Función pura: no lee el reloj ni la base.
 *
 * @param diasAtraso - Días completos de atraso, `0` o más.
 * @returns El tramo al que pertenece.
 */
export function resolveReceivableBucket(diasAtraso: number): ReceivableBucket {
  if (diasAtraso <= RECEIVABLE_BUCKET_UPPER_BOUNDS.hasta30) return 'hasta30'
  if (diasAtraso <= RECEIVABLE_BUCKET_UPPER_BOUNDS.de31a60) return 'de31a60'
  return 'mas60'
}

/**
 * Importe contratado con IVA convertido a centavos enteros, en SQL.
 *
 * La conversión va en la consulta y no en JavaScript porque la columna es
 * `DECIMAL(12,2)`: multiplicar por 100 en JS y sumar sembraría error de punto
 * flotante en el total de toda la cartera. En MySQL la aritmética sobre
 * `DECIMAL` es exacta y la suma termina siendo una suma de enteros.
 */
const CONTRACTED_TOTAL_CENTS_SQL =
  'CAST(ROUND(bs.billing_subscription_contracted_total * 100) AS SIGNED)'

/**
 * Expresión que clasifica cada suscripción en su tramo. Los `?` se ligan, en
 * orden: fecha de negocio, fecha de negocio (red del COALESCE), cota de
 * `hasta30`, fecha de negocio, fecha de negocio (red del COALESCE), cota de
 * `de31a60`. El COALESCE replica la red del DTO: periodo nulo → hoy → 0 días.
 */
const BUCKET_CASE_SQL = `
  CASE
    WHEN DATEDIFF(?, COALESCE(DATE(bs.billing_subscription_current_period_end), ?)) <= ? THEN 'hasta30'
    WHEN DATEDIFF(?, COALESCE(DATE(bs.billing_subscription_current_period_end), ?)) <= ? THEN 'de31a60'
    ELSE 'mas60'
  END`

/**
 * Adeudo por aumento de la suscripción de la fila, en centavos.
 *
 * Va como escalar correlacionado y no como `LEFT JOIN` agrupado porque el
 * universo de filas ya está definido por su propio `WHERE`: un join agregado
 * obligaría a agrupar toda la consulta paginada por suscripción para no
 * multiplicar filas cuando hay más de un aumento pendiente (regla 3).
 *
 * `COALESCE` a `0` porque la ausencia de aumentos es un cero explícito, no un
 * nulo: la columna del tablero no desaparece cuando no hay adeudo (regla 8).
 *
 * No se multiplica por 100: la columna del prorrateo ya está en centavos.
 */
const PENDING_INCREASE_DEBT_CENTS_SQL = `COALESCE((
    SELECT SUM(pic.${PENDING_INCREASE_AMOUNT_COLUMN})
    FROM ${PENDING_INCREASE_CHANGES_TABLE} as pic
    WHERE pic.billing_subscription_id = bs.billing_subscription_id
      AND ${pendingIncreaseChangeConditionSql('pic')}
  ), 0)`

// ─── Servicio ─────────────────────────────────────────────────────────────────

/**
 * Cartera de la plataforma: el vencido y el adeudo por aumento de asientos
 * (USRH1788052455651 + USRH1788052455652).
 *
 * Son **dos números independientes** y así viajan: el vencido es cobranza, el
 * adeudo por aumento es facturación pendiente. Ningún campo de este servicio es
 * —ni podrá ser— su suma (regla 1). La antigüedad y los tramos son propios del
 * vencido: el adeudo por aumento no tiene edad (regla 5).
 *
 * Solo lectura: no escribe, no abre transacción y no tiene efectos secundarios.
 * No recalcula la morosidad — lee el estado `past_due` que el reloj de cobranza
 * mantiene todos los días (`billing_subscription_clock_service.ts:229-239`).
 *
 * Tampoco aplica la regla de "mejor suscripción por empresa" del listado de
 * tenants: el universo se define por estado directo sobre `billing_subscriptions`,
 * y una empresa con dos suscripciones vencidas vivas es imposible por el candado
 * de unicidad (`billing_subscription_live_business_unit_id`, UNIQUE).
 */
export default class PlatformReceivableService {
  /**
   * Resumen de toda la cartera vencida más una página de morosos.
   *
   * @param filters - Página y tamaño de página. Sin filtros de tramo ni de tenant.
   * @returns Resumen sobre el universo completo, filas de la página y metadatos.
   */
  async listReceivables(filters: ListReceivablesFilters = {}): Promise<ListReceivablesResult> {
    const page = filters.page ?? 1
    const limit = Math.max(1, Math.min(filters.limit ?? 20, 100))
    const offset = (page - 1) * limit
    // Una sola lectura del reloj para las dos consultas: el resumen y las filas
    // tienen que hablar del mismo día aunque el proceso cruce la medianoche.
    const businessDate = toBusinessDateString()

    const resumen = await this.loadSummary(businessDate)
    const tenants = await this.loadPage(businessDate, offset, limit)
    const canceladas = await this.loadCanceled()

    // El total sale del conteo agregado, no del largo del arreglo paginado (regla 9).
    const total = resumen.tenantsVencidos
    const lastPage = Math.max(1, Math.ceil(total / limit))

    return { data: { resumen, tenants, canceladas }, meta: { total, page, limit, lastPage } }
  }

  /**
   * Universo de la cartera vencida (regla 1): suscripciones en `past_due`, vivas,
   * de empresas vivas.
   *
   * Los dos `whereNull` van a mano porque las queries crudas de Knex no pasan por
   * el hook de `SoftDeletes` (gotcha del área, `platform_device_service.ts:179-180`).
   * `business_unit_active = 0` NO excluye: la desactivación no perdona la deuda
   * (regla 8). `canceled` queda fuera aunque deba (regla 7).
   */
  private overdueQuery() {
    return db
      .from('billing_subscriptions as bs')
      .join('business_units as bu', 'bu.business_unit_id', 'bs.business_unit_id')
      .where('bs.billing_subscription_status', 'past_due')
      .whereNull('bs.billing_subscription_deleted_at')
      .whereNull('bu.business_unit_deleted_at')
  }

  /**
   * Universo de canceladas con adeudo (regla 7): suscripciones canceladas, vivas
   * en la base, de empresas vivas, cuyo periodo cerró **antes** del día en que
   * la empresa canceló.
   *
   * El criterio se deriva de dos fechas porque el modelo **no tiene marca** de
   * "canceló debiendo": `past_due` es absorbente y no crea filas de adeudo
   * (`billing_subscription_clock_service.ts:236-239`), y `cancelWithin` no
   * escribe bitácora. La otra vía candidata —buscar una transición previa a
   * `past_due` en `billing_subscription_transitions`— se descartó: esa tabla
   * solo guarda las tres razones del reloj y tiene alrededor de un mes de
   * historia, así que subreportaría en silencio.
   *
   * Se compara a nivel de día con `DATE(...)` en las dos columnas: son
   * `TIMESTAMP` y la hora no decide si el periodo quedó impago. Riesgo
   * declarado y aceptado: una cancelación registrada el **mismo día** del
   * vencimiento queda fuera.
   *
   * Si `current_period_end` fuera nulo, `DATE(NULL) < …` evalúa a NULL y la fila
   * no pasa el filtro. Es lo correcto: sin fecha de cierre no se puede afirmar
   * que el periodo quedó impago.
   *
   * Los dos `whereNull` van a mano porque las queries crudas de Knex no pasan
   * por el hook de `SoftDeletes`. `business_unit_active = 0` NO excluye: la
   * desactivación no perdona la deuda.
   */
  private canceledWithDebtQuery() {
    return db
      .from('billing_subscriptions as bs')
      .join('business_units as bu', 'bu.business_unit_id', 'bs.business_unit_id')
      .where('bs.billing_subscription_status', 'canceled')
      .whereNull('bs.billing_subscription_deleted_at')
      .whereNull('bu.business_unit_deleted_at')
      .whereRaw(
        'DATE(bs.billing_subscription_current_period_end) < DATE(bs.billing_subscription_canceled_at)'
      )
  }

  /**
   * Resumen sobre la cartera completa, en una sola consulta agrupada por tramo.
   * No recorre el arreglo paginado: si mañana hay ciento veinte morosos, aquí
   * cuentan los ciento veinte (regla 9).
   *
   * @param businessDate - Fecha de negocio de hoy, `YYYY-MM-DD`.
   * @returns Totales, saldo a favor agregado y el reparto por tramo.
   */
  private async loadSummary(businessDate: string): Promise<ReceivablesSummary> {
    const bucketBindings = [
      businessDate,
      businessDate,
      RECEIVABLE_BUCKET_UPPER_BOUNDS.hasta30,
      businessDate,
      businessDate,
      RECEIVABLE_BUCKET_UPPER_BOUNDS.de31a60,
    ]

    const rows = (await this.overdueQuery()
      .select(db.raw(`${BUCKET_CASE_SQL} as bucket`, bucketBindings))
      .select(db.raw('COUNT(*) as tenants'))
      .select(db.raw(`COALESCE(SUM(${CONTRACTED_TOTAL_CENTS_SQL}), 0) as montoCents`))
      .select(
        db.raw('COALESCE(SUM(bs.billing_subscription_credit_balance_cents), 0) as saldoCents')
      )
      .groupByRaw('bucket')) as Array<Record<string, unknown>>

    // Los tres tramos arrancan en cero y solo se sobrescriben los que la consulta
    // devolvió: un tramo sin morosos se publica en cero, no se omite.
    const porBucket: Record<ReceivableBucket, ReceivableBucketSlice> = {
      hasta30: { tenants: 0, montoCents: 0 },
      de31a60: { tenants: 0, montoCents: 0 },
      mas60: { tenants: 0, montoCents: 0 },
    }

    let tenantsVencidos = 0
    let totalVencidoCents = 0
    let saldoAFavorCents = 0

    for (const row of rows) {
      const bucket = row.bucket as ReceivableBucket
      const tenants = Number(row.tenants ?? 0)
      const montoCents = Number(row.montoCents ?? 0)

      porBucket[bucket] = { tenants, montoCents }
      tenantsVencidos += tenants
      totalVencidoCents += montoCents
      saldoAFavorCents += Number(row.saldoCents ?? 0)
    }

    const pendingIncrease = await this.loadPendingIncreaseTotals()

    return {
      totalVencidoCents,
      tenantsVencidos,
      saldoAFavorCents,
      porBucket,
      calculadoAl: businessDate,
      totalAdeudoPorAumentoCents: pendingIncrease.totalCents,
      tenantsConAdeudoPorAumento: pendingIncrease.tenants,
    }
  }

  /**
   * Los dos totales del adeudo por aumento, sobre **toda** la cartera (regla 6).
   *
   * Consulta propia y no un campo más del resumen del vencido: el universo del
   * adeudo no es el del vencido — incluye a las empresas al corriente — y
   * mezclarlos en un solo `GROUP BY bucket` habría metido el adeudo a los tramos
   * de antigüedad, que son propios del vencido (regla 5).
   *
   * Agrupa por suscripción y no por empresa para que un aumento pendiente que
   * cuelga de una suscripción cancelada o borrada no se le atribuya a la
   * suscripción viva de la misma empresa. El candado
   * `billing_subscription_live_business_unit_id` (UNIQUE) garantiza a lo más una
   * suscripción viva por empresa, así que contar suscripciones con adeudo es
   * contar empresas con adeudo.
   *
   * La suma y el conteo se cierran en JavaScript sobre las filas agrupadas —y no
   * con un `HAVING` dentro de una subconsulta— porque los aumentos pendientes de
   * la plataforma son unidades: el arreglo intermedio es minúsculo y la
   * intención queda legible. `canceled` queda fuera: sus adeudos son materia de
   * `canceladas[]`, no de este número.
   *
   * Los tres `whereNull` van a mano porque las queries crudas de Knex no pasan
   * por el hook de `SoftDeletes`. `business_unit_active = 0` NO excluye: la
   * desactivación no perdona la deuda (regla 7).
   *
   * @returns Total en centavos y cuántas empresas tienen adeudo mayor a cero.
   */
  private async loadPendingIncreaseTotals(): Promise<{ totalCents: number; tenants: number }> {
    const rows = (await db
      .from(`${PENDING_INCREASE_CHANGES_TABLE} as pic`)
      .join(
        'billing_subscriptions as bs',
        'bs.billing_subscription_id',
        'pic.billing_subscription_id'
      )
      .join('business_units as bu', 'bu.business_unit_id', 'bs.business_unit_id')
      .whereRaw(pendingIncreaseChangeConditionSql('pic'))
      .whereNot('bs.billing_subscription_status', 'canceled')
      .whereNull('bs.billing_subscription_deleted_at')
      .whereNull('bu.business_unit_deleted_at')
      .groupBy('bs.billing_subscription_id')
      .select(
        db.raw(`COALESCE(SUM(pic.${PENDING_INCREASE_AMOUNT_COLUMN}), 0) as adeudoCents`)
      )) as Array<Record<string, unknown>>

    let totalCents = 0
    let tenants = 0

    for (const row of rows) {
      const adeudoCents = Number(row.adeudoCents ?? 0)
      // Un prorrateo de cero (un aumento pedido en prueba) no es adeudo: suma
      // cero y no cuenta como empresa con adeudo. Mismo umbral que el helper.
      if (adeudoCents <= 0) continue
      totalCents += adeudoCents
      tenants += 1
    }

    return { totalCents, tenants }
  }

  /**
   * Página de morosos en el orden fijo del contrato: más atrasados primero,
   * luego los de mayor importe, y el nombre comercial como desempate final.
   *
   * `diasAtraso DESC` se traduce a `DATE(current_period_end) ASC` para que el
   * orden lo resuelva la base y la paginación sea real. Se ordena por la fecha
   * civil y no por el timestamp porque dos periodos que vencieron el mismo día a
   * distinta hora tienen el mismo `diasAtraso` y deben desempatar por importe.
   *
   * @param businessDate - Fecha de negocio de hoy, `YYYY-MM-DD`.
   * @param offset - Filas a saltar.
   * @param limit - Filas a devolver.
   * @returns Las filas de la página, ya como DTO plano.
   */
  private async loadPage(
    businessDate: string,
    offset: number,
    limit: number
  ): Promise<ReceivableTenantItem[]> {
    const rows = (await this.overdueQuery()
      // Excepción deliberada al whereNull de cada tabla tocada: se muestra el nombre del plan aunque esté dado de baja (mismo criterio que platform_tenant_service).
      .leftJoin('billing_plans as bp', 'bp.billing_plan_id', 'bs.billing_plan_id')
      .select([
        'bu.business_unit_public_id as businessUnitPublicId',
        'bu.business_unit_name as businessUnitName',
        'bu.business_unit_active as businessUnitActive',
        'bp.billing_plan_name as planName',
        'bs.billing_subscription_current_period_end as periodoFin',
        'bs.billing_subscription_credit_balance_cents as saldoAFavorCents',
      ])
      .select(db.raw(`${CONTRACTED_TOTAL_CENTS_SQL} as montoVencidoCents`))
      .select(db.raw(`${PENDING_INCREASE_DEBT_CENTS_SQL} as adeudoPorAumentoCents`))
      // Misma red que el DTO: periodo nulo se ordena como si venciera hoy.
      .orderByRaw('COALESCE(DATE(bs.billing_subscription_current_period_end), ?) asc', [
        businessDate,
      ])
      .orderByRaw(`${CONTRACTED_TOTAL_CENTS_SQL} desc`)
      .orderBy('bu.business_unit_name', 'asc')
      .offset(offset)
      .limit(limit)) as Array<Record<string, unknown>>

    return rows.map((row) => this.toTenantItem(row, businessDate))
  }

  /**
   * DTO plano de una fila, armado campo por campo con casteo explícito. No sale
   * de aquí ningún identificador interno ni ningún dato fiscal.
   *
   * @param row - Fila cruda de la consulta paginada.
   * @param businessDate - Fecha de negocio de hoy, `YYYY-MM-DD`.
   * @returns La empresa morosa tal como la publica el contrato.
   */
  private toTenantItem(row: Record<string, unknown>, businessDate: string): ReceivableTenantItem {
    // `current_period_end` se siembra al alta y nunca queda vacío
    // (`billing_subscription_service.ts:459-460,514`). El `?? businessDate` es la
    // red que garantiza la regla 4: los días de atraso siempre son un número.
    const periodoFin = toCalendarIsoDate(row.periodoFin) ?? businessDate
    const diasAtraso = Math.max(0, daysBetweenBusinessDates(periodoFin, businessDate))

    return {
      businessUnitPublicId: row.businessUnitPublicId as string,
      businessUnitName: row.businessUnitName as string,
      businessUnitActive: Number(row.businessUnitActive ?? 0),
      planName: (row.planName as string | null) ?? null,
      montoVencidoCents: Number(row.montoVencidoCents ?? 0),
      diasAtraso,
      bucket: resolveReceivableBucket(diasAtraso),
      periodoFin,
      saldoAFavorCents: Number(row.saldoAFavorCents ?? 0),
      adeudoPorAumentoCents: Number(row.adeudoPorAumentoCents ?? 0),
    }
  }

  /**
   * Lista completa de canceladas con adeudo, en el orden del contrato: la baja
   * más reciente primero, luego el importe más alto, y el nombre comercial como
   * desempate final. No se pagina: el supuesto de volumen declarado en la HU es
   * que hoy son unidades, no cientos.
   *
   * @returns Las canceladas con adeudo, ya como DTO plano.
   */
  private async loadCanceled(): Promise<CanceledReceivableItem[]> {
    const rows = (await this.canceledWithDebtQuery()
      // Misma excepción deliberada que en `loadPage`: se muestra el nombre del
      // plan aunque el plan esté dado de baja.
      .leftJoin('billing_plans as bp', 'bp.billing_plan_id', 'bs.billing_plan_id')
      .select([
        'bu.business_unit_public_id as businessUnitPublicId',
        'bu.business_unit_name as businessUnitName',
        'bu.business_unit_active as businessUnitActive',
        'bp.billing_plan_name as planName',
        'bs.billing_subscription_current_period_end as periodoFin',
        'bs.billing_subscription_canceled_at as canceladoEl',
      ])
      .select(db.raw(`${CONTRACTED_TOTAL_CENTS_SQL} as montoAdeudadoCents`))
      .orderByRaw('DATE(bs.billing_subscription_canceled_at) desc')
      .orderByRaw(`${CONTRACTED_TOTAL_CENTS_SQL} desc`)
      .orderBy('bu.business_unit_name', 'asc')) as Array<Record<string, unknown>>

    return rows
      .map((row) => this.toCanceledItem(row))
      .filter((item): item is CanceledReceivableItem => item !== null)
  }

  /**
   * DTO plano de una cancelada con adeudo, armado campo por campo con casteo
   * explícito. No sale de aquí ningún identificador interno ni ningún dato
   * fiscal.
   *
   * @param row - Fila cruda de `canceledWithDebtQuery`.
   * @returns La cancelada tal como la publica el contrato, o `null` si alguna de
   *   las dos fechas llegó vacía — la consulta ya exige que existan, así que una
   *   fila así solo puede venir de un filtro que no se aplicó, y no se publica
   *   inventándole fechas.
   */
  private toCanceledItem(row: Record<string, unknown>): CanceledReceivableItem | null {
    const periodoFin = toCalendarIsoDate(row.periodoFin)
    const canceladoEl = toCalendarIsoDate(row.canceladoEl)

    if (periodoFin === null || canceladoEl === null) return null

    return {
      businessUnitPublicId: row.businessUnitPublicId as string,
      businessUnitName: row.businessUnitName as string,
      businessUnitActive: Number(row.businessUnitActive ?? 0),
      planName: (row.planName as string | null) ?? null,
      montoAdeudadoCents: Number(row.montoAdeudadoCents ?? 0),
      periodoFin,
      canceladoEl,
      diasAtrasoAlCancelar: Math.max(0, daysBetweenBusinessDates(periodoFin, canceladoEl)),
    }
  }
}
