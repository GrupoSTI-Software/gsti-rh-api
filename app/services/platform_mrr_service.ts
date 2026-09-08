import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { toBusinessDateString } from '../utils/business_date.js'

// ─── Tipos de retorno ─────────────────────────────────────────────────────────

/** Cuántas suscripciones del universo del MRR están contratadas en una moneda. */
export interface MrrCurrencySlice {
  /** `billing_subscription_contracted_currency`, ISO-4217 de tres letras. */
  codigo: string
  suscripciones: number
}

/**
 * Las dos cifras de ingreso recurrente de la plataforma, cada una con su
 * conteo, más el reparto por moneda y la fecha de negocio del cálculo.
 *
 * **No hay ni habrá un campo que sea la suma de las dos** (regla 3): el actual
 * es lo que ya está contratado y activo, el proyectado es lo que sumaría si las
 * pruebas convierten. Presentarlas juntas produce un número que sobreestima el
 * ingreso.
 */
export interface PlatformMrrSnapshot {
  /** Suma del subtotal congelado (SIN IVA) de las suscripciones `active`, en centavos. */
  mrrActualNetoCents: number
  suscripcionesActivas: number
  /** Misma suma sobre `trialing`. Viaja aparte y JAMÁS dentro del actual. */
  mrrProyectadoTrialCents: number
  suscripcionesEnPrueba: number
  /** Honestidad multimoneda: más de un elemento significa que la suma cruza monedas. */
  monedas: MrrCurrencySlice[]
  /** Fecha de negocio del cálculo, `YYYY-MM-DD`. */
  calculadoAl: string
}

/**
 * Por qué un mes de la serie no se puede sostener con los cobros registrados.
 *
 * No son grados: son causas. La vista los usa para explicar el hueco, no para
 * ordenar meses por calidad.
 */
export type MrrSeriesLowConfidenceReason =
  | 'mes-en-curso'
  | 'sin-pagos-en-el-mes'
  | 'anterior-al-primer-pago'

/** Un mes de la serie: lo que se cobró para él, cuántos cobros lo sostienen y qué tan firme es. */
export interface MrrSeriesPoint {
  /** Mes calendario, `YYYY-MM`. */
  mes: string
  /**
   * Ingreso recurrente COBRADO atribuido al mes, en centavos.
   *
   * No es `mrrActualNetoCents`: aquél es lo contratado y vigente hoy, éste es lo
   * que entró de cobros que cubrieron este mes. El nombre lleva la diferencia
   * encima a propósito.
   */
  mrrCobradoNetoCents: number
  /** Cobros que aportaron a este mes. Un cobro de tres periodos cuenta en los tres. */
  pagosConsiderados: number
  confiabilidad: 'alta' | 'baja'
  /** `null` cuando la confiabilidad es alta. */
  motivoBajaConfiabilidad: MrrSeriesLowConfidenceReason | null
}

/** Meses que la serie alcanza a reconstruir. En `null` cuando no hay ni un cobro con periodo. */
export interface MrrSeriesWindow {
  desde: string | null
  hasta: string | null
}

/** Serie mensual de MRR cobrado, con su ventana y lo que quedó fuera de ella. */
export interface PlatformMrrSeries {
  ventana: MrrSeriesWindow
  /**
   * Fuente declarada en el propio payload. Viaja en la respuesta para que nadie
   * confunda esta serie con la cifra de la franja ejecutiva: son dos métricas
   * distintas y no se espera que sus números coincidan.
   */
  criterio: 'pagos'
  /** Cobros que no se pudieron ubicar en ningún mes por no tener periodo registrado. */
  pagosSinPeriodoExcluidos: number
  /** Cronológico ascendente y sin huecos dentro de la ventana. */
  puntos: MrrSeriesPoint[]
}

/** Un cobro con periodo, reducido a lo único que la serie necesita de él. */
export interface MrrPaymentPeriodRow {
  /** Importe SIN IVA congelado al momento de cobrar, en centavos. */
  subtotalCents: number
  /** Meses que el cobro cubrió. El `0` y el nulo se tratan como `1`. */
  periodsCovered: number
  /** Mes calendario en que arranca el periodo cubierto, `YYYY-MM`. */
  periodStartMonth: string
}

// ─── Núcleo de la serie (puro) ────────────────────────────────────────────────

/**
 * Mes `YYYY-MM` desplazado `delta` meses.
 *
 * Las claves `YYYY-MM` se comparan como texto en todo el módulo: su orden
 * lexicográfico es el cronológico, así que no hace falta parsear para ordenar ni
 * para acotar la ventana.
 */
function shiftMonth(month: string, delta: number): string {
  return DateTime.fromISO(`${month}-01`).plus({ months: delta }).toFormat('yyyy-MM')
}

/**
 * Motivo por el que un mes es de baja confiabilidad, o `null` si es firme.
 *
 * La precedencia importa y es la del contrato: `mes-en-curso` gana a
 * `anterior-al-primer-pago`, y ése gana a `sin-pagos-en-el-mes`. Un mes en curso
 * sin cobros se reporta como en curso, porque ése es el motivo que de verdad
 * explica el hueco — todavía no termina.
 *
 * `anterior-al-primer-pago` no se alcanza hoy desde el endpoint: la ventana se
 * recorta al mes del primer cobro (regla 8), así que ningún mes puede quedar
 * antes. Se implementa igual porque es la regla del contrato: el día que alguien
 * afloje ese recorte, el motivo tiene que salir solo en vez de mentir con
 * `sin-pagos-en-el-mes`.
 *
 * @param month - Mes evaluado, `YYYY-MM`.
 * @param currentMonth - Mes calendario en curso en zona de negocio, `YYYY-MM`.
 * @param firstPaidMonth - Mes del primer cobro con periodo registrado, `YYYY-MM`.
 * @param paymentsConsidered - Cuántos cobros aportaron a este mes.
 * @returns El motivo, o `null` cuando el mes se sostiene con cobros.
 */
export function resolveMonthReliability(
  month: string,
  currentMonth: string,
  firstPaidMonth: string,
  paymentsConsidered: number
): MrrSeriesLowConfidenceReason | null {
  if (month === currentMonth) {
    return 'mes-en-curso'
  }
  if (month < firstPaidMonth) {
    return 'anterior-al-primer-pago'
  }
  if (paymentsConsidered === 0) {
    return 'sin-pagos-en-el-mes'
  }
  return null
}

/**
 * Arma la serie mensual a partir de los cobros con periodo.
 *
 * Función pura: sin base de datos y sin reloj. El mes en curso entra por
 * parámetro para que las reglas se puedan fijar en pruebas deterministas en vez
 * de depender del día en que se corran.
 *
 * ## Reparto y residuo
 *
 * Cada cobro aporta `floor(subtotalCents / max(periodsCovered, 1))` a cada uno de
 * los meses que cubrió, arrancando en el mes de su `period_start`. La división es
 * entera y **el residuo se pierde**: un cobro de 100 centavos repartido en tres
 * meses aporta 33 a cada uno y deja 1 centavo sin atribuir, hasta
 * `periodsCovered - 1` centavos por cobro. No se reparte a ojo entre los meses
 * porque decidir en cuál cae el sobrante sería justo el tipo de relleno que la HU
 * prohíbe, y el error está acotado a centavos sobre importes de millones.
 *
 * ## Lo que esta función NO hace
 *
 * No rellena un mes vacío con el anterior, con un promedio ni con estimación
 * alguna: un mes sin cobros vale cero y sale marcado. Tampoco ubica los cobros
 * sin periodo — ésos ni siquiera llegan aquí, se cuentan aparte y viajan en
 * `pagosSinPeriodoExcluidos`.
 *
 * @param rows - TODOS los cobros con periodo del universo, no solo los de la ventana: un cobro anterior a ella puede seguir aportando a meses de adentro.
 * @param options.currentMonth - Mes calendario en curso, `YYYY-MM`.
 * @param options.months - Ancho de la ventana pedido, ya validado en 1..24.
 * @param options.paymentsWithoutPeriod - Cobros descartados por no tener periodo registrado.
 * @returns La serie completa: ventana, criterio, descartados y un punto por mes.
 */
export function buildMrrSeries(
  rows: MrrPaymentPeriodRow[],
  options: { currentMonth: string; months: number; paymentsWithoutPeriod: number }
): PlatformMrrSeries {
  const { currentMonth, months, paymentsWithoutPeriod } = options

  // Sin un solo cobro con periodo la serie sale vacía y la ventana en blanco
  // (regla 7): una lista de meses en cero se leería como historia real de un
  // negocio que no facturó, que es exactamente lo contrario de lo que pasa.
  if (rows.length === 0) {
    return {
      ventana: { desde: null, hasta: null },
      criterio: 'pagos',
      pagosSinPeriodoExcluidos: paymentsWithoutPeriod,
      puntos: [],
    }
  }

  const firstPaidMonth = rows.reduce(
    (earliest, row) => (row.periodStartMonth < earliest ? row.periodStartMonth : earliest),
    rows[0].periodStartMonth
  )

  const hasta = currentMonth
  const requested = shiftMonth(currentMonth, -(months - 1))
  // La ventana no arranca antes del primer cobro (regla 8) ni después del mes en
  // curso: un primer cobro que paga un periodo por adelantado deja su mes en el
  // futuro, y sin el segundo tope la ventana saldría al revés.
  const notBeforeFirstPayment = requested > firstPaidMonth ? requested : firstPaidMonth
  const desde = notBeforeFirstPayment < hasta ? notBeforeFirstPayment : hasta

  // El orden de inserción del Map es el de la serie: cronológico y sin huecos.
  const buckets = new Map<string, { cents: number; pagos: number }>()
  for (let month = desde; month <= hasta; month = shiftMonth(month, 1)) {
    buckets.set(month, { cents: 0, pagos: 0 })
  }

  for (const row of rows) {
    const spread = Math.max(row.periodsCovered, 1)
    const share = Math.floor(row.subtotalCents / spread)
    for (let index = 0; index < spread; index += 1) {
      const bucket = buckets.get(shiftMonth(row.periodStartMonth, index))
      // Los meses del cobro que caen fuera de la ventana simplemente no aportan.
      if (!bucket) {
        continue
      }
      bucket.cents += share
      bucket.pagos += 1
    }
  }

  const puntos: MrrSeriesPoint[] = [...buckets.entries()].map(([mes, bucket]) => {
    const motivo = resolveMonthReliability(mes, currentMonth, firstPaidMonth, bucket.pagos)
    return {
      mes,
      mrrCobradoNetoCents: bucket.cents,
      pagosConsiderados: bucket.pagos,
      confiabilidad: motivo === null ? 'alta' : 'baja',
      motivoBajaConfiabilidad: motivo,
    }
  })

  return {
    ventana: { desde, hasta },
    criterio: 'pagos',
    pagosSinPeriodoExcluidos: paymentsWithoutPeriod,
    puntos,
  }
}

// ─── SQL compartido ───────────────────────────────────────────────────────────

/**
 * Subtotal contratado SIN IVA convertido a centavos enteros, en SQL.
 *
 * La conversión va en la consulta y no en JavaScript porque la columna es
 * `DECIMAL(12,2)`: multiplicar por 100 en JS y sumar sembraría error de punto
 * flotante en el total de toda la plataforma. En MySQL la aritmética sobre
 * `DECIMAL` es exacta y la suma termina siendo una suma de enteros. Ancla del
 * mismo cálculo en la cartera: `platform_receivable_service.ts`
 * (`CONTRACTED_TOTAL_CENTS_SQL`, que convierte el total CON IVA).
 */
const CONTRACTED_SUBTOTAL_CENTS_SQL =
  'CAST(ROUND(bs.billing_subscription_contracted_subtotal * 100) AS SIGNED)'

/** Los dos estados que el MRR mide. `past_due` y `canceled` quedan fuera (regla 4). */
const MRR_STATUSES = ['active', 'trialing'] as const

// ─── Servicio ─────────────────────────────────────────────────────────────────

/**
 * Ingreso mensual recurrente de la plataforma (USRH1788052455653).
 *
 * Es la definición canónica del MRR del producto: de aquí parten la serie
 * mensual y la concentración por grupo económico. Solo lectura: no escribe, no
 * abre transacción y se resuelve en el momento de la consulta — sin caché, sin
 * materialización y sin proceso programado (regla 8).
 *
 * ## Tres reglas que se prestan a que alguien las "corrija"
 *
 * 1. **Se lee la columna congelada, no se recalcula el neto.**
 *    `billing_subscription_contracted_subtotal` ya es precio unitario × asientos
 *    − descuento, sin IVA, y es la que gobierna el cobro: se sella al contratar
 *    y se vuelve a sellar en cada aumento de asientos
 *    (`billing_subscription_change_service.ts`). Reconstruir el neto desde el
 *    descuento congelado reportaría **precio de lista sin fallar**, porque el
 *    catálogo ya admite descuentos que no son porcentaje
 *    (`DiscountCodeKind = 'percent' | 'fixed_amount' | 'unit_price'`). Es un
 *    riesgo silencioso: un ingreso sobreestimado que nadie detecta es peor que
 *    un error visible.
 *
 * 2. **`past_due` queda fuera, y el MRR baja cuando alguien cae en morosidad.**
 *    No es un bug: el importe de la morosa se reporta en la cartera vencida
 *    (`platform_receivable_service.ts`), y contarlo en las dos partes lo
 *    duplicaría. La consecuencia está asumida: el ingreso mensual baja cuando un
 *    cliente se atrasa y vuelve a subir cuando se pone al corriente. Los dos
 *    números se mueven en sentidos contrarios a propósito.
 *
 * 3. **Se suman todas las suscripciones del estado, no una por empresa.** El
 *    listado de tenants elige "la mejor suscripción por empresa"
 *    (`platform_tenant_service.ts`); ésa es una regla de despliegue, no de
 *    ingreso. Aplicarla aquí perdería el ingreso real de una empresa con dos
 *    suscripciones vivas (regla 5). La aparente inconsistencia con el listado es
 *    deliberada.
 *
 * ## Forma pensada para la orden 16
 *
 * El universo y sus filtros (`mrrBaseQuery`) están aislados de la proyección del
 * resultado (`getMrrSnapshot`), de modo que "Ver la concentración de MRR por
 * grupo económico" pueda agregar un `groupBy` sobre la misma pasada sin duplicar
 * la regla del neto ni la de estados. Esta rebanada **no** crea el desglose.
 */
export default class PlatformMrrService {
  /**
   * Las dos cifras de ingreso recurrente, calculadas al momento.
   *
   * Una sola lectura del reloj para las tres consultas: el actual, el proyectado
   * y el reparto por moneda tienen que hablar del mismo día aunque el proceso
   * cruce la medianoche.
   *
   * @returns Actual neto, proyectado de pruebas, sus conteos, monedas y la fecha del cálculo.
   */
  async getMrrSnapshot(): Promise<PlatformMrrSnapshot> {
    const businessDate = toBusinessDateString()

    const activas = await this.loadStatusTotals('active')
    const enPrueba = await this.loadStatusTotals('trialing')
    const monedas = await this.loadCurrencies()

    return {
      mrrActualNetoCents: activas.netoCents,
      suscripcionesActivas: activas.suscripciones,
      mrrProyectadoTrialCents: enPrueba.netoCents,
      suscripcionesEnPrueba: enPrueba.suscripciones,
      monedas,
      calculadoAl: businessDate,
    }
  }

  /**
   * Universo del MRR: suscripciones vivas de empresas vivas. Sin filtro de
   * estado — lo pone cada llamador, para que el actual y el proyectado no puedan
   * compartir una ramificación.
   *
   * Los dos `whereNull` van a mano porque las queries crudas de Knex no pasan
   * por el hook de `SoftDeletes` (gotcha del área, `platform_device_service.ts`).
   * `business_unit_active = 0` **no** excluye: manda el estado de la suscripción
   * (regla 6).
   */
  private mrrBaseQuery() {
    return db
      .from('billing_subscriptions as bs')
      .join('business_units as bu', 'bu.business_unit_id', 'bs.business_unit_id')
      .whereNull('bs.billing_subscription_deleted_at')
      .whereNull('bu.business_unit_deleted_at')
  }

  /**
   * Suma del subtotal congelado y conteo de suscripciones de un estado.
   *
   * Una consulta por estado, y no un `GROUP BY status`, para que sea imposible
   * que el proyectado se cuele en el actual: cada cifra tiene su propia llamada
   * y su propio filtro (regla 3).
   *
   * `COALESCE` porque MySQL devuelve NULL —no 0— cuando el universo está vacío,
   * y `Number(...)` porque `SUM()` sobre `DECIMAL` llega como string por Knex.
   *
   * @param status - Estado exacto de las suscripciones a sumar.
   * @returns Importe neto en centavos y cuántas suscripciones lo produjeron.
   */
  private async loadStatusTotals(
    status: (typeof MRR_STATUSES)[number]
  ): Promise<{ netoCents: number; suscripciones: number }> {
    const row = (await this.mrrBaseQuery()
      .where('bs.billing_subscription_status', status)
      .select(db.raw(`COALESCE(SUM(${CONTRACTED_SUBTOTAL_CENTS_SQL}), 0) as netoCents`))
      .select(db.raw('COUNT(*) as suscripciones'))
      .first()) as Record<string, unknown> | null

    return {
      netoCents: Number(row?.netoCents ?? 0),
      suscripciones: Number(row?.suscripciones ?? 0),
    }
  }

  /**
   * Cuántas suscripciones del universo del MRR hay en cada moneda contratada.
   *
   * Es la honestidad del supuesto declarado: hoy la plataforma opera en una sola
   * moneda por costumbre, no por regla del esquema. **La suma no se agrupa por
   * moneda** — se informa el reparto y la vista advierte cuando hay más de una,
   * en lugar de sumar peras con manzanas en silencio.
   *
   * Orden por código para que la advertencia de la vista no cambie de redacción
   * entre dos cargas idénticas.
   *
   * @returns Un elemento por moneda distinta, ascendente por código.
   */
  private async loadCurrencies(): Promise<MrrCurrencySlice[]> {
    const rows = (await this.mrrBaseQuery()
      .whereIn('bs.billing_subscription_status', [...MRR_STATUSES])
      .select('bs.billing_subscription_contracted_currency as codigo')
      .select(db.raw('COUNT(*) as suscripciones'))
      .groupBy('bs.billing_subscription_contracted_currency')
      .orderBy('bs.billing_subscription_contracted_currency', 'asc')) as Array<
      Record<string, unknown>
    >

    return rows.map((row) => ({
      codigo: String(row.codigo ?? ''),
      suscripciones: Number(row.suscripciones ?? 0),
    }))
  }
}
