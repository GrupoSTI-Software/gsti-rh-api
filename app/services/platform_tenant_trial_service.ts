import db from '@adonisjs/lucid/services/db'
import { PLATFORM_METRIC_ERROR_CODES } from '../constants/platform_metric_error_codes.js'
import { PlatformMetricServiceError } from '../exceptions/platform_metric_service_error.js'
import {
  daysBetweenBusinessDates,
  toBusinessDateString,
  toCalendarIsoDate,
} from '../utils/business_date.js'

// ─── Tipos de retorno ─────────────────────────────────────────────────────────

export type TenantTrialState = 'viva' | 'terminada' | 'sin_prueba'

/**
 * Respuesta única de "¿cuál fue la prueba de esta empresa?" (USRH1789079078169).
 *
 * `resultado` queda apartado y siempre en `null` en esta rebanada: lo llena
 * *Resolver el resultado de la prueba sin discrepar del Panel* (USRH1789101459905,
 * RN-07/RN-08/RN-09). No se inventa ningún valor aquí.
 */
export interface TenantTrialSnapshot {
  businessUnitPublicId: string
  businessUnitName: string
  /** RN-02: existe fecha de fin de prueba registrada. `false` es respuesta válida, no error. */
  tuvoPrueba: boolean
  estado: TenantTrialState
  /** RN-03: se LEE (alta → fin), nunca se calcula restando días contratados. `null` sin prueba. */
  ventana: { inicio: string; fin: string } | null
  /** RN-04: informativo. Puede no coincidir con la longitud de `ventana` tras un cambio de plan. */
  diasContratados: number | null
  diasTranscurridos: number | null
  diasRestantes: number | null
  /**
   * RN-51/RN-52: hasta dónde tiene sentido medir esta prueba. Para una prueba
   * viva o que venció/convirtió sin cancelar, es el fin contratado (o hoy, si
   * sigue corriendo); para una que se canceló, es el día de la cancelación
   * cuando cae antes del fin. `null` sin prueba.
   */
  medicionHasta: string | null
  /** Reservado para USRH1789101459905. Siempre `null` en esta rebanada (RN-07/RN-48). */
  resultado: null
}

interface TrialSubscriptionRow {
  buId: number
  businessUnitPublicId: string
  businessUnitName: string
  status: string
  contractedTrialDays: number
  trialEndsAt: unknown
  subscribedAt: unknown
  canceledAt: unknown
}

const TRIAL_SUBSCRIPTION_COLUMNS = [
  'bu.business_unit_id as buId',
  'bu.business_unit_public_id as businessUnitPublicId',
  'bu.business_unit_name as businessUnitName',
  'bs.billing_subscription_status as status',
  'bs.billing_subscription_contracted_trial_days as contractedTrialDays',
  'bs.billing_subscription_trial_ends_at as trialEndsAt',
  'bs.billing_subscription_subscribed_at as subscribedAt',
  'bs.billing_subscription_canceled_at as canceledAt',
]

/**
 * Consultas de plataforma sobre la prueba de un tenant (USRH1789079078169).
 *
 * Estrena el área de consultas de la prueba: resuelve, con una sola
 * definición, la ventana y el estado de la prueba de cualquier empresa, en
 * las tres formas que consumen las rebanadas siguientes — individual, en
 * lote y universo de pruebas vivas. Sin migración (RN-47): todo se lee de
 * columnas que ya existen.
 *
 * Universo declarado igual al de la tarjeta de Movimiento
 * (`platform_subscription_flow_service.ts`): solo suscripciones NO borradas
 * lógicamente. Una empresa cuya única suscripción con prueba fue borrada
 * responde `sin_prueba` aquí, aunque `hasConsumedTrial()` (alta de
 * suscripción, que sí usa `.withTrashed()`) la trate como que ya la
 * consumió. Es una discrepancia declarada por el propio ticket, no un bug:
 * es el precio de que esta consulta y la tarjeta nunca difieran entre sí.
 */
export default class PlatformTenantTrialService {
  /** Prueba de una sola empresa por su `businessUnitPublicId`. */
  async resolveOne(businessUnitPublicId: string): Promise<TenantTrialSnapshot> {
    const row = await this.fetchTrialRow(businessUnitPublicId)

    if (!row) {
      const businessUnitExists = await this.businessUnitExists(businessUnitPublicId)
      if (!businessUnitExists) {
        throw new PlatformMetricServiceError(
          `Empresa ${businessUnitPublicId} no encontrada`,
          PLATFORM_METRIC_ERROR_CODES.NOT_FOUND,
          404,
          'tenant-no-encontrado',
          'La empresa solicitada no existe o no está disponible.'
        )
      }
      return this.buildNoTrialSnapshot(
        businessUnitPublicId,
        await this.fetchBusinessUnitName(businessUnitPublicId)
      )
    }

    return this.buildSnapshot(row)
  }

  /**
   * Prueba de un grupo de empresas. Los `businessUnitPublicId` que no
   * existan (o estén dados de baja lógicamente) simplemente no aparecen en
   * la respuesta — no rechazan el lote completo.
   */
  async resolveBatch(businessUnitPublicIds: string[]): Promise<TenantTrialSnapshot[]> {
    const uniqueIds = [...new Set(businessUnitPublicIds)]
    if (uniqueIds.length === 0) {
      return []
    }

    const businessUnits = await db
      .from('business_units as bu')
      .whereNull('bu.business_unit_deleted_at')
      .whereIn('bu.business_unit_public_id', uniqueIds)
      .select(['bu.business_unit_id as buId', 'bu.business_unit_public_id as businessUnitPublicId'])

    if (businessUnits.length === 0) {
      return []
    }

    const buIds = (businessUnits as Array<{ buId: number }>).map((r) => r.buId)
    const rows = await this.fetchTrialRowsForBuIds(buIds)
    const rowsByBuId = new Map(rows.map((r) => [r.buId, r]))

    const snapshots: TenantTrialSnapshot[] = []
    for (const bu of businessUnits as Array<{ buId: number; businessUnitPublicId: string }>) {
      const trialRow = rowsByBuId.get(bu.buId)
      if (trialRow) {
        snapshots.push(this.buildSnapshot(trialRow))
      } else {
        snapshots.push(
          this.buildNoTrialSnapshot(
            bu.businessUnitPublicId,
            await this.fetchBusinessUnitName(bu.businessUnitPublicId)
          )
        )
      }
    }
    return snapshots
  }

  /**
   * Universo de todas las pruebas vivas de la plataforma. `status = 'trialing'`
   * es, por construcción, exactamente el universo de pruebas vivas: solo
   * `createSubscription()` asigna ese estado y siempre con `trial_ends_at`
   * poblado (RN-01 — a lo más una por empresa, blindada por el índice único
   * de suscripción viva).
   */
  async resolveLiveUniverse(): Promise<TenantTrialSnapshot[]> {
    const rows = await db
      .from('billing_subscriptions as bs')
      .join('business_units as bu', 'bu.business_unit_id', 'bs.business_unit_id')
      .whereNull('bs.billing_subscription_deleted_at')
      .whereNull('bu.business_unit_deleted_at')
      .where('bs.billing_subscription_status', 'trialing')
      .select(TRIAL_SUBSCRIPTION_COLUMNS)

    return (rows as TrialSubscriptionRow[]).map((row) => this.buildSnapshot(row))
  }

  // ─── Privadas ───────────────────────────────────────────────────────────────

  private async businessUnitExists(businessUnitPublicId: string): Promise<boolean> {
    const row = await db
      .from('business_units')
      .whereNull('business_unit_deleted_at')
      .where('business_unit_public_id', businessUnitPublicId)
      .select('business_unit_id')
      .first()
    return row !== null
  }

  private async fetchBusinessUnitName(businessUnitPublicId: string): Promise<string> {
    const row = await db
      .from('business_units')
      .where('business_unit_public_id', businessUnitPublicId)
      .select('business_unit_name as businessUnitName')
      .first()
    return (row?.businessUnitName as string | undefined) ?? ''
  }

  /**
   * La suscripción que ES la prueba de la empresa: la más reciente, no
   * borrada, con `trial_ends_at` poblado — sin importar si sigue siendo la
   * viva (RN-01: la respuesta sigue trayendo la prueba que sí tuvo aunque la
   * empresa hoy tenga contratada otra suscripción sin prueba).
   */
  private async fetchTrialRow(businessUnitPublicId: string): Promise<TrialSubscriptionRow | null> {
    const row = await db
      .from('billing_subscriptions as bs')
      .join('business_units as bu', 'bu.business_unit_id', 'bs.business_unit_id')
      .whereNull('bu.business_unit_deleted_at')
      .where('bu.business_unit_public_id', businessUnitPublicId)
      .whereNull('bs.billing_subscription_deleted_at')
      .whereRaw(
        `bs.billing_subscription_id = (
          SELECT billing_subscription_id FROM billing_subscriptions
          WHERE business_unit_id = bs.business_unit_id
            AND billing_subscription_deleted_at IS NULL
            AND billing_subscription_trial_ends_at IS NOT NULL
          ORDER BY billing_subscription_subscribed_at DESC, billing_subscription_id DESC
          LIMIT 1
        )`
      )
      .select(TRIAL_SUBSCRIPTION_COLUMNS)
      .first()

    return (row as TrialSubscriptionRow | undefined) ?? null
  }

  private async fetchTrialRowsForBuIds(buIds: number[]): Promise<TrialSubscriptionRow[]> {
    const rows = await db
      .from('billing_subscriptions as bs')
      .join('business_units as bu', 'bu.business_unit_id', 'bs.business_unit_id')
      .whereIn('bs.business_unit_id', buIds)
      .whereNull('bs.billing_subscription_deleted_at')
      .whereRaw(
        `bs.billing_subscription_id = (
          SELECT billing_subscription_id FROM billing_subscriptions
          WHERE business_unit_id = bs.business_unit_id
            AND billing_subscription_deleted_at IS NULL
            AND billing_subscription_trial_ends_at IS NOT NULL
          ORDER BY billing_subscription_subscribed_at DESC, billing_subscription_id DESC
          LIMIT 1
        )`
      )
      .select(TRIAL_SUBSCRIPTION_COLUMNS)

    return rows as TrialSubscriptionRow[]
  }

  private buildNoTrialSnapshot(
    businessUnitPublicId: string,
    businessUnitName: string
  ): TenantTrialSnapshot {
    return {
      businessUnitPublicId,
      businessUnitName,
      tuvoPrueba: false,
      estado: 'sin_prueba',
      ventana: null,
      diasContratados: null,
      diasTranscurridos: null,
      diasRestantes: null,
      medicionHasta: null,
      resultado: null,
    }
  }

  /**
   * Arma el snapshot desde la suscripción que ES la prueba de la empresa.
   *
   * RN-06: `estado` viene del `status` de la suscripción, no de comparar
   * fechas contra hoy — así una prueba cuyo fin ya llegó o pasó, pero que el
   * proceso diario todavía no cierra (sigue en `trialing`), se sigue viendo
   * `viva` con 0 días restantes, sin adelantarse a ese proceso.
   */
  private buildSnapshot(row: TrialSubscriptionRow): TenantTrialSnapshot {
    const hoy = toBusinessDateString()
    const inicio = toCalendarIsoDate(row.subscribedAt)!
    const fin = toCalendarIsoDate(row.trialEndsAt)!
    const canceledAt = toCalendarIsoDate(row.canceledAt)

    const estado: TenantTrialState = row.status === 'trialing' ? 'viva' : 'terminada'

    // RN-51/RN-52: tope de medición.
    // - Viva: hasta hoy, nunca más allá del fin contratado.
    // - Terminada por cancelación (con fecha de baja anterior o igual al fin):
    //   hasta el día que canceló — los días posteriores no cuentan como
    //   "no usados" (RN-51).
    // - Terminada sin cancelar (venció o convirtió, RN-52): la ventana
    //   completa, sin recortar — medirla completa no distorsiona nada.
    let medicionHasta: string
    if (estado === 'viva') {
      medicionHasta = hoy < fin ? hoy : fin
    } else if (canceledAt && canceledAt < fin) {
      medicionHasta = canceledAt
    } else {
      medicionHasta = fin
    }

    // Días completos entre `inicio` y `medicionHasta` (el día `to` no cuenta,
    // así que "0 días transcurridos" en el día de alta es correcto: el primer
    // día completo se cierra hasta el día siguiente). Día civil de México
    // (RN-05), misma utilidad que el resto del área de billing.
    const diasTranscurridos = Math.max(0, daysBetweenBusinessDates(inicio, medicionHasta))
    const diasRestantes =
      estado === 'viva' ? Math.max(0, daysBetweenBusinessDates(hoy, fin)) : 0

    return {
      businessUnitPublicId: row.businessUnitPublicId,
      businessUnitName: row.businessUnitName,
      tuvoPrueba: true,
      estado,
      ventana: { inicio, fin },
      diasContratados: row.contractedTrialDays,
      diasTranscurridos,
      diasRestantes,
      medicionHasta,
      resultado: null,
    }
  }
}
