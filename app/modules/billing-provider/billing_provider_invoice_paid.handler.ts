import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import BillingPayment from '#models/billing_payment'
import type BillingSubscription from '#models/billing_subscription'
import { BILLING_PAYMENT_ERROR_CODES } from '#constants/billing_payment_error_codes'
import { BillingPaymentServiceError } from '#exceptions/billing_payment_service_error'
import { BillingProviderServiceError } from '#exceptions/billing_provider_service_error'
import {
  BILLING_PROVIDER_KEYS,
  isBillingInvoiceProvider,
  type ProviderInvoice,
  type ProviderInvoiceLine,
} from '#modules/billing-provider/billing_provider.port'
import {
  CYCLE_BILLING_REASON,
  invoicePeriodBusinessDate,
} from '#modules/billing-provider/billing_provider_invoice_created.handler'
import {
  invoiceSubscriptionNotFound,
  operationNotAvailable,
  paymentSettlementFailed,
} from '#modules/billing-provider/billing_provider.errors'
import type {
  BillingProviderEventContext,
  BillingProviderEventOutcome,
  BillingProviderEventHandler,
} from '#modules/billing-provider/billing_provider_event_handlers'
import BillingInternalNotificationService, {
  type NotifyProviderPaymentMisalignedParams,
  type NotifyProviderPaymentUnsettledParams,
  type ProviderPaymentUnsettledReason,
} from '#services/billing_internal_notification_service'
import BillingPaymentService, {
  type ProviderSettlementPeriod,
} from '#services/billing_payment_service'
import { getBusinessTimeZone } from '#utils/business_date'

const PROVIDER_INVOICE_UQ = 'uq_billing_payment_provider_invoice'
const AMOUNT_MIN_CENTS = 100
const AMOUNT_MAX_CENTS = 99_999_999

export function isInvoiceBoundToSubscription(
  invoice: ProviderInvoice,
  subscription: BillingSubscription | null
): subscription is BillingSubscription {
  if (subscription === null) {
    return false
  }
  if (subscription.billingSubscriptionProvider !== BILLING_PROVIDER_KEYS.STRIPE) {
    return false
  }
  if (invoice.subscriptionRef !== subscription.billingSubscriptionStripeSubscriptionId) {
    return false
  }
  if (invoice.customerRef !== subscription.billingSubscriptionStripeCustomerId) {
    return false
  }
  return true
}

export function selectProviderPeriodLine(invoice: ProviderInvoice): ProviderInvoiceLine | null {
  const items = invoice.lines.filter((line) => line.source === 'subscription_item')
  if (items.length !== 1) {
    return null
  }
  const line = items[0]!
  if (!Number.isInteger(line.periodStart) || !Number.isInteger(line.periodEnd)) {
    return null
  }
  if (line.periodStart >= line.periodEnd) {
    return null
  }
  return line
}

export function providerPeriodFromInvoice(invoice: ProviderInvoice): ProviderSettlementPeriod | null {
  const line = selectProviderPeriodLine(invoice)
  if (line === null) {
    return null
  }
  const start = invoicePeriodBusinessDate(line.periodStart)
  const end = invoicePeriodBusinessDate(line.periodEnd)
  if (start >= end) {
    return null
  }
  return { start, end }
}

export function invoiceDebtCents(invoice: ProviderInvoice): number {
  return invoice.lines
    .filter((line) => line.valanserhPart === 'increase_debt')
    .reduce((sum, line) => sum + line.amountCents, 0)
}

export function isPaymentMisaligned(
  payment: { periodsCovered: number; debtAppliedCents: number },
  invoiceDebt: number,
  hadProviderPeriod: boolean
): boolean {
  if (payment.debtAppliedCents !== invoiceDebt) {
    return true
  }
  if (!hadProviderPeriod) {
    return true
  }
  if (payment.periodsCovered === 0) {
    return true
  }
  if (payment.periodsCovered !== 1) {
    return true
  }
  return false
}

export function isProviderInvoiceDuplicate(error: unknown): boolean {
  if (error === null || error === undefined || typeof error !== 'object') {
    return false
  }
  const err = error as {
    code?: string
    sqlMessage?: string
    original?: { code?: string; sqlMessage?: string }
  }
  const code = err.code ?? err.original?.code
  const sqlMessage = err.sqlMessage ?? err.original?.sqlMessage ?? ''
  return code === 'ER_DUP_ENTRY' && sqlMessage.includes(PROVIDER_INVOICE_UQ)
}

function isFirstAttempt(context: BillingProviderEventContext): boolean {
  return (context.attempt ?? 1) === 1
}

function subscriptionBindFailureReason(
  invoice: ProviderInvoice,
  subscription: BillingSubscription | null
): string {
  if (subscription === null) {
    return 'no-subscription-in-context'
  }
  if (subscription.billingSubscriptionProvider !== BILLING_PROVIDER_KEYS.STRIPE) {
    return 'manual-provider'
  }
  if (invoice.subscriptionRef !== subscription.billingSubscriptionStripeSubscriptionId) {
    return 'subscription-ref-mismatch'
  }
  if (invoice.customerRef !== subscription.billingSubscriptionStripeCustomerId) {
    return 'customer-ref-mismatch'
  }
  return 'unknown-bind-failure'
}

function paidAtIso(invoice: ProviderInvoice, eventCreatedAt: number): string {
  const zone = getBusinessTimeZone()
  if (invoice.paidAt !== undefined && invoice.paidAt !== null) {
    return DateTime.fromSeconds(invoice.paidAt, { zone }).toISO()!
  }
  return DateTime.fromSeconds(eventCreatedAt, { zone }).toISO()!
}

export default class BillingProviderInvoicePaidHandler implements BillingProviderEventHandler {
  constructor(
    private readonly paymentService: BillingPaymentService = new BillingPaymentService(),
    private readonly notifications: BillingInternalNotificationService = new BillingInternalNotificationService()
  ) {}

  async handle(context: BillingProviderEventContext): Promise<BillingProviderEventOutcome> {
    const { event, provider, billingSubscription: sub } = context

    if (event.objectType !== 'invoice' || event.objectId === null) {
      return { status: 'ignored', reason: 'not-invoice' }
    }

    if (!isBillingInvoiceProvider(provider)) {
      throw operationNotAvailable('handleInvoicePaid')
    }

    const invoiceRef = event.objectId
    let invoice: ProviderInvoice

    try {
      invoice = await provider.readInvoice(invoiceRef, { includePayments: true })
    } catch (error) {
      if (isFirstAttempt(context)) {
        await this.notifyUnsettled(this.unsettledFromContext(context, invoiceRef, {
          reason: 'settlement-failed',
          errorCode:
            error instanceof BillingProviderServiceError ? error.errorCode : null,
          amountPaidCents: null,
          currency: null,
          subscriptionRef: null,
        }))
      }
      throw error
    }

    if (invoice.amountPaidCents === undefined || invoice.amountPaidOffStripeCents === undefined) {
      const missingPayments = operationNotAvailable('readInvoicePayments')
      if (isFirstAttempt(context)) {
        await this.notifyUnsettled(this.unsettledFromContext(context, invoiceRef, {
          reason: 'settlement-failed',
          errorCode: missingPayments.errorCode,
          amountPaidCents: null,
          currency: null,
          subscriptionRef: invoice.subscriptionRef,
        }))
      }
      throw missingPayments
    }

    if (invoice.status !== 'paid') {
      return { status: 'ignored', reason: 'not-paid' }
    }

    if (invoice.amountPaidOffStripeCents > 0) {
      await this.notifyUnsettled(
        this.unsettledFromInvoice(context, sub, invoice, {
          reason: 'paid-off-stripe',
          errorCode: null,
        })
      )
      return { status: 'ignored', reason: 'paid-off-stripe' }
    }

    if (invoice.amountPaidCents === 0) {
      if (invoice.billingReason === CYCLE_BILLING_REASON) {
        await this.notifyUnsettled(
          this.unsettledFromInvoice(context, sub, invoice, {
            reason: 'zero-amount-cycle',
            errorCode: null,
          })
        )
      }
      return { status: 'ignored', reason: 'zero-amount' }
    }

    if (invoice.subscriptionRef === null) {
      await this.notifyUnsettled(
        this.unsettledFromInvoice(context, sub, invoice, {
          reason: 'not-subscription-invoice',
          errorCode: null,
        })
      )
      return { status: 'ignored', reason: 'not-subscription-invoice' }
    }

    if (invoice.billingReason !== CYCLE_BILLING_REASON) {
      await this.notifyUnsettled(
        this.unsettledFromInvoice(context, sub, invoice, {
          reason: 'not-cycle',
          errorCode: null,
        })
      )
      return { status: 'ignored', reason: 'not-cycle' }
    }

    if (!isInvoiceBoundToSubscription(invoice, sub)) {
      if (isFirstAttempt(context)) {
        await this.notifyUnsettled(
          this.unsettledFromContext(context, invoiceRef, {
            reason: 'subscription-not-found',
            errorCode: null,
            amountPaidCents: invoice.amountPaidCents,
            currency: invoice.currency,
            subscriptionRef: invoice.subscriptionRef,
          })
        )
      }
      throw invoiceSubscriptionNotFound(
        invoiceRef,
        subscriptionBindFailureReason(invoice, sub)
      )
    }

    const boundSub = sub

    const existing = await BillingPayment.query()
      .where('billing_payment_provider_invoice_id', invoiceRef)
      .first()

    if (existing !== null) {
      if (existing.billingSubscriptionId === boundSub.billingSubscriptionId) {
        return { status: 'ignored', reason: 'already-settled' }
      }
      await this.notifyUnsettled(
        this.unsettledFromInvoice(context, boundSub, invoice, {
          reason: 'already-settled-elsewhere',
          errorCode: null,
        })
      )
      return { status: 'ignored', reason: 'already-settled-elsewhere' }
    }

    if (boundSub.billingSubscriptionStatus === 'canceled') {
      await this.notifyUnsettled(
        this.unsettledFromInvoice(context, boundSub, invoice, {
          reason: 'subscription-canceled',
          errorCode: null,
        })
      )
      return { status: 'ignored', reason: 'subscription-canceled' }
    }

    const expectedCurrency = boundSub.billingSubscriptionContractedCurrency.toLowerCase()
    if (invoice.currency !== expectedCurrency) {
      await this.notifyUnsettled(
        this.unsettledFromInvoice(context, boundSub, invoice, {
          reason: 'currency-mismatch',
          errorCode: null,
        })
      )
      return { status: 'ignored', reason: 'currency-mismatch' }
    }

    const amountPaidCents = invoice.amountPaidCents
    if (
      !Number.isInteger(amountPaidCents) ||
      amountPaidCents < AMOUNT_MIN_CENTS ||
      amountPaidCents > AMOUNT_MAX_CENTS
    ) {
      await this.notifyUnsettled(
        this.unsettledFromInvoice(context, boundSub, invoice, {
          reason: 'amount-out-of-range',
          errorCode: null,
        })
      )
      return { status: 'ignored', reason: 'amount-out-of-range' }
    }

    const providerPeriod = providerPeriodFromInvoice(invoice)
    const hadProviderPeriod = providerPeriod !== null

    try {
      const settled = await db.transaction((trx) =>
        this.paymentService.settlePaymentWithin(
          {
            subscriptionId: boundSub.billingSubscriptionId,
            amountCents: amountPaidCents,
            allowCustomAmount: true,
            method: 'card',
            reference: null,
            paidAt: paidAtIso(invoice, event.createdAt),
            receipt: null,
            ...(providerPeriod !== null ? { providerPeriod } : {}),
            providerInvoiceId: invoiceRef,
            providerPaymentRef: invoice.paymentIntentRef ?? null,
            providerEventId: event.id,
          },
          trx
        )
      )

      const providerPeriodApplied =
        hadProviderPeriod && settled.payment.billingPaymentPeriodsCovered === 1

      if (
        isPaymentMisaligned(
          {
            periodsCovered: settled.payment.billingPaymentPeriodsCovered,
            debtAppliedCents: settled.payment.billingPaymentDebtAppliedCents,
          },
          invoiceDebtCents(invoice),
          hadProviderPeriod
        )
      ) {
        const misaligned: NotifyProviderPaymentMisalignedParams = {
          billingSubscriptionId: boundSub.billingSubscriptionId,
          businessUnitId: boundSub.businessUnitId,
          billingPaymentId: settled.payment.billingPaymentId,
          invoiceRef,
          eventRef: event.id,
          amountPaidCents,
          periodsCovered: settled.payment.billingPaymentPeriodsCovered,
          debtAppliedCents: settled.payment.billingPaymentDebtAppliedCents,
          invoiceDebtCents: invoiceDebtCents(invoice),
          providerPeriod,
          providerPeriodApplied,
        }
        await this.notifications.notifyProviderPaymentMisaligned(misaligned)
      }

      return { status: 'processed' }
    } catch (error) {
      if (isProviderInvoiceDuplicate(error)) {
        return { status: 'processed' }
      }

      if (
        error instanceof BillingPaymentServiceError &&
        error.errorCode === BILLING_PAYMENT_ERROR_CODES.SUBSCRIPTION_CANCELED
      ) {
        await this.notifyUnsettled(
          this.unsettledFromInvoice(context, boundSub, invoice, {
            reason: 'subscription-canceled',
            errorCode: null,
          })
        )
        return { status: 'ignored', reason: 'subscription-canceled' }
      }

      if (isFirstAttempt(context)) {
        const innerCode =
          error instanceof BillingPaymentServiceError
            ? error.errorCode
            : error instanceof BillingProviderServiceError
              ? error.errorCode
              : null
        await this.notifyUnsettled(
          this.unsettledFromInvoice(context, boundSub, invoice, {
            reason: 'settlement-failed',
            errorCode: innerCode,
          })
        )
      }

      const innerCode =
        error instanceof BillingPaymentServiceError
          ? error.errorCode
          : error instanceof BillingProviderServiceError
            ? error.errorCode
            : null
      throw paymentSettlementFailed(invoiceRef, innerCode)
    }
  }

  private unsettledFromContext(
    context: BillingProviderEventContext,
    invoiceRef: string,
    fields: {
      reason: ProviderPaymentUnsettledReason
      errorCode: string | null
      amountPaidCents: number | null
      currency: string | null
      subscriptionRef: string | null
    }
  ): NotifyProviderPaymentUnsettledParams {
    const sub = context.billingSubscription
    let billingSubscriptionId: number | null = null
    let businessUnitId: number | null = null
    if (
      sub !== null &&
      fields.subscriptionRef !== null &&
      sub.billingSubscriptionProvider === BILLING_PROVIDER_KEYS.STRIPE &&
      sub.billingSubscriptionStripeSubscriptionId === fields.subscriptionRef
    ) {
      billingSubscriptionId = sub.billingSubscriptionId
      businessUnitId = sub.businessUnitId
    }
    return {
      billingSubscriptionId,
      businessUnitId,
      invoiceRef,
      subscriptionRef: fields.subscriptionRef,
      eventRef: context.event.id,
      reason: fields.reason,
      errorCode: fields.errorCode,
      amountPaidCents: fields.amountPaidCents,
      currency: fields.currency,
    }
  }

  private unsettledFromInvoice(
    context: BillingProviderEventContext,
    sub: BillingSubscription | null,
    invoice: ProviderInvoice,
    fields: {
      reason: ProviderPaymentUnsettledReason
      errorCode: string | null
    }
  ): NotifyProviderPaymentUnsettledParams {
    const bound = isInvoiceBoundToSubscription(invoice, sub)
    return {
      billingSubscriptionId: bound ? sub.billingSubscriptionId : null,
      businessUnitId: bound ? sub.businessUnitId : null,
      invoiceRef: invoice.invoiceRef,
      subscriptionRef: invoice.subscriptionRef,
      eventRef: context.event.id,
      reason: fields.reason,
      errorCode: fields.errorCode,
      amountPaidCents: invoice.amountPaidCents ?? null,
      currency: invoice.currency,
    }
  }

  private async notifyUnsettled(params: NotifyProviderPaymentUnsettledParams): Promise<void> {
    await this.notifications.notifyProviderPaymentUnsettled(params)
  }
}
