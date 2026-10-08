import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import BillingSubscription from '#models/billing_subscription'
import {
  type CompositeIncreaseAmounts,
  toPeriodAmountCents,
} from '#helpers/billing_period_amount'
import { BILLING_PROVIDER_KEYS } from '#modules/billing-provider/billing_provider.port'
import {
  isBillingInvoiceProvider,
  type ProviderInvoice,
  type ValanserhInvoicePart,
} from '#modules/billing-provider/billing_provider.port'
import {
  invoiceAmountUnavailable,
  invoiceSubscriptionNotFound,
  invoiceUnexpectedLines,
  operationNotAvailable,
} from '#modules/billing-provider/billing_provider.errors'
import type {
  BillingProviderEventContext,
  BillingProviderEventOutcome,
  BillingProviderEventHandler,
} from '#modules/billing-provider/billing_provider_event_handlers'
import BillingInternalNotificationService from '#services/billing_internal_notification_service'
import BillingPaymentService from '#services/billing_payment_service'
import BillingSubscriptionChangeService from '#services/billing_subscription_change_service'
import { BillingProviderServiceError } from '#exceptions/billing_provider_service_error'
import { getBusinessTimeZone } from '#utils/business_date'

export const CYCLE_BILLING_REASON = 'subscription_cycle'

export type CycleAmount =
  | {
      kind: 'determined'
      periodCents: number
      debtCents: number
      source: 'contract' | 'pending_increase'
    }
  | { kind: 'unavailable' }

export interface ExpectedInvoiceCharge {
  part: ValanserhInvoicePart
  amountCents: number
  description: string
}

export type InvoiceChargePlan =
  | { kind: 'ready'; missing: ExpectedInvoiceCharge[] }
  | { kind: 'mismatch' }

export function resolveCycleAmount(
  composite: CompositeIncreaseAmounts | null,
  contractPeriodCents: number | null
): CycleAmount {
  if (composite !== null) {
    const debtCents = composite.debtCents
    if (!Number.isInteger(debtCents) || debtCents < 0) {
      return { kind: 'unavailable' }
    }
    return {
      kind: 'determined',
      periodCents: composite.periodCents,
      debtCents,
      source: 'pending_increase',
    }
  }
  if (contractPeriodCents === null) {
    return { kind: 'unavailable' }
  }
  return {
    kind: 'determined',
    periodCents: contractPeriodCents,
    debtCents: 0,
    source: 'contract',
  }
}

export function invoicePeriodBusinessDate(periodStart: number): string {
  return DateTime.fromSeconds(periodStart, { zone: getBusinessTimeZone() }).toISODate()!
}

function formatPeriodDescription(start: number, end: number, employees: number, pendingIncrease: boolean): string {
  const startLabel = invoicePeriodBusinessDate(start)
  const endLabel = invoicePeriodBusinessDate(end - 1)
  const base = `Periodo ${startLabel} a ${endLabel} · ${employees} colaboradores`
  return pendingIncrease ? `${base} · incluye aumento de colaboradores` : base
}

export function buildExpectedInvoiceCharges(
  amount: CycleAmount & { kind: 'determined' },
  period: { start: number; end: number },
  employees: number | null,
  pendingIncrease: boolean
): ExpectedInvoiceCharge[] {
  const employeeCount = employees ?? 0
  const charges: ExpectedInvoiceCharge[] = [
    {
      part: 'period',
      amountCents: amount.periodCents,
      description: formatPeriodDescription(period.start, period.end, employeeCount, pendingIncrease),
    },
  ]
  if (amount.debtCents > 0) {
    charges.push({
      part: 'increase_debt',
      amountCents: amount.debtCents,
      description: 'Ajuste prorrateado por aumento de colaboradores',
    })
  }
  return charges
}

function findValanserhLine(invoice: ProviderInvoice, part: ValanserhInvoicePart) {
  return invoice.lines.filter((line) => line.valanserhPart === part)
}

export function planInvoiceCharges(
  invoice: ProviderInvoice,
  expected: ExpectedInvoiceCharge[]
): InvoiceChargePlan {
  for (const line of invoice.lines) {
    if (line.valanserhPart === null && line.amountCents !== 0) {
      return { kind: 'mismatch' }
    }
    if (line.valanserhPart !== null) {
      const matches = expected.filter((item) => item.part === line.valanserhPart)
      if (matches.length === 0) {
        return { kind: 'mismatch' }
      }
      if (matches.length > 1 || line.amountCents !== matches[0]!.amountCents) {
        return { kind: 'mismatch' }
      }
    }
  }

  const missing: ExpectedInvoiceCharge[] = []
  for (const item of expected) {
    const existing = findValanserhLine(invoice, item.part)
    if (existing.length === 0) {
      missing.push(item)
      continue
    }
    if (existing.length > 1 || existing[0]!.amountCents !== item.amountCents) {
      return { kind: 'mismatch' }
    }
  }

  return { kind: 'ready', missing }
}

function expectedTotalCents(expected: ExpectedInvoiceCharge[]): number {
  return expected.reduce((sum, item) => sum + item.amountCents, 0)
}

function countSubscriptionItemLines(invoice: ProviderInvoice): number {
  return invoice.lines.filter((line) => line.source === 'subscription_item').length
}

function findPeriodLine(invoice: ProviderInvoice) {
  const subscriptionItems = invoice.lines.filter((line) => line.source === 'subscription_item')
  if (subscriptionItems.length !== 1) {
    return null
  }
  return subscriptionItems[0]!
}

export default class BillingProviderInvoiceCreatedHandler implements BillingProviderEventHandler {
  constructor(
    private readonly changeService: BillingSubscriptionChangeService = new BillingSubscriptionChangeService(),
    private readonly paymentService: BillingPaymentService = new BillingPaymentService(),
    private readonly notifications: BillingInternalNotificationService = new BillingInternalNotificationService()
  ) {}

  async handle(context: BillingProviderEventContext): Promise<BillingProviderEventOutcome> {
    const { event, provider } = context

    if (event.objectType !== 'invoice' || event.objectId === null) {
      return { status: 'ignored', reason: 'not-invoice' }
    }

    if (!isBillingInvoiceProvider(provider)) {
      throw operationNotAvailable('handleInvoiceCreated')
    }

    const invoiceRef = event.objectId
    let invoice: ProviderInvoice
    try {
      invoice = await provider.readInvoice(invoiceRef)
    } catch (error) {
      throw error
    }

    if (invoice.status !== 'draft') {
      return { status: 'ignored', reason: 'not-draft' }
    }
    if (invoice.billingReason !== CYCLE_BILLING_REASON) {
      return { status: 'ignored', reason: 'not-cycle' }
    }

    const autoAdvanceBeforeHold = invoice.autoAdvance

    try {
      await this.#processDraftCycleInvoice(context, invoice)
      return { status: 'processed' }
    } catch (error) {
      const held = await this.#tryHold(provider, invoiceRef, event.id, error)
      if (held && autoAdvanceBeforeHold) {
        await this.notifications.notifyProviderInvoiceHeld({
          billingSubscriptionId: context.billingSubscription?.billingSubscriptionId ?? null,
          businessUnitId: context.billingSubscription?.businessUnitId ?? null,
          invoiceRef,
          subscriptionRef: invoice.subscriptionRef,
          eventRef: event.id,
          errorCode:
            error instanceof BillingProviderServiceError
              ? error.errorCode
              : 'PLT.PRV.WEBHOOK_PROCESSING_FAILED',
        })
      }
      throw error
    }
  }

  async #processDraftCycleInvoice(
    context: BillingProviderEventContext,
    invoice: ProviderInvoice
  ): Promise<void> {
    const { provider, billingSubscription: sub } = context
    if (!isBillingInvoiceProvider(provider)) {
      throw operationNotAvailable('handleInvoiceCreated')
    }

    const invoiceRef = invoice.invoiceRef

    if (sub === null) {
      throw invoiceSubscriptionNotFound(invoiceRef, 'no-subscription-in-context')
    }
    if (sub.billingSubscriptionProvider !== BILLING_PROVIDER_KEYS.STRIPE) {
      throw invoiceSubscriptionNotFound(invoiceRef, 'manual-provider')
    }
    if (invoice.subscriptionRef !== sub.billingSubscriptionStripeSubscriptionId) {
      throw invoiceSubscriptionNotFound(invoiceRef, 'subscription-ref-mismatch')
    }
    if (invoice.customerRef !== sub.billingSubscriptionStripeCustomerId) {
      throw invoiceSubscriptionNotFound(invoiceRef, 'customer-ref-mismatch')
    }

    const expectedCurrency = sub.billingSubscriptionContractedCurrency.toLowerCase()
    if (invoice.currency !== expectedCurrency) {
      throw invoiceUnexpectedLines(invoiceRef, 'currency-mismatch')
    }

    if (countSubscriptionItemLines(invoice) !== 1) {
      throw invoiceAmountUnavailable(invoiceRef, 'subscription-item-count')
    }

    for (const line of invoice.lines) {
      if (line.valanserhPart === null && line.amountCents !== 0) {
        throw invoiceUnexpectedLines(invoiceRef, 'foreign-line')
      }
    }

    const periodLine = findPeriodLine(invoice)
    if (periodLine === null) {
      throw invoiceAmountUnavailable(invoiceRef, 'no-period-line')
    }

    const businessDate = invoicePeriodBusinessDate(periodLine.periodStart)

    try {
      await this.changeService.applyScheduledDecrease(sub, businessDate)
    } catch {
      throw invoiceAmountUnavailable(invoiceRef, 'scheduled-decrease-failed')
    }

    const fresh = await BillingSubscription.query()
      .where('billing_subscription_id', sub.billingSubscriptionId)
      .where('business_unit_id', sub.businessUnitId)
      .whereNull('billing_subscription_deleted_at')
      .firstOrFail()

    let composite: CompositeIncreaseAmounts | null
    try {
      composite = await this.paymentService.resolveCompositeIncreaseAmounts(fresh)
    } catch {
      throw invoiceAmountUnavailable(invoiceRef, 'composite-read-failed')
    }

    const contractPeriodCents = toPeriodAmountCents(fresh.billingSubscriptionContractedTotal)
    const cycleAmount = resolveCycleAmount(composite, contractPeriodCents)
    if (cycleAmount.kind === 'unavailable') {
      throw invoiceAmountUnavailable(invoiceRef, 'cycle-amount-unavailable')
    }

    const expected = buildExpectedInvoiceCharges(
      cycleAmount,
      { start: periodLine.periodStart, end: periodLine.periodEnd },
      fresh.billingSubscriptionContractedEmployees,
      cycleAmount.source === 'pending_increase'
    )

    const plan = planInvoiceCharges(invoice, expected)
    if (plan.kind === 'mismatch') {
      throw invoiceUnexpectedLines(invoiceRef, 'existing-lines-mismatch')
    }

    for (const charge of plan.missing) {
      await provider.addInvoiceCharge({
        invoiceRef,
        customerRef: invoice.customerRef,
        billingSubscriptionId: fresh.billingSubscriptionId,
        part: charge.part,
        amountCents: charge.amountCents,
        currency: fresh.billingSubscriptionContractedCurrency,
        description: charge.description,
      })
    }

    const after = await provider.readInvoice(invoiceRef)
    const totalExpected = expectedTotalCents(expected)
    if (after.totalCents !== totalExpected) {
      throw invoiceUnexpectedLines(invoiceRef, 'total-mismatch')
    }

    const afterPlan = planInvoiceCharges(after, expected)
    if (afterPlan.kind === 'mismatch' || afterPlan.missing.length > 0) {
      throw invoiceUnexpectedLines(invoiceRef, 'post-add-mismatch')
    }

    if (after.autoAdvance === false) {
      await provider.resumeInvoice(invoiceRef)
    }
  }

  async #tryHold(
    provider: BillingProviderEventContext['provider'],
    invoiceRef: string,
    eventRef: string,
    originalError: unknown
  ): Promise<boolean> {
    if (!isBillingInvoiceProvider(provider)) {
      return false
    }
    try {
      await provider.holdInvoice(invoiceRef)
      return true
    } catch {
      const errorCode =
        originalError instanceof BillingProviderServiceError
          ? originalError.errorCode
          : 'unknown'
      logger.warn(
        { eventRef, invoiceRef, errorCode },
        'Cobro: no se pudo retener la factura tras fallo al ajustar'
      )
      return false
    }
  }
}
