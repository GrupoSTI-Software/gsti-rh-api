import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import Employee from '#models/employee'
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

    const counts = await Employee.query()
      .whereIn(
        'business_unit_id',
        businessUnits.map((bu) => bu.businessUnitId)
      )
      .whereNull('employee_deleted_at')
      .count('* as total')
      .groupBy('business_unit_id')
      .select('business_unit_id')

    const countByBusinessUnitId = new Map<number, number>()
    for (const row of counts as unknown as Array<{
      business_unit_id: number
      total: string | number
    }>) {
      countByBusinessUnitId.set(row.business_unit_id, Number(row.total))
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
   */
  async createSubscription(input: CreateSubscriptionInput): Promise<BillingSubscription> {
    const businessUnit = await BusinessUnit.query()
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

    try {
      return await db.transaction(async (trx) => {
        // Bloquea (si existe) la fila de la suscripción viva actual de esta
        // empresa para serializar altas concurrentes sobre la misma empresa.
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

        return BillingSubscription.create(
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
      })
    } catch (error) {
      // Defensa en profundidad: si dos altas concurrentes pasaron el FOR UPDATE
      // (p. ej. motores/aislamientos distintos), el índice UNIQUE de
      // `live_business_unit_id` rechaza el segundo INSERT.
      const dbError = error as { code?: string; sqlMessage?: string }
      if (
        dbError?.code === ER_DUP_ENTRY &&
        dbError.sqlMessage?.includes('uq_billing_subscription_live_business_unit')
      ) {
        throw new BillingSubscriptionServiceError(
          `Empresa ${input.businessUnitPublicId} ya tiene una suscripción viva`,
          BILLING_SUBSCRIPTION_ERROR_CODES.ALREADY_LIVE,
          409,
          'suscripcion-viva-existente',
          'Esta empresa ya tiene una suscripción viva. Cancélala antes de contratar una nueva.'
        )
      }
      throw error
    }
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
    const result = await Employee.query()
      .where('business_unit_id', businessUnitId)
      .whereNull('employee_deleted_at')
      .count('* as total')
      .first()

    return Number((result as unknown as { total: string | number } | null)?.total ?? 0)
  }
}
