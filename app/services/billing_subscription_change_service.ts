import BillingSubscription, {
  LIVE_SUBSCRIPTION_STATUSES,
  type BillingSubscriptionStatus,
} from '#models/billing_subscription'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingTenantService from '#services/billing_tenant_service'
import EmployeeQuotaService from '#services/employee_quota_service'
import {
  employeesBelowActiveHeadcountError,
  noLiveSubscriptionError,
  periodNotProratableError,
  subscriptionPastDueError,
} from '../helpers/billing_tenant_error.js'
import {
  daysBetweenBusinessDates,
  toBusinessDateString,
  toCalendarIsoDate,
} from '../utils/business_date.js'

export type SubscriptionChangeType = 'increase' | 'decrease' | 'none'

export interface SubscriptionChangePreviewAmounts {
  unitAmount?: number
  pricePerEmployee?: number
  discountPercent: number
  discountAmount?: number
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
}

export interface SubscriptionChangePreviewCurrentPeriod {
  start: string
  end: string
  totalDays: number
  remainingDays: number
}

export interface SubscriptionChangePreviewProration {
  differenceCents: number
  totalDays: number
  remainingDays: number
  amountCents: number
  amountPesos: number
}

export interface SubscriptionChangePreview {
  billingSubscriptionId: number
  billingPlanId: number
  billingPlanPriceId: number
  billingSubscriptionStatus: BillingSubscriptionStatus
  currency: string
  changeType: SubscriptionChangeType
  contractedEmployees: number
  requestedEmployees: number
  activeEmployees: number
  minimumContractedEmployees: number
  currentPeriod: SubscriptionChangePreviewCurrentPeriod
  cutDate: string
  currentAmounts: SubscriptionChangePreviewAmounts
  newAmounts: SubscriptionChangePreviewAmounts
  proration: SubscriptionChangePreviewProration | null
  effectiveFrom: string | null
}

/**
 * Motor de previsualización del cambio de cantidad contratada (USRH1786107870847).
 * Agnóstico de contexto HTTP: recibe `businessUnitId` explícito y no lee TenantContext.
 */
export default class BillingSubscriptionChangeService {
  private readonly tenantService = new BillingTenantService()
  private readonly catalog = new BillingCatalogService()
  private readonly employeeQuotaService = new EmployeeQuotaService()

  /**
   * Previsualiza el cambio de cantidad contratada de una empresa.
   * Solo lectura: no abre transacción y no escribe nada.
   */
  async previewChange(
    businessUnitId: number,
    requestedEmployees: number
  ): Promise<SubscriptionChangePreview> {
    const subscription = await this.loadLiveSubscription(businessUnitId)

    if (subscription.billingSubscriptionStatus === 'past_due') {
      throw subscriptionPastDueError()
    }

    const todayIso = toBusinessDateString()
    const periodStartIso = toCalendarIsoDate(subscription.billingSubscriptionCurrentPeriodStart)
    const periodEndIso = toCalendarIsoDate(subscription.billingSubscriptionCurrentPeriodEnd)

    const { totalDays, remainingDays } = this.resolvePeriodDays(
      periodStartIso,
      periodEndIso,
      todayIso
    )

    this.tenantService.assertContractedEmployees(requestedEmployees)

    const activeEmployees = await this.employeeQuotaService.countActiveEmployees(businessUnitId)
    const minimumContractedEmployees =
      this.tenantService.resolveMinimumContractedEmployees(activeEmployees)

    if (requestedEmployees < minimumContractedEmployees) {
      throw employeesBelowActiveHeadcountError(activeEmployees, minimumContractedEmployees)
    }

    await this.tenantService.assertPlanReadyToSubscribe(subscription.billingPlanId, todayIso)

    const contractedEmployees = subscription.billingSubscriptionContractedEmployees
    const changeType = this.classifyChangeType(contractedEmployees, requestedEmployees)

    const resolved = await this.catalog.resolvePrice(
      subscription.billingPlanId,
      requestedEmployees,
      todayIso
    )

    const currentAmounts = this.buildCurrentAmounts(subscription)
    const newAmounts = this.buildNewAmounts(resolved)

    const proration =
      changeType === 'increase'
        ? this.buildProration(currentAmounts.total, newAmounts.total, totalDays, remainingDays)
        : null

    const effectiveFrom = changeType === 'decrease' ? periodEndIso : null

    return {
      billingSubscriptionId: subscription.billingSubscriptionId,
      billingPlanId: subscription.billingPlanId,
      billingPlanPriceId: subscription.billingPlanPriceId,
      billingSubscriptionStatus: subscription.billingSubscriptionStatus,
      currency: subscription.billingSubscriptionContractedCurrency,
      changeType,
      contractedEmployees,
      requestedEmployees,
      activeEmployees,
      minimumContractedEmployees,
      currentPeriod: {
        start: periodStartIso!,
        end: periodEndIso!,
        totalDays,
        remainingDays,
      },
      cutDate: periodEndIso!,
      currentAmounts,
      newAmounts,
      proration,
      effectiveFrom,
    }
  }

  private async loadLiveSubscription(businessUnitId: number): Promise<BillingSubscription> {
    const subscription = await BillingSubscription.query()
      .where('business_unit_id', businessUnitId)
      .whereIn('billing_subscription_status', LIVE_SUBSCRIPTION_STATUSES)
      .whereNull('billing_subscription_deleted_at')
      .orderBy('billing_subscription_id', 'desc')
      .first()

    if (!subscription) {
      throw noLiveSubscriptionError()
    }

    return subscription
  }

  private resolvePeriodDays(
    periodStartIso: string | null,
    periodEndIso: string | null,
    todayIso: string
  ): { totalDays: number; remainingDays: number } {
    if (!periodStartIso || !periodEndIso) {
      throw periodNotProratableError()
    }

    const totalDays = daysBetweenBusinessDates(periodStartIso, periodEndIso)
    const remainingDays = daysBetweenBusinessDates(todayIso, periodEndIso)

    if (totalDays <= 0 || remainingDays <= 0) {
      throw periodNotProratableError()
    }

    return { totalDays, remainingDays }
  }

  private classifyChangeType(
    contractedEmployees: number,
    requestedEmployees: number
  ): SubscriptionChangeType {
    if (requestedEmployees > contractedEmployees) {
      return 'increase'
    }
    if (requestedEmployees < contractedEmployees) {
      return 'decrease'
    }
    return 'none'
  }

  private buildCurrentAmounts(
    subscription: BillingSubscription
  ): SubscriptionChangePreviewAmounts {
    return {
      unitAmount: Number(subscription.billingSubscriptionContractedUnitAmount),
      discountPercent: Number(subscription.billingSubscriptionDiscountPercent),
      subtotal: Number(subscription.billingSubscriptionContractedSubtotal),
      taxRate: Number(subscription.billingSubscriptionContractedTaxRate),
      taxAmount: Number(subscription.billingSubscriptionContractedTaxAmount),
      total: Number(subscription.billingSubscriptionContractedTotal),
    }
  }

  private buildNewAmounts(resolved: {
    pricePerEmployee: number
    discountPercent: number
    discountAmount: number
    subtotal: number
    taxRate: number
    taxAmount: number
    total: number
  }): SubscriptionChangePreviewAmounts {
    return {
      pricePerEmployee: resolved.pricePerEmployee,
      discountPercent: resolved.discountPercent,
      discountAmount: resolved.discountAmount,
      subtotal: resolved.subtotal,
      taxRate: resolved.taxRate,
      taxAmount: resolved.taxAmount,
      total: resolved.total,
    }
  }

  private buildProration(
    currentTotalPesos: number,
    newTotalPesos: number,
    totalDays: number,
    remainingDays: number
  ): SubscriptionChangePreviewProration {
    const differenceCents = Math.round((newTotalPesos - currentTotalPesos) * 100)
    const amountCents = Math.round((differenceCents * remainingDays) / totalDays)

    return {
      differenceCents,
      totalDays,
      remainingDays,
      amountCents,
      amountPesos: amountCents / 100,
    }
  }
}
