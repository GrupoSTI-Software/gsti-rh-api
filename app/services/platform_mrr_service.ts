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
