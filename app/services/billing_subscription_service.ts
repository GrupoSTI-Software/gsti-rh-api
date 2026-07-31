import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import BusinessUnit from '#models/business_unit'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingSubscription, { LIVE_SUBSCRIPTION_STATUSES } from '#models/billing_subscription'
import BillingCatalogService from '#services/billing_catalog_service'
import { BILLING_SUBSCRIPTION_ERROR_CODES } from '../constants/billing_subscription_error_codes.js'
import { BillingSubscriptionServiceError } from '../exceptions/billing_subscription_service_error.js'
import { todayInBusinessZone, toBusinessDateString, toCalendarIsoDate } from '../utils/business_date.js'

// ---------------------------------------------------------------------------
// Tipos de entrada / salida
// ---------------------------------------------------------------------------

export interface CreateSubscriptionInput {
  businessUnitPublicId: string
  billingPlanId: number
  contractedEmployees?: number
}

export interface BusinessUnitListItem {
  businessUnitPublicId: string
  businessUnitName: string
  activeEmployees: number
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

  // ─── Empresas (picker del alta) ──────────────────────────────────────────

  /**
   * Lista empresas activas con su conteo de empleados activos, para el
   * picker del drawer de alta (`GET /api/platform/billing/business-units`).
   */
  async listBusinessUnits(): Promise<BusinessUnitListItem[]> {
    const businessUnits = await BusinessUnit.query()
      .where('business_unit_active', 1)
      .whereNull('business_unit_deleted_at')
      .orderBy('business_unit_name', 'asc')

    if (businessUnits.length === 0) {
      return []
    }

    // Se usa db.from() en vez de Employee.query() para evitar que el mixin
    // withBusinessUnitScope() del modelo Employee intercepte la query global.
    const counts = await db
      .from('employees')
      .whereIn(
        'business_unit_id',
        businessUnits.map((bu) => bu.businessUnitId)
      )
      .whereNull('employee_deleted_at')
      .groupBy('business_unit_id')
      .select('business_unit_id')
      .count('* as total')

    const countByBusinessUnitId = new Map<number, number>()
    for (const row of counts as Array<{ business_unit_id: number; total: string | number }>) {
      countByBusinessUnitId.set(Number(row.business_unit_id), Number(row.total))
    }

    return businessUnits.map((bu) => ({
      businessUnitPublicId: bu.businessUnitPublicId,
      businessUnitName: bu.businessUnitName,
      activeEmployees: countByBusinessUnitId.get(bu.businessUnitId) ?? 0,
    }))
  }

  // ─── Suscripciones ────────────────────────────────────────────────────────

  async listSubscriptions(): Promise<BillingSubscription[]> {
    return BillingSubscription.query()
      .whereNull('billing_subscription_deleted_at')
      .preload('businessUnit')
      .preload('plan')
      .orderBy('billing_subscription_id', 'asc')
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

    if (!plan.isPublished) {
      throw new BillingSubscriptionServiceError(
        `Plan ${input.billingPlanId} no está publicado`,
        BILLING_SUBSCRIPTION_ERROR_CODES.PLAN_NOT_PUBLISHED,
        422,
        'plan-no-publicado',
        'Solo se puede contratar sobre un plan publicado del catálogo.'
      )
    }

    const contractedEmployees =
      input.contractedEmployees ?? (await this.countActiveEmployees(businessUnit.businessUnitId))

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
    const trialDays = resolved.trialDays
    const trialEndsAt = nowBusiness.plus({ days: trialDays })

    const existingLive = await BillingSubscription.query({ client: trx })
      .where('business_unit_id', businessUnit.businessUnitId)
      .whereIn('billing_subscription_status', LIVE_SUBSCRIPTION_STATUSES)
      .whereNull('billing_subscription_deleted_at')
      .forUpdate()
      .first()

    if (existingLive) {
      throw new BillingSubscriptionServiceError(
        `Empresa ${input.businessUnitPublicId} ya tiene una suscripción viva (${existingLive.billingSubscriptionId})`,
        BILLING_SUBSCRIPTION_ERROR_CODES.ALREADY_LIVE,
        409,
        'suscripcion-viva-existente',
        'Esta empresa ya tiene una suscripción viva. Cancélala antes de contratar una nueva.'
      )
    }

    try {
      return await BillingSubscription.create(
        {
          businessUnitId: businessUnit.businessUnitId,
          billingPlanId: input.billingPlanId,
          billingPlanPriceId: currentPrice.billingPlanPriceId,
          billingSubscriptionProvider: 'manual',
          billingSubscriptionStatus: 'trialing',
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
          billingSubscriptionCurrentPeriodEnd: trialEndsAt,
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

    if (!plan.isPublished) {
      throw new BillingSubscriptionServiceError(
        `Plan ${billingPlanId} no está publicado`,
        BILLING_SUBSCRIPTION_ERROR_CODES.PLAN_NOT_PUBLISHED,
        422,
        'plan-no-publicado',
        'Solo se puede cambiar a un plan publicado del catálogo.'
      )
    }

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

    return db.transaction(async (trx) => {
      subscription.useTransaction(trx)
      subscription.billingSubscriptionStatus = 'canceled'
      subscription.billingSubscriptionCanceledAt = todayInBusinessZone()
      subscription.billingSubscriptionLiveBusinessUnitId = null
      await subscription.save()
      return subscription
    })
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

  private async countActiveEmployees(businessUnitId: number): Promise<number> {
    const result = await db
      .from('employees')
      .where('business_unit_id', businessUnitId)
      .whereNull('employee_deleted_at')
      .count('* as total')
      .first()

    return Number((result as { total: string | number } | null)?.total ?? 0)
  }
}
