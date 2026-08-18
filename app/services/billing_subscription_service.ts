import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import BusinessUnit from '#models/business_unit'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingSubscription, { LIVE_SUBSCRIPTION_STATUSES } from '#models/billing_subscription'
import BillingCatalogService from '#services/billing_catalog_service'
import EmployeeQuotaService from '#services/employee_quota_service'
import { BILLING_SUBSCRIPTION_ERROR_CODES } from '../constants/billing_subscription_error_codes.js'
import { BillingSubscriptionServiceError } from '../exceptions/billing_subscription_service_error.js'
import {
  assertContractedEmployees,
  assertMinimumContractedEmployees,
  resolveMinimumContractedEmployees,
} from '../helpers/contracted_employees_rules.js'
import { todayInBusinessZone, toBusinessDateString, toCalendarIsoDate } from '../utils/business_date.js'

// ---------------------------------------------------------------------------
// Tipos de entrada / salida
// ---------------------------------------------------------------------------

export interface CreateSubscriptionInput {
  businessUnitPublicId: string
  billingPlanId: number
  contractedEmployees?: number
  /**
   * Sin periodo de prueba: la suscripción nace `active`, con 0 días contratados
   * de prueba y sin fecha de fin de prueba. La usa la re-contratación desde el
   * backoffice (USRH1785441822058): la prueba gratuita es una sola vez por empresa.
   */
  skipTrial?: boolean
  /**
   * Instrucción explícita de reemplazo: si la empresa ya tiene una
   * contratación viva, se cancela dentro de la misma transacción y se
   * continúa con el alta, en vez de rechazar con `ALREADY_LIVE`. Ausente o
   * `false`: comportamiento idéntico al actual (USRH1785962095087).
   */
  replaceLiveSubscription?: boolean
}

export interface BusinessUnitListItem {
  businessUnitPublicId: string
  businessUnitName: string
  activeEmployees: number
  /** Mínimo contratable: plantilla activa redondeada al siguiente bloque de 10. */
  minimumContractedEmployees: number
}

/**
 * Criterios de `GET /api/platform/billing/subscriptions` (USRH1785962095092).
 * Todos opcionales; se combinan con AND sobre la consulta.
 */
export interface ListSubscriptionsFilters {
  search?: string
  status?: BillingSubscription['billingSubscriptionStatus']
  billingPlanId?: number
  minEmployees?: number
  maxEmployees?: number
  minTotal?: number
  maxTotal?: number
  /** Fecha `YYYY-MM-DD`, día civil en zona de negocio, límite inferior inclusive. */
  trialEndsFrom?: string
  /** Fecha `YYYY-MM-DD`, día civil en zona de negocio, límite superior inclusive. */
  trialEndsTo?: string
  page?: number
  limit?: number
}

export interface ListSubscriptionsResult {
  data: BillingSubscription[]
  meta: { total: number; page: number; limit: number; lastPage: number }
}

/** Código de error MySQL para violación de índice UNIQUE (defensa en profundidad). */
const ER_DUP_ENTRY = 'ER_DUP_ENTRY'

/**
 * Lógica de negocio de las suscripciones de la plataforma Valanserh.
 *
 * Invariantes garantizados por el servicio:
 *  - Solo se puede contratar sobre un plan PUBLICADO del catálogo, de una
 *    empresa existente y ACTIVA.
 *  - Una empresa tiene una sola suscripción viva (trialing/active/past_due) a
 *    la vez. Se refuerza con `FOR UPDATE` dentro de la transacción y con el
 *    índice UNIQUE de `billing_subscription_live_business_unit_id` (defensa
 *    en profundidad ante alta concurrente).
 *  - El precio, el descuento y los días de prueba se congelan (snapshot) al
 *    contratar; un cambio posterior en el catálogo NUNCA altera una
 *    suscripción ya creada.
 *  - Es cobro manual: en ningún paso se captura, guarda o expone un dato de
 *    tarjeta, ni el identificador interno de la empresa.
 */
export default class BillingSubscriptionService {
  private readonly catalog = new BillingCatalogService()
  private readonly employeeQuota = new EmployeeQuotaService()

  // ─── Empresas (picker del alta) ──────────────────────────────────────────

  /**
   * Lista empresas activas con su conteo canónico de empleados activos y el
   * mínimo contratable, para el picker del drawer de alta
   * (`GET /api/platform/billing/business-units`). El conteo sale de
   * `EmployeeQuotaService`, fuente única (USRH1785441817258); este servicio
   * no calcula empleados activos por su cuenta.
   */
  async listBusinessUnits(): Promise<BusinessUnitListItem[]> {
    const businessUnits = await BusinessUnit.query()
      .where('business_unit_active', 1)
      .whereNull('business_unit_deleted_at')
      .orderBy('business_unit_name', 'asc')

    if (businessUnits.length === 0) {
      return []
    }

    const countByBusinessUnitId = await this.employeeQuota.countActiveEmployeesByBusinessUnits(
      businessUnits.map((bu) => bu.businessUnitId)
    )

    return businessUnits.map((bu) => {
      const activeEmployees = countByBusinessUnitId.get(bu.businessUnitId) ?? 0
      return {
        businessUnitPublicId: bu.businessUnitPublicId,
        businessUnitName: bu.businessUnitName,
        activeEmployees,
        minimumContractedEmployees: resolveMinimumContractedEmployees(activeEmployees),
      }
    })
  }

  // ─── Suscripciones ────────────────────────────────────────────────────────

  /**
   * Listado paginado de suscripciones con filtrado server-side
   * (USRH1785962095092). Sin criterios, se comporta como antes: todas las
   * suscripciones vivas, en orden `billing_subscription_id asc`. Ningún
   * filtro relaja `whereNull(deleted_at)` ni cambia el orden por defecto.
   */
  async listSubscriptions(
    filters: ListSubscriptionsFilters = {}
  ): Promise<ListSubscriptionsResult> {
    this.assertSubscriptionFilterRanges(filters)

    const page = filters.page ?? 1
    const limit = Math.min(filters.limit ?? 20, 100)

    const query = BillingSubscription.query()
      .whereNull('billing_subscription_deleted_at')
      .preload('businessUnit')
      .preload('plan')
      .orderBy('billing_subscription_id', 'asc')

    if (filters.search) {
      const term = `%${filters.search.toUpperCase()}%`
      query.whereHas('businessUnit', (buQuery) => {
        buQuery.whereRaw('UPPER(business_unit_name) LIKE ?', [term])
      })
    }

    if (filters.status !== undefined) {
      query.where('billing_subscription_status', filters.status)
    }

    if (filters.billingPlanId !== undefined) {
      query.where('billing_plan_id', filters.billingPlanId)
    }

    if (filters.minEmployees !== undefined) {
      query.where('billing_subscription_contracted_employees', '>=', filters.minEmployees)
    }

    if (filters.maxEmployees !== undefined) {
      query.where('billing_subscription_contracted_employees', '<=', filters.maxEmployees)
    }

    if (filters.minTotal !== undefined) {
      query.where('billing_subscription_contracted_total', '>=', filters.minTotal)
    }

    if (filters.maxTotal !== undefined) {
      query.where('billing_subscription_contracted_total', '<=', filters.maxTotal)
    }

    if (filters.trialEndsFrom !== undefined) {
      query.whereRaw('DATE(billing_subscription_trial_ends_at) >= ?', [filters.trialEndsFrom])
    }

    if (filters.trialEndsTo !== undefined) {
      query.whereRaw('DATE(billing_subscription_trial_ends_at) <= ?', [filters.trialEndsTo])
    }

    const paginated = await query.paginate(page, limit)
    const json = paginated.toJSON()

    return {
      data: json.data as BillingSubscription[],
      meta: {
        total: json.meta.total,
        page: json.meta.currentPage,
        limit: json.meta.perPage,
        lastPage: json.meta.lastPage,
      },
    }
  }

  /**
   * Validación cruzada de rangos (regla 7 del spec): un mínimo mayor que su
   * máximo, o un `trialEndsFrom` posterior a `trialEndsTo`, se rechaza con
   * `422 PLT.SUB.VAL_INPUT`. VineJS no ofrece una regla inclusiva de
   * comparación entre dos campos, por eso se valida aquí.
   */
  private assertSubscriptionFilterRanges(filters: ListSubscriptionsFilters): void {
    if (
      filters.minEmployees !== undefined &&
      filters.maxEmployees !== undefined &&
      filters.minEmployees > filters.maxEmployees
    ) {
      throw this.filterRangeError(
        'El mínimo de empleados contratados no puede ser mayor que el máximo.'
      )
    }

    if (
      filters.minTotal !== undefined &&
      filters.maxTotal !== undefined &&
      filters.minTotal > filters.maxTotal
    ) {
      throw this.filterRangeError(
        'El total mínimo contratado no puede ser mayor que el máximo.'
      )
    }

    if (
      filters.trialEndsFrom !== undefined &&
      filters.trialEndsTo !== undefined &&
      filters.trialEndsFrom > filters.trialEndsTo
    ) {
      throw this.filterRangeError(
        'La fecha final de fin de prueba no puede ser anterior a la inicial.'
      )
    }
  }

  private filterRangeError(detail: string): BillingSubscriptionServiceError {
    return new BillingSubscriptionServiceError(
      detail,
      BILLING_SUBSCRIPTION_ERROR_CODES.VAL_INPUT,
      422,
      'PLT.SUB.VAL_INPUT',
      detail
    )
  }

  async getSubscription(subscriptionId: number): Promise<BillingSubscription> {
    const subscription = await BillingSubscription.query()
      .where('billing_subscription_id', subscriptionId)
      .whereNull('billing_subscription_deleted_at')
      .preload('businessUnit')
      .preload('plan')
      .preload('planPrice')
      .first()

    if (!subscription) {
      throw new BillingSubscriptionServiceError(
        `Suscripción ${subscriptionId} no encontrada`,
        BILLING_SUBSCRIPTION_ERROR_CODES.NOT_FOUND,
        404,
        'suscripcion-no-encontrada',
        'La suscripción solicitada no existe.'
      )
    }

    return subscription
  }

  /**
   * Da de alta manualmente la suscripción de una empresa ya existente.
   *
   * Congela (snapshot) el precio por empleado, el descuento por volumen y los
   * días de prueba vigentes en el catálogo al momento de contratar. Nace
   * siempre en estado `trialing`, con `provider = 'manual'`.
   *
   * @param trx Transacción opcional del llamador (p. ej. `SignupDraftService.complete()`).
   * Sin `trx`, abre la suya y se comporta igual que antes (landlord).
   */
  async createSubscription(
    input: CreateSubscriptionInput,
    trx?: TransactionClientContract
  ): Promise<BillingSubscription> {
    if (trx) {
      return this.createSubscriptionWithin(input, trx)
    }

    try {
      return await db.transaction((ownTrx) => this.createSubscriptionWithin(input, ownTrx))
    } catch (error) {
      this.rethrowDuplicateLiveSubscriptionError(error, input.businessUnitPublicId)
    }
  }

  private async createSubscriptionWithin(
    input: CreateSubscriptionInput,
    trx: TransactionClientContract
  ): Promise<BillingSubscription> {
    const businessUnit = await BusinessUnit.query({ client: trx })
      .where('business_unit_public_id', input.businessUnitPublicId)
      .whereNull('business_unit_deleted_at')
      .first()

    if (!businessUnit) {
      throw new BillingSubscriptionServiceError(
        `Empresa ${input.businessUnitPublicId} no encontrada`,
        BILLING_SUBSCRIPTION_ERROR_CODES.BUSINESS_UNIT_NOT_FOUND,
        404,
        'empresa-no-encontrada',
        'La empresa solicitada no existe.'
      )
    }

    if (!businessUnit.businessUnitActive) {
      throw new BillingSubscriptionServiceError(
        `Empresa ${input.businessUnitPublicId} está inactiva`,
        BILLING_SUBSCRIPTION_ERROR_CODES.BUSINESS_UNIT_INACTIVE,
        422,
        'empresa-inactiva',
        'No se puede contratar una suscripción para una empresa inactiva.'
      )
    }

    const plan = await BillingPlan.query().where('billing_plan_id', input.billingPlanId).first()

    if (!plan) {
      throw new BillingSubscriptionServiceError(
        `Plan ${input.billingPlanId} no encontrado`,
        BILLING_SUBSCRIPTION_ERROR_CODES.PLAN_NOT_FOUND,
        404,
        'plan-no-encontrado',
        'El plan solicitado no existe.'
      )
    }

    if (!plan.isPublished || !plan.billingPlanActive) {
      throw new BillingSubscriptionServiceError(
        `Plan ${input.billingPlanId} no está publicado y vigente`,
        BILLING_SUBSCRIPTION_ERROR_CODES.PLAN_NOT_PUBLISHED,
        422,
        'plan-no-publicado',
        'Solo se puede contratar sobre un plan publicado y vigente del catálogo.'
      )
    }

    // De lo barato a lo caro: se resuelve la cantidad y se valida contra las
    // reglas de bloques de 10 / mínimo por plantilla ANTES de tocar el
    // catálogo (USRH1785962095089 §13).
    const activeEmployees = await this.employeeQuota.countActiveEmployees(
      businessUnit.businessUnitId,
      trx
    )
    const contractedEmployees =
      input.contractedEmployees ?? resolveMinimumContractedEmployees(activeEmployees)

    assertContractedEmployees(contractedEmployees)
    assertMinimumContractedEmployees(contractedEmployees, activeEmployees)

    const today = toBusinessDateString()

    let resolved
    try {
      resolved = await this.catalog.resolvePrice(input.billingPlanId, contractedEmployees, today)
    } catch {
      throw new BillingSubscriptionServiceError(
        `Plan ${input.billingPlanId} no tiene precio vigente para ${today}`,
        BILLING_SUBSCRIPTION_ERROR_CODES.NO_ACTIVE_PRICE,
        422,
        'sin-precio-vigente',
        'El plan no tiene un precio vigente en el catálogo para la fecha de hoy.'
      )
    }

    const currentPrice = await this.getCurrentPrice(input.billingPlanId, today)
    if (!currentPrice) {
      throw new BillingSubscriptionServiceError(
        `Plan ${input.billingPlanId} no tiene precio vigente para ${today}`,
        BILLING_SUBSCRIPTION_ERROR_CODES.NO_ACTIVE_PRICE,
        422,
        'sin-precio-vigente',
        'El plan no tiene un precio vigente en el catálogo para la fecha de hoy.'
      )
    }

    const nowBusiness = todayInBusinessZone()
    const skipTrial =
      input.skipTrial === true ||
      (await this.hasConsumedTrial(businessUnit.businessUnitId, trx))
    const trialDays = skipTrial ? 0 : resolved.trialDays
    const trialEndsAt = skipTrial ? null : nowBusiness.plus({ days: trialDays })
    const periodEnd = skipTrial ? nowBusiness : trialEndsAt!

    const existingLive = await BillingSubscription.query({ client: trx })
      .where('business_unit_id', businessUnit.businessUnitId)
      .whereIn('billing_subscription_status', LIVE_SUBSCRIPTION_STATUSES)
      .whereNull('billing_subscription_deleted_at')
      .forUpdate()
      .first()

    if (existingLive) {
      if (!input.replaceLiveSubscription) {
        throw new BillingSubscriptionServiceError(
          `Empresa ${input.businessUnitPublicId} ya tiene una suscripción viva (${existingLive.billingSubscriptionId})`,
          BILLING_SUBSCRIPTION_ERROR_CODES.ALREADY_LIVE,
          409,
          'suscripcion-viva-existente',
          'Esta empresa ya tiene una suscripción viva. Cancélala antes de contratar una nueva.'
        )
      }

      // Reemplazo en un solo acto: se cancela la viva DENTRO de esta misma
      // transacción, antes del INSERT, para que el índice único de la
      // columna espejo nunca vea dos filas vivas de la misma empresa.
      await this.cancelWithin(existingLive, trx)
    }

    try {
      return await BillingSubscription.create(
        {
          businessUnitId: businessUnit.businessUnitId,
          billingPlanId: input.billingPlanId,
          billingPlanPriceId: currentPrice.billingPlanPriceId,
          billingSubscriptionProvider: 'manual',
          billingSubscriptionStatus: skipTrial ? 'active' : 'trialing',
          billingSubscriptionContractedUnitAmount: resolved.pricePerEmployee,
          billingSubscriptionContractedEmployees: contractedEmployees,
          billingSubscriptionDiscountPercent: resolved.discountPercent,
          billingSubscriptionContractedTrialDays: trialDays,
          billingSubscriptionContractedCurrency: resolved.currency,
          billingSubscriptionContractedTaxRate: resolved.taxRate,
          billingSubscriptionContractedSubtotal: resolved.subtotal,
          billingSubscriptionContractedTaxAmount: resolved.taxAmount,
          billingSubscriptionContractedTotal: resolved.total,
          billingSubscriptionContractedEffectiveFrom: DateTime.fromISO(
            toCalendarIsoDate(resolved.effectiveFrom) ?? today
          ),
          billingSubscriptionTrialEndsAt: trialEndsAt,
          billingSubscriptionCurrentPeriodStart: nowBusiness,
          billingSubscriptionCurrentPeriodEnd: periodEnd,
          billingSubscriptionStripeCustomerId: null,
          billingSubscriptionStripeSubscriptionId: null,
          billingSubscriptionSubscribedAt: nowBusiness,
          billingSubscriptionLiveBusinessUnitId: businessUnit.businessUnitId,
        },
        { client: trx }
      )
    } catch (error) {
      this.rethrowDuplicateLiveSubscriptionError(error, input.businessUnitPublicId)
    }
  }

  private rethrowDuplicateLiveSubscriptionError(error: unknown, businessUnitPublicId: string): never {
    const dbError = error as { code?: string; sqlMessage?: string }
    if (
      dbError?.code === ER_DUP_ENTRY &&
      dbError.sqlMessage?.includes('uq_billing_subscription_live_business_unit')
    ) {
      throw new BillingSubscriptionServiceError(
        `Empresa ${businessUnitPublicId} ya tiene una suscripción viva`,
        BILLING_SUBSCRIPTION_ERROR_CODES.ALREADY_LIVE,
        409,
        'suscripcion-viva-existente',
        'Esta empresa ya tiene una suscripción viva. Cancélala antes de contratar una nueva.'
      )
    }

    throw error
  }

  /**
   * Cambia el plan de una suscripción existente, recongelando el snapshot
   * (precio, descuento, importes) desde el catálogo vigente a la fecha efectiva
   * (hoy en zona CDMX). No recalcula ni toca el histórico ni los pagos asentados.
   */
  async changePlan(
    subscriptionId: number,
    billingPlanId: number
  ): Promise<BillingSubscription> {
    const subscription = await this.getSubscription(subscriptionId)

    if (subscription.billingSubscriptionStatus === 'canceled') {
      throw new BillingSubscriptionServiceError(
        `Suscripción ${subscriptionId} está cancelada y no admite cambio de plan`,
        BILLING_SUBSCRIPTION_ERROR_CODES.SUBSCRIPTION_CANCELED,
        422,
        'suscripcion-cancelada',
        'La suscripción está cancelada y no admite cambio de plan ni cobro.'
      )
    }

    const plan = await BillingPlan.query().where('billing_plan_id', billingPlanId).first()

    if (!plan) {
      throw new BillingSubscriptionServiceError(
        `Plan ${billingPlanId} no encontrado`,
        BILLING_SUBSCRIPTION_ERROR_CODES.PLAN_NOT_FOUND,
        404,
        'plan-no-encontrado',
        'El plan solicitado no existe.'
      )
    }

    if (!plan.isPublished || !plan.billingPlanActive) {
      throw new BillingSubscriptionServiceError(
        `Plan ${billingPlanId} no está publicado y vigente`,
        BILLING_SUBSCRIPTION_ERROR_CODES.PLAN_NOT_PUBLISHED,
        422,
        'plan-no-publicado',
        'Solo se puede cambiar a un plan publicado y vigente del catálogo.'
      )
    }

    // Misma regla de cantidad que el alta (USRH1785962095089 §6 regla 3):
    // la cantidad contratada vigente debe seguir cumpliendo bloques de 10 y
    // el mínimo por plantilla activa, aunque la plantilla haya crecido desde
    // que se contrató.
    const contractedEmployees = subscription.billingSubscriptionContractedEmployees
    const activeEmployees = await this.employeeQuota.countActiveEmployees(
      subscription.businessUnitId
    )
    assertContractedEmployees(contractedEmployees)
    assertMinimumContractedEmployees(contractedEmployees, activeEmployees)

    const today = toBusinessDateString()
    let resolved
    try {
      resolved = await this.catalog.resolvePrice(
        billingPlanId,
        subscription.billingSubscriptionContractedEmployees,
        today
      )
    } catch {
      throw new BillingSubscriptionServiceError(
        `Plan ${billingPlanId} no tiene precio vigente para ${today}`,
        BILLING_SUBSCRIPTION_ERROR_CODES.NO_ACTIVE_PRICE,
        422,
        'sin-precio-vigente',
        'El plan no tiene un precio vigente en el catálogo para la fecha de hoy.'
      )
    }

    const currentPrice = await this.getCurrentPrice(billingPlanId, today)
    if (!currentPrice) {
      throw new BillingSubscriptionServiceError(
        `Plan ${billingPlanId} no tiene precio vigente para ${today}`,
        BILLING_SUBSCRIPTION_ERROR_CODES.NO_ACTIVE_PRICE,
        422,
        'sin-precio-vigente',
        'El plan no tiene un precio vigente en el catálogo para la fecha de hoy.'
      )
    }

    return db.transaction(async (trx) => {
      subscription.useTransaction(trx)
      subscription.billingPlanId = billingPlanId
      subscription.billingPlanPriceId = currentPrice.billingPlanPriceId
      subscription.billingSubscriptionContractedUnitAmount = resolved.pricePerEmployee
      subscription.billingSubscriptionDiscountPercent = resolved.discountPercent
      subscription.billingSubscriptionContractedSubtotal = resolved.subtotal
      subscription.billingSubscriptionContractedTaxRate = resolved.taxRate
      subscription.billingSubscriptionContractedTaxAmount = resolved.taxAmount
      subscription.billingSubscriptionContractedTotal = resolved.total
      subscription.billingSubscriptionContractedCurrency = resolved.currency
      subscription.billingSubscriptionContractedTrialDays = resolved.trialDays
      // La fecha efectiva del nuevo trato es HOY (fecha del cambio), no la fecha
      // de vigencia del precio en el catálogo (que puede ser del pasado).
      subscription.billingSubscriptionContractedEffectiveFrom = DateTime.fromISO(today)
      await subscription.save()
      return subscription
    })
  }

  // ─── Cancelación ─────────────────────────────────────────────────────────

  /**
   * Cancela una suscripción existente: establece status='canceled', registra
   * la fecha de cancelación y libera la columna espejo de unicidad.
   * No realiza borrado físico; la suscripción permanece visible en el listado.
   */
  async cancel(subscriptionId: number): Promise<BillingSubscription> {
    const subscription = await this.getSubscription(subscriptionId)

    if (subscription.billingSubscriptionStatus === 'canceled') {
      throw new BillingSubscriptionServiceError(
        `Suscripción ${subscriptionId} ya está cancelada`,
        BILLING_SUBSCRIPTION_ERROR_CODES.SUBSCRIPTION_CANCELED,
        422,
        'suscripcion-cancelada',
        'La suscripción ya está cancelada.'
      )
    }

    return db.transaction((trx) => this.cancelWithin(subscription, trx))
  }

  /**
   * Cambia el estado a 'canceled' dentro de una transacción del llamador.
   * Sin guard de "ya cancelada": el llamador es responsable de esa validación
   * (la del acto de reemplazo nunca llega aquí con una ya cancelada, porque
   * `existingLive` solo trae suscripciones vivas).
   */
  private async cancelWithin(
    subscription: BillingSubscription,
    trx: TransactionClientContract
  ): Promise<BillingSubscription> {
    subscription.useTransaction(trx)
    subscription.billingSubscriptionStatus = 'canceled'
    subscription.billingSubscriptionCanceledAt = todayInBusinessZone()
    subscription.billingSubscriptionLiveBusinessUnitId = null
    await subscription.save()
    return subscription
  }

  private async getCurrentPrice(
    billingPlanId: number,
    referenceDate: string
  ): Promise<InstanceType<typeof BillingPlanPrice> | null> {
    return BillingPlanPrice.query()
      .where('billing_plan_id', billingPlanId)
      .where('billing_plan_price_effective_from', '<=', referenceDate)
      .orderBy('billing_plan_price_effective_from', 'desc')
      .first()
  }

  /**
   * Detecta si la empresa ya gozó periodo de prueba en cualquier
   * contratación anterior, sin importar su estado ni si fue borrada
   * lógicamente: la evidencia es histórica (USRH1785962095089 §10).
   */
  private async hasConsumedTrial(
    businessUnitId: number,
    trx: TransactionClientContract
  ): Promise<boolean> {
    const row = await BillingSubscription.query({ client: trx })
      .withTrashed()
      .where('business_unit_id', businessUnitId)
      .where('billing_subscription_contracted_trial_days', '>', 0)
      .first()

    return row !== null
  }
}
