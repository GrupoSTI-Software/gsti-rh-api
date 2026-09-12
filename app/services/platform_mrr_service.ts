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

/** Qué es una unidad del reparto: un grupo económico, o la bolsa de los que no tienen. */
export type MrrConcentrationUnitKind = 'grupo' | 'sin-grupo'

/**
 * Fila del desglose tal como la devuelve la base: ya agregada por grupo, con el
 * grupo en `null` cuando la suscripción no pertenece a ninguno vivo.
 *
 * Es la frontera entre SQL y la pura: la consulta agrupa y suma, la pura nombra,
 * ordena y calcula participaciones.
 */
export interface MrrConcentrationRow {
  /** `null` = sin membresía, o membresía apuntando a un grupo dado de baja. */
  platformTenantGroupId: number | null
  /** Nombre del grupo; `null` en la fila de los que no tienen grupo. */
  nombre: string | null
  /** Clientes distintos con MRR activo dentro de la unidad. */
  tenants: number
  /** Suscripciones activas de la unidad. No colapsa por cliente (regla 5 de la orden 8). */
  suscripciones: number
  /** Suma del subtotal congelado de la unidad, en centavos. */
  mrrNetoCents: number
}

/** Una unidad del reparto, ya nombrada y con su participación derivada. */
export interface MrrConcentrationUnit {
  tipo: MrrConcentrationUnitKind
  /** `null` cuando `tipo = 'sin-grupo'`. */
  platformTenantGroupId: number | null
  /** Nombre del grupo, o el nombre único de la bolsa. */
  nombre: string
  tenants: number
  mrrNetoCents: number
  /** Parte del total que le toca, con un decimal. Se deriva del importe, nunca al revés. */
  participacionPct: number
}

/**
 * Reparto del MRR actual neto entre grupos económicos.
 *
 * `base` declara en el propio payload sobre qué cifra se reparte, para que nadie
 * lo confunda con el proyectado de pruebas, que **no** se reparte (regla 8).
 */
export interface MrrConcentration {
  base: 'mrr-actual-neto'
  /** Ordenadas por importe descendente, desempate por nombre. Vacío si no hay MRR activo. */
  unidades: MrrConcentrationUnit[]
  /** Grupos vivos que no listaron unidad por no tener MRR activo (regla 9). */
  gruposOmitidosSinMrr: number
}

/**
 * Las tres lecturas del universo `active`, plegadas de las mismas filas.
 *
 * Viajan juntas a propósito: que el total salga del mismo pliegue que el
 * desglose es lo que hace imposible que difieran (CA-3).
 */
export interface MrrConcentrationTotals {
  concentracion: MrrConcentration
  netoCents: number
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
  /**
   * Reparto del actual neto por grupo económico. `SUM(unidades[].mrrNetoCents)`
   * es exactamente `mrrActualNetoCents`: las dos cifras se pliegan de la misma
   * consulta (USRH1788052455659).
   */
  concentracion: MrrConcentration
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

// ─── Núcleo del reparto por grupo (puro) ──────────────────────────────────────

/**
 * Nombre único de la bolsa que agrupa a los clientes sin grupo económico.
 *
 * Lo emite el servicio y no la vista, para que sea uno solo y traducible en un
 * solo lugar (regla 5 del contrato).
 */
export const SIN_GRUPO_NOMBRE = 'Sin grupo'

/**
 * Arma el reparto y, de las mismas filas, el total y el conteo del universo activo.
 *
 * Es puro: no consulta, no lee el reloj y no toca `db`. Tres reglas que se
 * prestan a que alguien las "corrija":
 *
 * 1. **El total se pliega de estas filas**, no de una segunda consulta. Es lo
 *    que vuelve imposible que la suma del desglose difiera de la cifra de la
 *    franja (CA-3). Si algún día alguien recalcula el total aparte, el
 *    invariante pasa a depender de la suerte.
 * 2. **La participación se deriva del importe**, redondeada a un decimal, y la
 *    suma de porcentajes **puede no dar 100.0**. No se ajusta ninguna unidad:
 *    forzar el cuadre falsearía un dato para maquillar un redondeo (CA-5).
 * 3. **Las unidades en cero no se listan** y se informa cuántos grupos quedaron
 *    fuera por eso (regla 9). La bolsa "Sin grupo" se omite igual si vale cero.
 *
 * @param rows - Filas ya agrupadas por grupo económico, con el nulo como bolsa.
 * @param liveGroupsCount - Grupos vivos en la plataforma, para el conteo de omitidos.
 * @returns El reparto, el total en centavos y el conteo de suscripciones activas.
 */
export function buildMrrConcentration(
  rows: MrrConcentrationRow[],
  liveGroupsCount: number
): MrrConcentrationTotals {
  const netoCents = rows.reduce((total, row) => total + row.mrrNetoCents, 0)
  const suscripciones = rows.reduce((total, row) => total + row.suscripciones, 0)

  const unidades: MrrConcentrationUnit[] = rows
    .filter((row) => row.mrrNetoCents > 0)
    .map((row) => {
      const esGrupo = row.platformTenantGroupId !== null

      return {
        tipo: esGrupo ? ('grupo' as const) : ('sin-grupo' as const),
        platformTenantGroupId: row.platformTenantGroupId,
        // El nombre nulo de un grupo no existe (la columna es NOT NULL), pero el
        // fallback evita publicar una cadena vacía si algún día lo fuera.
        nombre: esGrupo ? (row.nombre ?? SIN_GRUPO_NOMBRE) : SIN_GRUPO_NOMBRE,
        tenants: row.tenants,
        mrrNetoCents: row.mrrNetoCents,
        // Guarda explícita de la división entre cero: con total en cero no hay
        // unidades que listar, así que esta rama no se alcanza desde el endpoint.
        participacionPct:
          netoCents > 0 ? Math.round((row.mrrNetoCents / netoCents) * 1000) / 10 : 0,
      }
    })
    .sort(
      (a, b) => b.mrrNetoCents - a.mrrNetoCents || a.nombre.localeCompare(b.nombre, 'es')
    )

  const gruposListados = unidades.filter((unidad) => unidad.tipo === 'grupo').length

  return {
    concentracion: {
      base: 'mrr-actual-neto',
      unidades,
      // `Math.max` porque el conteo de grupos vivos y el desglose son dos
      // lecturas: una alta entre ambas no puede producir un negativo.
      gruposOmitidosSinMrr: Math.max(liveGroupsCount - gruposListados, 0),
    },
    netoCents,
    suscripciones,
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
 * ## Reparto por grupo económico (orden 16, USRH1788052455659)
 *
 * El universo y sus filtros (`mrrBaseQuery`) siguen aislados de la proyección.
 * La orden 16 los aprovechó agregando un `GROUP BY` **sobre la misma pasada**:
 * el actual neto, su conteo y el desglose se pliegan de una sola consulta, así
 * que la suma del desglose es igual a la cifra de la franja por construcción.
 * Ese es el invariante que define la lectura: dos consultas con dos cortes lo
 * romperían aunque los números coincidieran hoy.
 */
export default class PlatformMrrService {
  /**
   * Las dos cifras de ingreso recurrente y el reparto del actual, al momento.
   *
   * Una sola lectura del reloj para todas las consultas: el actual, el
   * proyectado, el reparto y las monedas tienen que hablar del mismo día aunque
   * el proceso cruce la medianoche.
   *
   * El actual neto, su conteo y el desglose salen del **mismo** pliegue de la
   * misma consulta agrupada (`loadConcentrationRows`). No hay una segunda
   * consulta del total: si la hubiera, una suscripción activada entre las dos
   * haría que la suma del desglose difiriera de la cifra de la franja, que es el
   * peor defecto posible de esta lectura (CA-3).
   *
   * El proyectado de pruebas conserva su propia consulta: **no** se reparte
   * (regla 8) y comparte cero ramificación con el actual.
   *
   * @returns Actual neto, proyectado, sus conteos, monedas, el reparto y la fecha.
   */
  async getMrrSnapshot(): Promise<PlatformMrrSnapshot> {
    const businessDate = toBusinessDateString()

    const concentrationRows = await this.loadConcentrationRows()
    const gruposVivos = await this.countLiveTenantGroups()
    const activas: MrrConcentrationTotals = buildMrrConcentration(concentrationRows, gruposVivos)

    const enPrueba = await this.loadStatusTotals('trialing')
    const monedas = await this.loadCurrencies()

    return {
      mrrActualNetoCents: activas.netoCents,
      suscripcionesActivas: activas.suscripciones,
      mrrProyectadoTrialCents: enPrueba.netoCents,
      suscripcionesEnPrueba: enPrueba.suscripciones,
      monedas,
      concentracion: activas.concentracion,
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
   * Hoy la usa solo el proyectado de pruebas: el actual neto se pliega del
   * desglose por grupo, que sale de la misma consulta agrupada
   * (`loadConcentrationRows`). Se conserva genérica a propósito —recibe el
   * estado por parámetro— porque es la forma que garantiza que el proyectado
   * jamás comparta una ramificación con el actual (regla 3).
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
   * Universo `active` agregado por grupo económico, en **una sola** consulta.
   *
   * Es la misma pasada que produce la cifra de la franja: el universo
   * (`mrrBaseQuery`), el filtro de estado y la expresión del neto son los de la
   * orden 8, y lo único que se agrega es el `GROUP BY`. Por eso
   * `SUM(unidades) === mrrActualNetoCents` es invariante por construcción y no
   * por coincidencia (CA-3).
   *
   * Los dos `LEFT JOIN` no pueden perder ni duplicar filas: el pivote tiene
   * `UNIQUE(business_unit_id)` —a lo más un grupo por cliente— y el segundo une
   * por llave primaria.
   *
   * **El filtro de la baja lógica del grupo va en el `ON`, no en el `WHERE`.**
   * En el `WHERE`, `g.platform_tenant_group_deleted_at IS NULL` dejaría pasar a
   * los sin membresía (su `g.*` llega nulo) pero **borraría del resultado** a los
   * clientes cuyo grupo fue dado de baja: su ingreso desaparecería del desglose
   * sin desaparecer del total y CA-4 fallaría en silencio. En el `ON`, esa
   * membresía huérfana cae en la bolsa "sin-grupo", que es la regla 4.
   *
   * `platform_tenant_group_active` **no** filtra: un grupo apagado con clientes
   * activos sigue concentrando ingreso (regla 4 del contrato).
   *
   * @returns Una fila por grupo con MRR, más la fila del nulo con todos los demás.
   */
  private async loadConcentrationRows(): Promise<MrrConcentrationRow[]> {
    const rows = (await this.mrrBaseQuery()
      .where('bs.billing_subscription_status', 'active')
      .leftJoin(
        'platform_tenant_group_members as m',
        'm.business_unit_id',
        'bs.business_unit_id'
      )
      .leftJoin('platform_tenant_groups as g', (join) => {
        join
          .on('g.platform_tenant_group_id', '=', 'm.platform_tenant_group_id')
          .andOnNull('g.platform_tenant_group_deleted_at')
      })
      .select('g.platform_tenant_group_id as platformTenantGroupId')
      .select('g.platform_tenant_group_name as nombre')
      .select(db.raw('COUNT(DISTINCT bs.business_unit_id) as tenants'))
      .select(db.raw('COUNT(*) as suscripciones'))
      .select(db.raw(`COALESCE(SUM(${CONTRACTED_SUBTOTAL_CENTS_SQL}), 0) as mrrNetoCents`))
      .groupBy('g.platform_tenant_group_id', 'g.platform_tenant_group_name')) as Array<
      Record<string, unknown>
    >

    return rows.map((row) => ({
      platformTenantGroupId:
        row.platformTenantGroupId === null ? null : Number(row.platformTenantGroupId),
      nombre: row.nombre === null ? null : String(row.nombre),
      tenants: Number(row.tenants ?? 0),
      suscripciones: Number(row.suscripciones ?? 0),
      // `SUM()` sobre DECIMAL llega como string por Knex: el Number va explícito.
      mrrNetoCents: Number(row.mrrNetoCents ?? 0),
    }))
  }

  /**
   * Cuántos grupos económicos vivos hay en la plataforma.
   *
   * Sirve solo para `gruposOmitidosSinMrr`: es un conteo de catálogo, no de
   * dinero, así que va aparte sin tocar el invariante del cuadre. Un grupo que no
   * aparece en el desglose es un grupo sin MRR activo, y esta cifra dice cuántos
   * son en lugar de dejar la ausencia sin explicación (regla 9).
   *
   * `deleted_at IS NULL` explícito: la consulta cruda no pasa por `SoftDeletes`.
   *
   * @returns Total de grupos sin baja lógica, activos o apagados.
   */
  private async countLiveTenantGroups(): Promise<number> {
    const row = (await db
      .from('platform_tenant_groups')
      .whereNull('platform_tenant_group_deleted_at')
      .count('* as total')
      .first()) as Record<string, unknown> | null

    return Number(row?.total ?? 0)
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

  /**
   * Serie mensual de MRR **cobrado** (USRH1788052455654).
   *
   * Es una métrica distinta de `getMrrSnapshot`, no otra vista de la misma:
   * aquélla mide lo contratado y vigente hoy, ésta mide lo que entró de cobros
   * atribuibles a cada mes. El último punto de la serie normalmente **no**
   * coincide con `mrrActualNetoCents`, y eso es correcto — por eso el payload
   * declara `criterio: 'pagos'` y los campos se llaman distinto.
   *
   * Se leen TODOS los cobros con periodo, no solo los de la ventana: un cobro
   * anterior que cubrió varios meses puede seguir aportando adentro, y acotar por
   * fecha de arranque perdería esa aportación en silencio. Con el volumen de hoy
   * la pasada completa es barata; si los cobros llegan a decenas de miles, ése es
   * el momento de acotar por rango o de materializar la serie — supuesto abierto
   * y declarado en la HU, no deuda escondida.
   *
   * @param months - Ancho de la ventana en meses, ya validado en 1..24 por el controlador.
   * @returns La serie, su ventana y cuántos cobros quedaron fuera por no tener periodo.
   */
  async getMonthlySeries(months: number): Promise<PlatformMrrSeries> {
    const currentMonth = toBusinessDateString().slice(0, 7)

    const rows = await this.loadPaymentsWithPeriod()
    const paymentsWithoutPeriod = await this.countPaymentsWithoutPeriod()

    return buildMrrSeries(rows, { currentMonth, months, paymentsWithoutPeriod })
  }

  /**
   * Universo de la serie: cobros de suscripciones vivas de empresas vivas.
   *
   * Los dos `whereNull` van a mano porque las queries crudas de Knex no pasan por
   * el hook de `SoftDeletes` (gotcha del área, `platform_device_service.ts`). Sin
   * ellos la serie suma los cobros de tenants borrados **sin fallar**, que es la
   * peor forma de estar mal.
   *
   * **`billing_payments` no tiene borrado lógico:** es append-only, el modelo no
   * declara `deletedAt` y la columna no existe en la tabla. No se le agrega un
   * filtro `deleted_at` — la consulta reventaría.
   *
   * Sin filtro de estado de la suscripción: un cobro de una suscripción que hoy
   * está `past_due` o `canceled` sigue siendo dinero que entró por el mes que
   * cubrió. Lo que excluye es la baja lógica, no el estado.
   */
  private seriesBaseQuery() {
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
  }

  /**
   * Cobros con periodo registrado, reducidos a importe, meses cubiertos y mes de
   * arranque.
   *
   * El mes se calcula con `DATE_FORMAT` en SQL y no en JavaScript: los valores
   * `DATE` del driver MySQL llegan anclados a UTC y leerlos en zona local correría
   * el día —y con él el mes— en todo cobro que arranque el día 1 (gotcha
   * documentado en `business_date.ts`).
   *
   * Se lee `billing_payment_subtotal_cents`, que es el importe SIN IVA congelado
   * al cobrar. **No se convierte a centavos**: ya lo está, al revés que las
   * columnas `decimal` de la suscripción.
   *
   * @returns Una fila por cobro atribuible. Sin orden garantizado: el reparto no depende de él.
   */
  private async loadPaymentsWithPeriod(): Promise<MrrPaymentPeriodRow[]> {
    const rows = (await this.seriesBaseQuery()
      .whereNotNull('bp.billing_payment_period_start')
      .whereNotNull('bp.billing_payment_period_end')
      .select('bp.billing_payment_subtotal_cents as subtotalCents')
      .select('bp.billing_payment_periods_covered as periodsCovered')
      .select(
        db.raw("DATE_FORMAT(bp.billing_payment_period_start, '%Y-%m') as periodStartMonth")
      )) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      subtotalCents: Number(row.subtotalCents ?? 0),
      periodsCovered: Number(row.periodsCovered ?? 0),
      periodStartMonth: String(row.periodStartMonth ?? ''),
    }))
  }

  /**
   * Cuántos cobros del universo no se pueden ubicar en ningún mes por no tener
   * periodo registrado. Son los pagos parciales, que por diseño dejan
   * `period_start` y `period_end` en nulo.
   *
   * Se informan, no se adivinan: ubicarlos por la fecha de pago inventaría
   * ingreso en un mes que no lo recibió.
   *
   * Los paréntesis del `whereRaw` son obligatorios: sin ellos el `OR` se lleva
   * por delante los `AND` del universo y la consulta devolvería cobros de
   * empresas borradas.
   *
   * @returns Conteo de cobros descartados; 0 cuando no hay ninguno.
   */
  private async countPaymentsWithoutPeriod(): Promise<number> {
    const row = (await this.seriesBaseQuery()
      .whereRaw(
        '(bp.billing_payment_period_start IS NULL OR bp.billing_payment_period_end IS NULL)'
      )
      .select(db.raw('COUNT(*) as total'))
      .first()) as Record<string, unknown> | null

    return Number(row?.total ?? 0)
  }
}
