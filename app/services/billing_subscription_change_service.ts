import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingSubscription, {
  LIVE_SUBSCRIPTION_STATUSES,
  type BillingSubscriptionStatus,
} from '#models/billing_subscription'
import BillingSubscriptionChange, {
  LIVE_SUBSCRIPTION_CHANGE_STATUSES,
  type BillingSubscriptionChangeStatus,
} from '#models/billing_subscription_change'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingTenantService from '#services/billing_tenant_service'
import EmployeeQuotaService from '#services/employee_quota_service'
import {
  changeNotAnIncreaseError,
  employeesBelowActiveHeadcountError,
  noLiveSubscriptionError,
  periodNotProratableError,
  subscriptionChangeConflictError,
  subscriptionPastDueError,
} from '../helpers/billing_tenant_error.js'
import {
  daysBetweenBusinessDates,
  toBusinessDateString,
  toCalendarIsoDate,
  todayInBusinessZone,
} from '../utils/business_date.js'

export type SubscriptionChangeType = 'increase' | 'decrease' | 'none'

export type SubscriptionChangeNextStep = 'awaiting_payment' | 'applied'

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

export interface SubscriptionIncreaseRequestResult {
  billingSubscriptionChangeId: number
  billingSubscriptionId: number
  billingSubscriptionChangeType: 'increase'
  billingSubscriptionChangeStatus: BillingSubscriptionChangeStatus
  previousEmployees: number
  newEmployees: number
  contractedEmployees: number
  currency: string
  newAmounts: {
    pricePerEmployee: number
    discountPercent: number
    subtotal: number
    taxRate: number
    taxAmount: number
    total: number
  }
  proration: SubscriptionChangePreviewProration | null
  cutDate: string
  effectiveAt: string | null
  appliedAt: string | null
  nextStep: SubscriptionChangeNextStep
  nextStepMessage: string
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

  /**
   * Registra la solicitud de AUMENTO de cantidad contratada de una empresa (USRH1786107870850).
   *
   * NO lee TenantContext ni HttpContext: recibe la empresa explícitamente, igual que
   * previewChange. No calcula: delega en previewChange y transcribe. No sube la cantidad
   * contratada salvo en periodo de prueba.
   */
  async requestIncrease(
    businessUnitId: number,
    requestedEmployees: number
  ): Promise<SubscriptionIncreaseRequestResult> {
    const preview = await this.previewChange(businessUnitId, requestedEmployees)

    if (preview.changeType !== 'increase') {
      throw changeNotAnIncreaseError(preview.contractedEmployees, preview.requestedEmployees)
    }

    const change = await db.transaction(async (trx) => {
      const fresh = await BillingSubscription.query({ client: trx })
        .where('business_unit_id', businessUnitId)
        .whereIn('billing_subscription_status', LIVE_SUBSCRIPTION_STATUSES)
        .whereNull('billing_subscription_deleted_at')
        .orderBy('billing_subscription_id', 'desc')
        .forUpdate()
        .first()

      if (!fresh) {
        throw noLiveSubscriptionError()
      }

      this.assertPreviewStillValid(fresh, preview)

      await BillingSubscriptionChange.query({ client: trx })
        .where('billing_subscription_id', fresh.billingSubscriptionId)
        .where('business_unit_id', businessUnitId)
        .whereIn('billing_subscription_change_status', LIVE_SUBSCRIPTION_CHANGE_STATUSES)
        .whereNull('billing_subscription_change_deleted_at')
        .update({ billing_subscription_change_status: 'canceled' })

      const isTrial = fresh.billingSubscriptionStatus === 'trialing'
      const proratedCents = isTrial
        ? 0
        : Math.max(0, preview.proration?.amountCents ?? 0)
      const appliedAt = isTrial ? todayInBusinessZone() : null

      const created = await BillingSubscriptionChange.create(
        {
          billingSubscriptionId: fresh.billingSubscriptionId,
          businessUnitId,
          billingSubscriptionChangeType: 'increase',
          billingSubscriptionChangeStatus: isTrial ? 'applied' : 'pending_payment',
          billingSubscriptionChangePreviousEmployees: preview.contractedEmployees,
          billingSubscriptionChangeNewEmployees: preview.requestedEmployees,
          billingSubscriptionChangeUnitAmount: preview.newAmounts.pricePerEmployee!,
          billingSubscriptionChangeDiscountPercent: preview.newAmounts.discountPercent,
          billingSubscriptionChangeTaxRate: preview.newAmounts.taxRate,
          billingSubscriptionChangeSubtotal: preview.newAmounts.subtotal,
          billingSubscriptionChangeTaxAmount: preview.newAmounts.taxAmount,
          billingSubscriptionChangeTotal: preview.newAmounts.total,
          billingSubscriptionChangeProratedAmountCents: proratedCents,
          billingSubscriptionChangeEffectiveAt: null,
          billingSubscriptionChangeAppliedAt: appliedAt,
          billingSubscriptionChangeBillingPaymentId: null,
          billingSubscriptionChangeNotApplicableReason: null,
        },
        { client: trx }
      )

      if (isTrial) {
        await this.applyTrialIncreaseSnapshot(fresh, preview, trx)
      }

      return created
    })

    return this.buildIncreaseRequestResult(preview, change)
  }

  private assertPreviewStillValid(
    fresh: BillingSubscription,
    preview: SubscriptionChangePreview
  ): void {
    if (fresh.billingSubscriptionId !== preview.billingSubscriptionId) {
      throw subscriptionChangeConflictError()
    }

    if (Number(fresh.billingSubscriptionContractedEmployees) !== preview.contractedEmployees) {
      throw subscriptionChangeConflictError()
    }

    const freshPeriodEnd = toCalendarIsoDate(fresh.billingSubscriptionCurrentPeriodEnd)
    if (freshPeriodEnd !== preview.currentPeriod.end) {
      throw subscriptionChangeConflictError()
    }
  }

  private async applyTrialIncreaseSnapshot(
    subscription: BillingSubscription,
    preview: SubscriptionChangePreview,
    trx: TransactionClientContract
  ): Promise<void> {
    const todayIso = toBusinessDateString()
    const resolved = await this.catalog.resolvePrice(
      subscription.billingPlanId,
      preview.requestedEmployees,
      todayIso
    )

    const currentPrice = await BillingPlanPrice.query({ client: trx })
      .where('billing_plan_id', subscription.billingPlanId)
      .where('billing_plan_price_effective_from', '<=', todayIso)
      .orderBy('billing_plan_price_effective_from', 'desc')
      .first()

    if (!currentPrice) {
      throw subscriptionChangeConflictError()
    }

    subscription.useTransaction(trx)
    subscription.billingSubscriptionContractedEmployees = preview.requestedEmployees
    subscription.billingPlanPriceId = currentPrice.billingPlanPriceId
    subscription.billingSubscriptionContractedUnitAmount = resolved.pricePerEmployee
    subscription.billingSubscriptionDiscountPercent = resolved.discountPercent
    subscription.billingSubscriptionContractedSubtotal = resolved.subtotal
    subscription.billingSubscriptionContractedTaxRate = resolved.taxRate
    subscription.billingSubscriptionContractedTaxAmount = resolved.taxAmount
    subscription.billingSubscriptionContractedTotal = resolved.total
    subscription.billingSubscriptionContractedCurrency = resolved.currency
    await subscription.save()
  }

  private buildIncreaseRequestResult(
    preview: SubscriptionChangePreview,
    change: BillingSubscriptionChange
  ): SubscriptionIncreaseRequestResult {
    const isTrial = change.billingSubscriptionChangeStatus === 'applied'
    const proration = isTrial ? null : preview.proration

    return {
      billingSubscriptionChangeId: change.billingSubscriptionChangeId,
      billingSubscriptionId: change.billingSubscriptionId,
      billingSubscriptionChangeType: 'increase',
      billingSubscriptionChangeStatus: change.billingSubscriptionChangeStatus,
      previousEmployees: change.billingSubscriptionChangePreviousEmployees,
      newEmployees: change.billingSubscriptionChangeNewEmployees,
      contractedEmployees: isTrial ? preview.requestedEmployees : preview.contractedEmployees,
      currency: preview.currency,
      newAmounts: {
        pricePerEmployee: preview.newAmounts.pricePerEmployee!,
        discountPercent: preview.newAmounts.discountPercent,
        subtotal: preview.newAmounts.subtotal,
        taxRate: preview.newAmounts.taxRate,
        taxAmount: preview.newAmounts.taxAmount,
        total: preview.newAmounts.total,
      },
      proration,
      cutDate: preview.cutDate,
      effectiveAt: null,
      appliedAt: change.billingSubscriptionChangeAppliedAt?.toISO() ?? null,
      nextStep: isTrial ? 'applied' : 'awaiting_payment',
      nextStepMessage: isTrial
        ? `Tu cantidad contratada ya es de ${preview.requestedEmployees} empleados. Tu primer pago saldrá a ese importe.`
        : 'Registramos tu solicitud. Tu cupo aumentará cuando confirmemos el pago del adeudo.',
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
