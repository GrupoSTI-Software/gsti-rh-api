import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingSubscription, { LIVE_SUBSCRIPTION_STATUSES } from '#models/billing_subscription'
import BusinessUnit, { type BusinessUnitOrigin } from '#models/business_unit'
import BillingCatalogService, { type ResolvedPrice } from '#services/billing_catalog_service'
import { BILLING_SUBSCRIPTION_ERROR_CODES } from '../constants/billing_subscription_error_codes.js'
import { BillingSubscriptionServiceError } from '../exceptions/billing_subscription_service_error.js'
import {
  employeesAboveSafetyCapError,
  employeesNotBlockOfTenError,
  planUnavailableError,
  PUBLIC_CONTRACTED_EMPLOYEES_SAFETY_CAP,
  rethrowCatalogErrorForPublicSurface,
} from '../helpers/billing_tenant_error.js'
import { TenantContext } from '../utils/tenant_context.js'
import { todayInBusinessZone, toBusinessDateString, toCalendarIsoDate } from '../utils/business_date.js'

// ---------------------------------------------------------------------------
// Tipos de salida (lista blanca de la superficie pública / tenant)
// ---------------------------------------------------------------------------

export interface PublicPlanCurrentPrice {
  pricePerEmployee: number
  currency: string
  taxRate: number
  trialDays: number
}

export interface PublicPlanVolumeTier {
  minEmployees: number
  discountPercent: number
}

export interface PublicPlanListItem {
  billingPlanId: number
  billingPlanName: string
  billingPlanDescription: string | null
  currentPrice: PublicPlanCurrentPrice
  volumeTiers: PublicPlanVolumeTier[]
}

export interface PublicResolvedPlanPrice {
  billingPlanId: number
  employeeCount: number
  pricePerEmployee: number
  currency: string
  discountPercent: number
  discountAmount: number
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
  trialDays: number
  firstPaymentDate: string
  resolvedAt: string
}

export interface TenantSubscriptionSnapshot {
  billingSubscriptionId: number
  billingPlanId: number
  billingPlanName: string
  billingSubscriptionStatus: BillingSubscription['billingSubscriptionStatus']
  billingSubscriptionContractedEmployees: number
  billingSubscriptionContractedUnitAmount: number
  billingSubscriptionDiscountPercent: number
  billingSubscriptionContractedCurrency: string
  billingSubscriptionContractedTaxRate: number
  billingSubscriptionContractedSubtotal: number
  billingSubscriptionContractedTaxAmount: number
  billingSubscriptionContractedTotal: number
  billingSubscriptionContractedTrialDays: number
  billingSubscriptionTrialEndsAt: string | null
  firstPaymentDate: string | null
}

export interface MySubscriptionResult {
  businessUnitOrigin: BusinessUnitOrigin
  subscription: TenantSubscriptionSnapshot | null
}

/**
 * Superficie de lectura de billing orientada al visitante anónimo y al tenant
 * autenticado (USRH1785441817226). Reutiliza el cálculo del catálogo landlord
 * sin reimplementar la fórmula de precio.
 */
export default class BillingTenantService {
  private readonly catalog = new BillingCatalogService()

  /**
   * Regla 3 — cantidad contratada en bloques de 10 (mínimo 10) con tope defensivo.
   * Método compartido con signup/start y complete() (hermana B).
   */
  assertContractedEmployees(employeeCount: number): void {
    if (employeeCount > PUBLIC_CONTRACTED_EMPLOYEES_SAFETY_CAP) {
      throw employeesAboveSafetyCapError()
    }

    if (employeeCount < 10 || employeeCount % 10 !== 0) {
      throw employeesNotBlockOfTenError()
    }
  }

  /**
   * Plan vendible para `POST /api/auth/signup/start` (respuesta opaca 404).
   */
  async assertPublicSellablePlan(planId: number, referenceDate?: string): Promise<void> {
    const refDate = referenceDate ?? toBusinessDateString()
    const sellable = await this.findSellablePlan(planId, refDate)
    if (!sellable) {
      throw planUnavailableError()
    }
  }

  /**
   * Plan listo para contratar al cerrar el registro (errores explícitos 404/422).
   */
  async assertPlanReadyToSubscribe(planId: number, referenceDate?: string): Promise<void> {
    const refDate = referenceDate ?? toBusinessDateString()
    const plan = await BillingPlan.query().where('billing_plan_id', planId).first()

    if (!plan) {
      throw new BillingSubscriptionServiceError(
        `Plan ${planId} no encontrado`,
        BILLING_SUBSCRIPTION_ERROR_CODES.PLAN_NOT_FOUND,
        404,
        'plan-no-encontrado',
        'El plan solicitado no existe.'
      )
    }

    if (!plan.isPublished || !plan.billingPlanActive) {
      throw new BillingSubscriptionServiceError(
        `Plan ${planId} no está publicado`,
        BILLING_SUBSCRIPTION_ERROR_CODES.PLAN_NOT_PUBLISHED,
        422,
        'plan-no-publicado',
        'Solo se puede contratar sobre un plan publicado del catálogo.'
      )
    }

    if (!this.pickCurrentPrice(await this.loadPlanPrices(planId), refDate)) {
      throw new BillingSubscriptionServiceError(
        `Plan ${planId} no tiene precio vigente para ${refDate}`,
        BILLING_SUBSCRIPTION_ERROR_CODES.NO_ACTIVE_PRICE,
        422,
        'sin-precio-vigente',
        'El plan no tiene un precio vigente en el catálogo para la fecha de hoy.'
      )
    }
  }

  /** Catálogo público: solo planes vendibles con precio vigente (regla 1). */
  async listPublicPlans(referenceDate?: string): Promise<PublicPlanListItem[]> {
    const refDate = referenceDate ?? toBusinessDateString()
    const plans = await BillingPlan.query()
      .whereNotNull('billing_plan_published_at')
      .where('billing_plan_active', 1)
      .whereNull('billing_plan_deleted_at')
      .preload('prices', (query) => {
        query.orderBy('billing_plan_price_effective_from', 'asc')
      })
      .preload('volumeTiers', (query) => {
        query
          .whereNull('billing_volume_tier_deleted_at')
          .orderBy('billing_volume_tier_min_employees', 'asc')
      })
      .orderBy('billing_plan_id', 'asc')

    const items: PublicPlanListItem[] = []

    for (const plan of plans) {
      const currentPrice = this.pickCurrentPrice(plan.prices, refDate)
      if (!currentPrice) {
        continue
      }

      items.push(this.toPublicPlanListItem(plan, currentPrice))
    }

    return items
  }

  /**
   * Precio resuelto para visitantes anónimos. Valida bloques de 10, verifica
   * que el plan sea vendible y delega el cálculo a `resolvePrice`.
   */
  async resolvePublicPlanPrice(
    planId: number,
    employeeCount: number,
    referenceDate?: string
  ): Promise<PublicResolvedPlanPrice> {
    this.assertContractedEmployees(employeeCount)

    const refDate = referenceDate ?? toBusinessDateString()
    const sellable = await this.findSellablePlan(planId, refDate)
    if (!sellable) {
      throw planUnavailableError()
    }

    let resolved: ResolvedPrice
    try {
      resolved = await this.catalog.resolvePrice(planId, employeeCount, refDate)
    } catch (error) {
      rethrowCatalogErrorForPublicSurface(error)
    }

    const firstPaymentDate = toBusinessDateString(
      todayInBusinessZone().plus({ days: resolved.trialDays })
    )

    return {
      billingPlanId: resolved.billingPlanId,
      employeeCount: resolved.employeeCount,
      pricePerEmployee: resolved.pricePerEmployee,
      currency: resolved.currency,
      discountPercent: resolved.discountPercent,
      discountAmount: resolved.discountAmount,
      subtotal: resolved.subtotal,
      taxRate: resolved.taxRate,
      taxAmount: resolved.taxAmount,
      total: resolved.total,
      trialDays: resolved.trialDays,
      firstPaymentDate,
      resolvedAt: resolved.resolvedAt,
    }
  }

  /**
   * Contratación viva del tenant activo + origen de la empresa (regla 9).
   * Siempre responde datos; `subscription` puede ser null.
   */
  async getMySubscription(): Promise<MySubscriptionResult> {
    const businessUnitId = TenantContext.getScope()[0]

    if (!businessUnitId || businessUnitId <= 0) {
      throw new BillingSubscriptionServiceError(
        'No se pudo resolver la empresa activa del tenant',
        BILLING_SUBSCRIPTION_ERROR_CODES.BUSINESS_UNIT_NOT_FOUND,
        500,
        'empresa-no-resuelta',
        'No se pudo determinar la empresa activa para consultar la suscripción.'
      )
    }

    const businessUnit = await BusinessUnit.query()
      .where('business_unit_id', businessUnitId)
      .whereNull('business_unit_deleted_at')
      .first()

    if (!businessUnit) {
      throw new BillingSubscriptionServiceError(
        `Empresa ${businessUnitId} no encontrada`,
        BILLING_SUBSCRIPTION_ERROR_CODES.BUSINESS_UNIT_NOT_FOUND,
        404,
        'empresa-no-encontrada',
        'La empresa solicitada no existe.'
      )
    }

    const subscription = await BillingSubscription.query()
      .where('business_unit_id', businessUnitId)
      .whereIn('billing_subscription_status', LIVE_SUBSCRIPTION_STATUSES)
      .whereNull('billing_subscription_deleted_at')
      .preload('plan')
      .orderBy('billing_subscription_id', 'desc')
      .first()

    return {
      businessUnitOrigin: businessUnit.businessUnitOrigin,
      subscription: subscription ? this.toTenantSubscriptionSnapshot(subscription) : null,
    }
  }

  private async findSellablePlan(planId: number, referenceDate: string): Promise<BillingPlan | null> {
    const plan = await BillingPlan.query()
      .where('billing_plan_id', planId)
      .whereNotNull('billing_plan_published_at')
      .where('billing_plan_active', 1)
      .whereNull('billing_plan_deleted_at')
      .preload('prices', (query) => {
        query.orderBy('billing_plan_price_effective_from', 'asc')
      })
      .preload('volumeTiers', (query) => {
        query
          .whereNull('billing_volume_tier_deleted_at')
          .orderBy('billing_volume_tier_min_employees', 'asc')
      })
      .first()
    if (!plan) {
      return null
    }

    if (!this.pickCurrentPrice(plan.prices, referenceDate)) {
      return null
    }

    return plan
  }

  private async loadPlanPrices(planId: number): Promise<BillingPlanPrice[]> {
    return BillingPlanPrice.query()
      .where('billing_plan_id', planId)
      .orderBy('billing_plan_price_effective_from', 'asc')
  }

  private pickCurrentPrice(
    prices: BillingPlanPrice[],
    referenceDate: string
  ): BillingPlanPrice | null {
    let current: BillingPlanPrice | null = null

    for (const price of prices) {
      const effectiveFrom = toCalendarIsoDate(price.billingPlanPriceEffectiveFrom)
      if (effectiveFrom && effectiveFrom <= referenceDate) {
        current = price
      }
    }

    return current
  }

  private toPublicPlanListItem(
    plan: BillingPlan,
    currentPrice: BillingPlanPrice
  ): PublicPlanListItem {
    return {
      billingPlanId: plan.billingPlanId,
      billingPlanName: plan.billingPlanName,
      billingPlanDescription: plan.billingPlanDescription,
      currentPrice: {
        pricePerEmployee: Number(currentPrice.billingPlanPriceAmount),
        currency: currentPrice.billingPlanPriceCurrency,
        taxRate: Number(currentPrice.billingPlanPriceTaxRate),
        trialDays: currentPrice.billingPlanPriceTrialDays,
      },
      volumeTiers: plan.volumeTiers.map((tier) => ({
        minEmployees: tier.billingVolumeTierMinEmployees,
        discountPercent: tier.billingVolumeTierDiscountPercent,
      })),
    }
  }

  private toTenantSubscriptionSnapshot(
    subscription: BillingSubscription
  ): TenantSubscriptionSnapshot {
    const trialEndsAtIso = toCalendarIsoDate(subscription.billingSubscriptionTrialEndsAt)

    return {
      billingSubscriptionId: subscription.billingSubscriptionId,
      billingPlanId: subscription.billingPlanId,
      billingPlanName: subscription.plan?.billingPlanName ?? '',
      billingSubscriptionStatus: subscription.billingSubscriptionStatus,
      billingSubscriptionContractedEmployees: subscription.billingSubscriptionContractedEmployees,
      billingSubscriptionContractedUnitAmount: Number(
        subscription.billingSubscriptionContractedUnitAmount
      ),
      billingSubscriptionDiscountPercent: subscription.billingSubscriptionDiscountPercent,
      billingSubscriptionContractedCurrency: subscription.billingSubscriptionContractedCurrency,
      billingSubscriptionContractedTaxRate: Number(subscription.billingSubscriptionContractedTaxRate),
      billingSubscriptionContractedSubtotal: Number(
        subscription.billingSubscriptionContractedSubtotal
      ),
      billingSubscriptionContractedTaxAmount: Number(
        subscription.billingSubscriptionContractedTaxAmount
      ),
      billingSubscriptionContractedTotal: Number(subscription.billingSubscriptionContractedTotal),
      billingSubscriptionContractedTrialDays: subscription.billingSubscriptionContractedTrialDays,
      billingSubscriptionTrialEndsAt: trialEndsAtIso,
      firstPaymentDate: trialEndsAtIso,
    }
  }
}
