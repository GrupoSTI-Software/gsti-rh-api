import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { PLATFORM_METRIC_ERROR_CODES } from '../constants/platform_metric_error_codes.js'
import { PlatformMetricServiceError } from '../exceptions/platform_metric_service_error.js'
import PlatformSubscriptionFlowService from './platform_subscription_flow_service.js'
import PlatformTenantMilestoneService, {
  type TenantMilestone,
} from './platform_tenant_milestone_service.js'
import {
  daysBetweenBusinessDates,
  getBusinessTimeZone,
  toBusinessDateString,
  toCalendarIsoDate,
} from '../utils/business_date.js'

// ─── Tipos de retorno (contrato fijado por USRH1789079078169) ────────────────

export type PlatformTrialEstado = 'viva' | 'terminada'

export type PlatformTrialResultado =
  | 'convirtio'
  | 'convirtio-despues-de-vencer'
  | 'vencio-sin-pago'
  | 'cancelo'

/**
 * Prueba de un tenant, datos planos. `resultado` y `fechaResultado` viajan
 * siempre en `null` en esta rebanada: el hueco lo llena *Resolver el resultado
 * de la prueba sin discrepar del Panel* (USRH1789101459905, RN-07/RN-08/RN-09).
 * El campo ya existe en el contrato desde ahora para que esa sucesora no
 * cambie la forma de la respuesta.
 */
export interface PlatformTenantTrial {
  /** Día civil YYYY-MM-DD. Se LEE de `subscribed_at`, nunca se calcula restando (RN-03). */
  inicio: string
  /** Día civil, INCLUSIVE (RN-06): el día `fin` la prueba sigue viva. */
  fin: string
  /** `min(hoyCivil, fin, canceladoEn)` — borde de medición que consumen `-03` y `-04` (RN-51/RN-52). */
  finEfectivo: string
  /** Informativo, congelado en el alta; NO es `fin - inicio` (RN-04). Puede no cuadrar con la ventana tras un cambio de plan. */
  diasContratados: number
  diasTranscurridos: number
  diasRestantes: number
  estado: PlatformTrialEstado
  /** Siempre `null` en esta rebanada. */
  resultado: PlatformTrialResultado | null
  /** Siempre `null` en esta rebanada. */
  fechaResultado: string | null
}

/** Una fila del universo de pruebas vivas. */
export interface PlatformLiveTrialRef {
  /** Interno: NUNCA sale al cuerpo HTTP. */
  businessUnitId: number
  publicId: string
  nombre: string
  trial: PlatformTenantTrial
}

interface TrialSubscriptionRow {
  /** `bigInteger`; se normaliza a `string` en todo lo que cruza con el churn (USRH1789101459905). */
  subscriptionId: number | string
  businessUnitId: number
  status: string
  contractedTrialDays: number
  subscribedAt: unknown
  trialEndsAt: unknown
  canceledAt: unknown
}

const TRIAL_SUBSCRIPTION_COLUMNS = [
  'bs.billing_subscription_id as subscriptionId',
  'bs.business_unit_id as businessUnitId',
  'bs.billing_subscription_status as status',
  'bs.billing_subscription_contracted_trial_days as contractedTrialDays',
  'bs.billing_subscription_subscribed_at as subscribedAt',
  'bs.billing_subscription_trial_ends_at as trialEndsAt',
  'bs.billing_subscription_canceled_at as canceledAt',
]

interface TrialOutcomeInput {
  /** Día civil `fin` de la ventana ya resuelta (RN-06, inclusive). */
  fin: string
  /** Instante real del primer pago de la suscripción, `undefined` si nunca pagó. */
  paidAt: Date | undefined
  /** Medianoche civil de la cancelación, o `null` si nunca canceló. */
  canceledAt: unknown
  /** `cut_date` de la transición `trial_*` de esa suscripción, o `null` si no hay bitácora. */
  transitionCutDate: unknown
}

/**
 * Núcleo puro del desenlace de una prueba terminada (USRH1789101459905 §7.4).
 * Sin base de datos: recibe ya resueltos el primer pago, la cancelación y la
 * transición de la suscripción, así que es determinista — lo que prueba
 * `platform_trial_resolution.spec.ts` (RN-07/08/08a/08b, la no-terminalidad
 * de CA-3, la frontera civil de `paid_at` de CA-2, la precedencia pago >
 * cancelación de CA-4 y la cancelación posterior al fin).
 *
 * El pago gana siempre sobre la cancelación (regla 3, es lo que hace la
 * tarjeta de Movimiento): `'convirtio'` si su día civil es `<= fin`
 * (inclusive, RN-06), si no `'convirtio-despues-de-vencer'` — y **nunca** es
 * terminal: una prueba que hoy lee `'vencio-sin-pago'` cambia en cuanto
 * exista un pago, sin importar qué se había leído antes (RN-08).
 */
export function resolveSingleTrialOutcome(
  input: TrialOutcomeInput
): { resultado: PlatformTrialResultado; fechaResultado: string } {
  if (input.paidAt) {
    // A15/H1: `paid_at` es un instante real, NUNCA `toCalendarIsoDate` (ancla
    // el `Date` crudo a UTC y correría el día entre las 18:00 y las 23:59 de
    // México). Se convierte con `setZone` explícito.
    const fechaPago = DateTime.fromJSDate(input.paidAt, { zone: 'utc' })
      .setZone(getBusinessTimeZone())
      .toISODate()!
    return {
      resultado: fechaPago <= input.fin ? 'convirtio' : 'convirtio-despues-de-vencer',
      fechaResultado: fechaPago,
    }
  }

  const fechaCancelacion = toCalendarIsoDate(input.canceledAt)
  if (fechaCancelacion !== null && fechaCancelacion <= input.fin) {
    return { resultado: 'cancelo', fechaResultado: fechaCancelacion }
  }

  const cutDate = toCalendarIsoDate(input.transitionCutDate)
  return { resultado: 'vencio-sin-pago', fechaResultado: cutDate ?? input.fin }
}

/**
 * Núcleo puro: arma el `PlatformTenantTrial` a partir de la fila de
 * suscripción ya resuelta y del día civil de hoy. Sin base de datos, así que
 * es determinista y es lo que prueba `platform_trial_resolution.spec.ts`
 * (reglas: ventana leída no restada, el día `fin` sigue vivo, el borde de
 * medición por cancelación/conversión).
 *
 * `finEfectivo = min(hoyCivil, fin, canceladoEn)` descartando los nulos
 * (RN-51): una cancelación corta el borde, una conversión no lo corta porque
 * nunca trae `canceladoEn` — es la misma fórmula para las dos, sin caso
 * especial por estado (RN-52).
 */
export function resolveTenantTrialWindow(
  row: TrialSubscriptionRow,
  hoyIso: string
): PlatformTenantTrial {
  const inicio = toCalendarIsoDate(row.subscribedAt)!
  const fin = toCalendarIsoDate(row.trialEndsAt)!
  const canceladoEn = toCalendarIsoDate(row.canceledAt)

  const estado: PlatformTrialEstado = row.status === 'trialing' ? 'viva' : 'terminada'

  const finEfectivo = [hoyIso, fin, canceladoEn]
    .filter((value): value is string => value !== null)
    .reduce((min, current) => (current < min ? current : min))

  const diasTranscurridos = Math.max(0, daysBetweenBusinessDates(inicio, finEfectivo))
  const diasRestantes =
    estado === 'viva' ? Math.max(0, daysBetweenBusinessDates(hoyIso, fin)) : 0

  return {
    inicio,
    fin,
    finEfectivo,
    diasContratados: row.contractedTrialDays,
    diasTranscurridos,
    diasRestantes,
    estado,
    resultado: null,
    fechaResultado: null,
  }
}

/**
 * Ventana y estado de la prueba de un tenant (USRH1789079078169).
 *
 * Estrena el área de consultas de la prueba: resuelve, con una sola
 * definición, la ventana y el estado de cualquier empresa, en las tres
 * formas que consumen las rebanadas siguientes — individual, en lote y
 * universo de pruebas vivas. Sin migración (RN-47): todo se lee de columnas
 * que ya existen. Knex crudo, columnas enumeradas, cero modelos Lucid en la
 * ruta de lectura (§7 del spec).
 *
 * Universo declarado igual al de la tarjeta de Movimiento
 * (`platform_subscription_flow_service.ts`): solo suscripciones NO borradas
 * lógicamente. Una empresa cuya única suscripción con prueba fue borrada
 * responde "sin prueba" aquí, aunque `hasConsumedTrial()` (alta de
 * suscripción, que sí usa `.withTrashed()`) la trate como que ya la
 * consumió. Es una discrepancia declarada por el propio ticket, no un bug
 * (R-3): es el precio de que esta consulta y la tarjeta nunca difieran.
 */
export default class PlatformTrialService {
  private readonly flowService = new PlatformSubscriptionFlowService()
  private readonly milestoneService = new PlatformTenantMilestoneService()

  /**
   * Ventana, estado, desenlace **e hitos de puesta en marcha** de una sola
   * empresa por su `businessUnitPublicId` (USRH1789079078170 §9.2/§10). Los
   * siete hitos se calculan siempre, con o sin prueba (RN-20) — el bloque
   * `hitos` es independiente de `prueba`.
   */
  async getTenantTrial(publicId: string): Promise<{
    tenant: { publicId: string; nombre: string }
    prueba: PlatformTenantTrial | null
    hitos: TenantMilestone[]
  }> {
    const bu = await db
      .from('business_units as bu')
      .whereNull('bu.business_unit_deleted_at')
      .where('bu.business_unit_public_id', publicId)
      .select(['bu.business_unit_id as buId', 'bu.business_unit_name as businessUnitName'])
      .first()

    const buRow = bu as { buId: number; businessUnitName: string } | null
    if (!buRow) {
      throw new PlatformMetricServiceError(
        `Empresa ${publicId} no encontrada`,
        PLATFORM_METRIC_ERROR_CODES.TENANT_NOT_FOUND,
        404,
        'tenant-no-encontrado',
        'La empresa solicitada no existe o no está disponible.'
      )
    }

    const row = await this.fetchTrialRow(buRow.buId)
    let prueba: PlatformTenantTrial | null = null

    if (row) {
      prueba = resolveTenantTrialWindow(row, toBusinessDateString())
      const outcomes = await this.resolveOutcomes([
        {
          id: String(row.subscriptionId),
          fin: prueba.fin,
          estado: prueba.estado,
          canceledAt: row.canceledAt,
        },
      ])
      const outcome = outcomes.get(String(row.subscriptionId))
      if (outcome) {
        prueba.resultado = outcome.resultado
        prueba.fechaResultado = outcome.fechaResultado
      }
    }

    const milestoneMap = await this.milestoneService.resolveMilestones([buRow.buId])
    const hitos = milestoneMap.get(buRow.buId)!

    return {
      tenant: { publicId, nombre: buRow.businessUnitName },
      prueba,
      hitos,
    }
  }

  /**
   * Ventana, estado y desenlace de un lote de empresas, por `businessUnitId`.
   * Clave del mapa = `businessUnitId`; sin entrada para la que no tuvo
   * prueba. Una sola consulta con `whereIn` para la ventana y una sola
   * resolución de desenlace para todo el lote (USRH1789101459905 §7.4):
   * misma ruta que `getTenantTrial`, imposible que den valores distintos
   * para el mismo tenant.
   */
  async resolveTrialsForBusinessUnits(ids: number[]): Promise<Map<number, PlatformTenantTrial>> {
    const result = new Map<number, PlatformTenantTrial>()
    if (ids.length === 0) {
      return result
    }

    const rows = await this.fetchTrialRowsForBuIds(ids)
    const hoyIso = toBusinessDateString()
    const bySubscriptionId = new Map<string, PlatformTenantTrial>()
    const outcomeInputs: Array<{
      id: string
      fin: string
      estado: PlatformTrialEstado
      canceledAt: unknown
    }> = []

    for (const row of rows) {
      // La consulta ya ordena por `business_unit_id, subscribed_at DESC, id
      // DESC` y solo la primera fila de cada empresa llega aquí (RN-01): el
      // amarre del mapa es siempre por `businessUnitId`, nunca por índice.
      if (result.has(row.businessUnitId)) {
        continue
      }
      const prueba = resolveTenantTrialWindow(row, hoyIso)
      result.set(row.businessUnitId, prueba)
      const subscriptionId = String(row.subscriptionId)
      bySubscriptionId.set(subscriptionId, prueba)
      outcomeInputs.push({
        id: subscriptionId,
        fin: prueba.fin,
        estado: prueba.estado,
        canceledAt: row.canceledAt,
      })
    }

    const outcomes = await this.resolveOutcomes(outcomeInputs)
    for (const [subscriptionId, outcome] of outcomes) {
      const prueba = bySubscriptionId.get(subscriptionId)
      if (prueba) {
        prueba.resultado = outcome.resultado
        prueba.fechaResultado = outcome.fechaResultado
      }
    }

    return result
  }

  /**
   * Universo de todas las pruebas vivas de la plataforma. `status =
   * 'trialing'` es, por construcción, exactamente ese universo: solo
   * `createSubscription()` asigna ese estado y siempre con `trial_ends_at`
   * poblado, y el UNIQUE `uq_billing_subscription_live_business_unit`
   * garantiza a lo más una suscripción viva por empresa (RN-01).
   */
  async listLiveTrials(): Promise<PlatformLiveTrialRef[]> {
    const rows = await db
      .from('billing_subscriptions as bs')
      .join('business_units as bu', 'bu.business_unit_id', 'bs.business_unit_id')
      .whereNull('bs.billing_subscription_deleted_at')
      .whereNull('bu.business_unit_deleted_at')
      .where('bs.billing_subscription_status', 'trialing')
      .select([
        ...TRIAL_SUBSCRIPTION_COLUMNS,
        'bu.business_unit_public_id as publicId',
        'bu.business_unit_name as nombre',
      ])

    const hoyIso = toBusinessDateString()
    return (
      rows as Array<TrialSubscriptionRow & { publicId: string; nombre: string }>
    ).map((row) => ({
      businessUnitId: row.businessUnitId,
      publicId: row.publicId,
      nombre: row.nombre,
      trial: resolveTenantTrialWindow(row, hoyIso),
    }))
  }

  // ─── Privadas ───────────────────────────────────────────────────────────────

  /**
   * Resuelve `resultado` y `fechaResultado` de un lote de suscripciones
   * terminadas (USRH1789101459905 §7.4). En lote por construcción: dos
   * consultas totales (pagos y transiciones) sea una o sean cien
   * suscripciones — nunca una por tenant. Sin entrada para las `viva` (RN-07:
   * no se evalúa nada, ni se llama a la base por ellas).
   *
   * Orden de decisión, el pago gana siempre sobre la cancelación (es lo que
   * hace la tarjeta de Movimiento y es lo que sostiene la paridad):
   *   1. Hay primer pago → `'convirtio'` si su día civil es `<= fin`
   *      (inclusive, RN-06), si no `'convirtio-despues-de-vencer'` (RN-08:
   *      NO es terminal — cambia en cuanto exista un pago, sin importar qué
   *      resultado se había leído antes).
   *   2. Sin pago, con cancelación dentro de la ventana (`<= fin`) → `'cancelo'`.
   *   3. Sin pago, sin cancelación en ventana → `'vencio-sin-pago'`, con
   *      `fechaResultado` = `cut_date` de la transición `trial_*` de esa
   *      suscripción, o `fin` si nunca hubo bitácora (prueba anterior al reloj).
   */
  private async resolveOutcomes(
    subscriptions: Array<{
      id: string
      fin: string
      estado: PlatformTrialEstado
      canceledAt: unknown
    }>
  ): Promise<Map<string, { resultado: PlatformTrialResultado; fechaResultado: string }>> {
    const result = new Map<string, { resultado: PlatformTrialResultado; fechaResultado: string }>()
    const terminadas = subscriptions.filter((s) => s.estado === 'terminada')
    if (terminadas.length === 0) {
      return result
    }

    const ids = terminadas.map((s) => s.id)
    const [firstPayments, trialTransitions] = await Promise.all([
      this.flowService.getFirstPaymentBySubscription(ids),
      this.flowService.getTrialTransitionBySubscription(ids),
    ])

    for (const sub of terminadas) {
      result.set(
        sub.id,
        resolveSingleTrialOutcome({
          fin: sub.fin,
          paidAt: firstPayments.get(sub.id),
          canceledAt: sub.canceledAt,
          transitionCutDate: trialTransitions.get(sub.id)?.cutDate ?? null,
        })
      )
    }

    return result
  }

  /**
   * La suscripción que ES la prueba de la empresa: la más reciente, no
   * borrada, con `trial_ends_at` poblado — sin importar si sigue siendo la
   * viva (RN-01: la respuesta sigue trayendo la prueba que sí tuvo aunque la
   * empresa hoy tenga contratada otra suscripción sin prueba).
   */
  private async fetchTrialRow(businessUnitId: number): Promise<TrialSubscriptionRow | null> {
    const row = await db
      .from('billing_subscriptions as bs')
      .join('business_units as bu', 'bu.business_unit_id', 'bs.business_unit_id')
      .where('bs.business_unit_id', businessUnitId)
      .whereNotNull('bs.billing_subscription_trial_ends_at')
      .whereNull('bs.billing_subscription_deleted_at')
      .whereNull('bu.business_unit_deleted_at')
      .orderBy('bs.billing_subscription_subscribed_at', 'desc')
      .orderBy('bs.billing_subscription_id', 'desc')
      .limit(1)
      .select(TRIAL_SUBSCRIPTION_COLUMNS)
      .first()

    return (row as TrialSubscriptionRow | undefined) ?? null
  }

  private async fetchTrialRowsForBuIds(ids: number[]): Promise<TrialSubscriptionRow[]> {
    const rows = await db
      .from('billing_subscriptions as bs')
      .join('business_units as bu', 'bu.business_unit_id', 'bs.business_unit_id')
      .whereIn('bs.business_unit_id', ids)
      .whereNotNull('bs.billing_subscription_trial_ends_at')
      .whereNull('bs.billing_subscription_deleted_at')
      .whereNull('bu.business_unit_deleted_at')
      .orderBy('bs.business_unit_id', 'asc')
      .orderBy('bs.billing_subscription_subscribed_at', 'desc')
      .orderBy('bs.billing_subscription_id', 'desc')
      .select(TRIAL_SUBSCRIPTION_COLUMNS)

    return rows as TrialSubscriptionRow[]
  }
}
