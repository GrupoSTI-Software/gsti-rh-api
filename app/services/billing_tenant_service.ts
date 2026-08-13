import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingSubscription, { LIVE_SUBSCRIPTION_STATUSES } from '#models/billing_subscription'
import BillingSubscriptionChange, {
  LIVE_SUBSCRIPTION_CHANGE_STATUSES,
  type BillingSubscriptionChangeType,
} from '#models/billing_subscription_change'
import BusinessUnit, { type BusinessUnitOrigin } from '#models/business_unit'
import BillingCatalogService, { type ResolvedPrice } from '#services/billing_catalog_service'
import BillingSubscriptionService from '#services/billing_subscription_service'
import EmployeeQuotaService from '#services/employee_quota_service'
import { BILLING_SUBSCRIPTION_ERROR_CODES } from '../constants/billing_subscription_error_codes.js'
import { BillingSubscriptionServiceError } from '../exceptions/billing_subscription_service_error.js'
import {
  employeesAboveSafetyCapError,
  employeesBelowActiveHeadcountError,
  employeesNotBlockOfTenError,
  MIN_CONTRACTED_EMPLOYEES,
  EMPLOYEE_BLOCK_SIZE,
  originNotSelfServiceError,
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
  /** Inicio del periodo vigente, fecha calendario ISO (USRH1786107870865). */
  billingSubscriptionCurrentPeriodStart: string | null
  /** Fin del periodo vigente = fecha del próximo pago, fecha calendario ISO (USRH1786107870865). */
  billingSubscriptionCurrentPeriodEnd: string | null
  /**
   * Cambio de cantidad en curso (`pending_payment` o `scheduled`), o `null`.
   * Forma alineada con la orden 2 (USRH1786107870871).
   */
  liveChange: TenantLiveChangeSnapshot | null
}

/** Importes congelados del periodo al tamaño nuevo (pesos, con Number aplicado). */
export interface TenantLiveChangeAmounts {
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
}

/** Adeudo prorrateado del aumento; solo presentación (centavos + pesos). */
export interface TenantLiveChangeProration {
  amountCents: number
  amountPesos: number
}

export interface TenantLiveChangeSnapshot {
  billingSubscriptionChangeId: number
  type: BillingSubscriptionChangeType
  status: 'pending_payment' | 'scheduled'
  previousEmployees: number
  newEmployees: number
  newAmounts: TenantLiveChangeAmounts
  /** Null en reducción agendada o cuando no hay adeudo. */
  proration: TenantLiveChangeProration | null
  /** Fecha calendario ISO; solo en reducción agendada. */
  effectiveAt: string | null
  requestedAt: string
}

export interface MySubscriptionResult {
  businessUnitOrigin: BusinessUnitOrigin
  subscription: TenantSubscriptionSnapshot | null
  /**
   * Mínimo contratable para empresas `self_service` (con o sin suscripción viva).
   * El muro de contratación lo ignora cuando hay suscripción viva; la pantalla de
   * ajuste de cantidad (orden 8) lo consume.
   */
  minimumContractedEmployees: number | null
}

/** Respuesta 201 de `POST /api/billing/subscription` (lista blanca). */
export interface ContractSubscriptionResult {
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
  firstPaymentDate: string
}

/**
 * Superficie de lectura de billing orientada al visitante anónimo y al tenant
 * autenticado (USRH1785441817226). Reutiliza el cálculo del catálogo landlord
 * sin reimplementar la fórmula de precio.
 */
export default class BillingTenantService {
  private readonly catalog = new BillingCatalogService()
  private readonly subscriptionService = new BillingSubscriptionService()
  private readonly employeeQuotaService = new EmployeeQuotaService()

  /**
   * Mínimo contratable: el siguiente bloque de 10 por encima de la plantilla activa.
   * Con 0 activos devuelve el mínimo general de la superficie self-service (10).
   */
  resolveMinimumContractedEmployees(activeEmployees: number): number {
    if (activeEmployees <= 0) {
      return MIN_CONTRACTED_EMPLOYEES
    }
    return Math.max(
      MIN_CONTRACTED_EMPLOYEES,
      Math.ceil(activeEmployees / EMPLOYEE_BLOCK_SIZE) * EMPLOYEE_BLOCK_SIZE
    )
  }

  /**
   * Re-contratación self-service desde el tenant autenticado (USRH1785441822058).
   * Solo empresas de origen `self_service` sin suscripción viva; nace sin periodo de prueba.
   */
  async contractSubscription(
    billingPlanId: number,
    contractedEmployees: number
  ): Promise<ContractSubscriptionResult> {
    const businessUnitId = TenantContext.getScope()[0]

    if (!businessUnitId || businessUnitId <= 0) {
      throw new BillingSubscriptionServiceError(
        'No se pudo resolver la empresa activa del tenant',
        BILLING_SUBSCRIPTION_ERROR_CODES.BUSINESS_UNIT_NOT_FOUND,
        500,
        'empresa-no-resuelta',
        'No se pudo determinar la empresa activa para contratar.'
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

    if (businessUnit.businessUnitOrigin !== 'self_service') {
      throw originNotSelfServiceError()
    }

    this.assertContractedEmployees(contractedEmployees)

    const activeEmployees = await this.employeeQuotaService.countActiveEmployees(
      businessUnitId
    )
    const minimum = this.resolveMinimumContractedEmployees(activeEmployees)

    if (minimum > PUBLIC_CONTRACTED_EMPLOYEES_SAFETY_CAP) {
      throw employeesAboveSafetyCapError()
    }

    if (contractedEmployees < minimum) {
      throw employeesBelowActiveHeadcountError(activeEmployees, minimum)
    }

    const subscription = await this.subscriptionService.createSubscription({
      businessUnitPublicId: businessUnit.businessUnitPublicId,
      billingPlanId,
      contractedEmployees,
      skipTrial: true,
    })

    await subscription.load('plan')

    return this.toContractSubscriptionResult(subscription)
  }

  /**
   * Regla 3 — cantidad contratada en bloques de 10 (mínimo 10) con tope defensivo.
   * Método compartido con signup/start y complete() (hermana B).
   */
  assertContractedEmployees(employeeCount: number): void {
    if (employeeCount > PUBLIC_CONTRACTED_EMPLOYEES_SAFETY_CAP) {
      throw employeesAboveSafetyCapError()
    }

    if (employeeCount < MIN_CONTRACTED_EMPLOYEES || employeeCount % EMPLOYEE_BLOCK_SIZE !== 0) {
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

    let minimumContractedEmployees: number | null = null

    if (businessUnit.businessUnitOrigin === 'self_service') {
      const activeEmployees = await this.employeeQuotaService.countActiveEmployees(
        businessUnitId
      )
      minimumContractedEmployees = this.resolveMinimumContractedEmployees(activeEmployees)
    }

    return {
      businessUnitOrigin: businessUnit.businessUnitOrigin,
      subscription: subscription
        ? await this.toTenantSubscriptionSnapshot(subscription, businessUnitId)
        : null,
      minimumContractedEmployees,
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

  private async findLiveSubscriptionChange(
    businessUnitId: number,
    billingSubscriptionId: number
  ): Promise<BillingSubscriptionChange | null> {
    return BillingSubscriptionChange.query()
      .where('business_unit_id', businessUnitId)
      .where('billing_subscription_id', billingSubscriptionId)
      .whereIn('billing_subscription_change_status', LIVE_SUBSCRIPTION_CHANGE_STATUSES)
      .whereNull('billing_subscription_change_deleted_at')
      .orderBy('billing_subscription_change_id', 'asc')
      .first()
  }

  private toLiveChangeSnapshot(
    change: BillingSubscriptionChange
  ): TenantLiveChangeSnapshot | null {
    if (!LIVE_SUBSCRIPTION_CHANGE_STATUSES.includes(change.billingSubscriptionChangeStatus)) {
      return null
    }

    const amountCents = change.billingSubscriptionChangeProratedAmountCents
    const proration =
      change.billingSubscriptionChangeType === 'increase' && amountCents > 0
        ? {
            amountCents,
            amountPesos: amountCents / 100,
          }
        : null

    return {
      billingSubscriptionChangeId: change.billingSubscriptionChangeId,
      type: change.billingSubscriptionChangeType,
      status: change.billingSubscriptionChangeStatus as 'pending_payment' | 'scheduled',
      previousEmployees: change.billingSubscriptionChangePreviousEmployees,
      newEmployees: change.billingSubscriptionChangeNewEmployees,
      newAmounts: {
        subtotal: Number(change.billingSubscriptionChangeSubtotal),
        taxRate: Number(change.billingSubscriptionChangeTaxRate),
        taxAmount: Number(change.billingSubscriptionChangeTaxAmount),
        total: Number(change.billingSubscriptionChangeTotal),
      },
      proration,
      effectiveAt:
        change.billingSubscriptionChangeType === 'decrease'
          ? toCalendarIsoDate(change.billingSubscriptionChangeEffectiveAt)
          : null,
      requestedAt: change.billingSubscriptionChangeCreatedAt.toISO() ?? '',
    }
  }

  private async toTenantSubscriptionSnapshot(
    subscription: BillingSubscription,
    businessUnitId: number
  ): Promise<TenantSubscriptionSnapshot> {
    const trialEndsAtIso = toCalendarIsoDate(subscription.billingSubscriptionTrialEndsAt)
    const liveChangeRow = await this.findLiveSubscriptionChange(
      businessUnitId,
      subscription.billingSubscriptionId
    )

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
      billingSubscriptionCurrentPeriodStart: toCalendarIsoDate(
        subscription.billingSubscriptionCurrentPeriodStart
      ),
      billingSubscriptionCurrentPeriodEnd: toCalendarIsoDate(
        subscription.billingSubscriptionCurrentPeriodEnd
      ),
      liveChange: liveChangeRow ? this.toLiveChangeSnapshot(liveChangeRow) : null,
    }
  }

  private toContractSubscriptionResult(
    subscription: BillingSubscription
  ): ContractSubscriptionResult {
    const trialEndsAtIso = toCalendarIsoDate(subscription.billingSubscriptionTrialEndsAt)
    const firstPaymentDate = toBusinessDateString()

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
      firstPaymentDate,
    }
  }
}
