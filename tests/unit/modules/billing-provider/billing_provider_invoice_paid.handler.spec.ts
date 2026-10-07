import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { BILLING_PROVIDER_ERROR_CODES } from '#constants/billing_provider_error_codes'
import { BILLING_PAYMENT_ERROR_CODES } from '#constants/billing_payment_error_codes'
import { BillingProviderServiceError } from '#exceptions/billing_provider_service_error'
import { BillingPaymentServiceError } from '#exceptions/billing_payment_service_error'
import ManualBillingProviderAdapter from '#modules/billing-provider/manual_billing_provider.adapter'
import BillingProviderInvoicePaidHandler, {
  invoiceDebtCents,
  isInvoiceBoundToSubscription,
  isPaymentMisaligned,
  isProviderInvoiceDuplicate,
  providerPeriodFromInvoice,
  selectProviderPeriodLine,
} from '#modules/billing-provider/billing_provider_invoice_paid.handler'
import { CYCLE_BILLING_REASON } from '#modules/billing-provider/billing_provider_invoice_created.handler'
import type {
  BillingInvoiceProviderPort,
  BillingProviderPort,
  ProviderInvoice,
  ProviderInvoiceLine,
  ReadInvoiceOptions,
} from '#modules/billing-provider/billing_provider.port'
import { BILLING_PROVIDER_KEYS } from '#modules/billing-provider/billing_provider.port'
import BillingPayment from '#models/billing_payment'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingSubscription from '#models/billing_subscription'
import BillingVolumeTier from '#models/billing_volume_tier'
import BusinessUnit from '#models/business_unit'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingPaymentService from '#services/billing_payment_service'
import BillingInternalNotificationService, {
  type NotifyProviderPaymentMisalignedParams,
  type NotifyProviderPaymentUnsettledParams,
} from '#services/billing_internal_notification_service'
import { providerRequestFailed } from '#modules/billing-provider/billing_provider.errors'
import { getBusinessTimeZone, toCalendarIsoDate } from '#utils/business_date'

const PERIOD_START = 1_793_512_800
const PERIOD_END = 1_796_104_800
const PAID_AT = 1_793_599_200
const PERIOD_AMOUNT = 1_044_000

const EVENT_FIXTURE = {
  id: 'evt_fixtureP2',
  type: 'invoice.paid' as const,
  objectType: 'invoice' as const,
  objectId: 'in_fixtureP2',
  createdAt: PAID_AT,
  livemode: false,
  fromConnectedAccount: false,
  object: {
    subscriptionRef: 'sub_fixtureP2',
    customerRef: 'cus_fixtureP2',
    status: 'paid',
  },
}

function subscriptionItemLine(): ProviderInvoiceLine {
  return {
    lineRef: 'il_sub_item',
    amountCents: 0,
    source: 'subscription_item',
    priceRef: 'price_sim1',
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    proration: false,
    valanserhPart: null,
  }
}

function basePaidInvoice(
  overrides: Partial<ProviderInvoice> = {},
  refs?: { subscriptionRef: string; customerRef: string; invoiceRef?: string }
): ProviderInvoice {
  const subscriptionRef = refs?.subscriptionRef ?? 'sub_fixtureP2'
  const customerRef = refs?.customerRef ?? 'cus_fixtureP2'
  const invoiceRef = refs?.invoiceRef ?? 'in_fixtureP2'
  return {
    invoiceRef,
    status: 'paid',
    billingReason: CYCLE_BILLING_REASON,
    subscriptionRef,
    customerRef,
    currency: 'mxn',
    totalCents: PERIOD_AMOUNT,
    autoAdvance: true,
    amountPaidCents: PERIOD_AMOUNT,
    amountPaidOffStripeCents: 0,
    paidAt: PAID_AT,
    paymentIntentRef: 'pi_fixtureP2',
    lines: [
      subscriptionItemLine(),
      {
        lineRef: 'il_period',
        amountCents: PERIOD_AMOUNT,
        source: 'invoice_item',
        priceRef: null,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        proration: false,
        valanserhPart: 'period',
      },
    ],
    ...overrides,
  }
}

class FakeInvoiceProvider implements BillingProviderPort, BillingInvoiceProviderPort {
  readonly key = BILLING_PROVIDER_KEYS.STRIPE
  invoice: ProviderInvoice
  readCalls: { ref: string; options?: ReadInvoiceOptions }[] = []
  readInvoiceImpl: ((ref: string, options?: ReadInvoiceOptions) => Promise<ProviderInvoice>) | null =
    null

  constructor(invoice: ProviderInvoice) {
    this.invoice = structuredClone(invoice)
  }

  async openSubscription(): Promise<never> {
    throw new Error('not used')
  }
  async admitRecordedPayment(): Promise<void> {
    throw new Error('not used')
  }

  async readInvoice(ref: string, options?: ReadInvoiceOptions): Promise<ProviderInvoice> {
    this.readCalls.push({ ref, options })
    if (this.readInvoiceImpl) {
      return this.readInvoiceImpl(ref, options)
    }
    if (ref !== this.invoice.invoiceRef) {
      throw new Error('unexpected ref')
    }
    return structuredClone(this.invoice)
  }

  async addInvoiceCharge(): Promise<never> {
    throw new Error('not used')
  }
  async holdInvoice(): Promise<never> {
    throw new Error('not used')
  }
  async resumeInvoice(): Promise<never> {
    throw new Error('not used')
  }
}

function asProvider(fake: FakeInvoiceProvider): BillingProviderPort {
  return fake
}

function assertProviderError(error: unknown): BillingProviderServiceError {
  if (!(error instanceof BillingProviderServiceError)) {
    throw new Error('Se esperaba BillingProviderServiceError')
  }
  return error
}

async function createPublishedPlanWithPrice(stamp: number): Promise<{ planId: number; priceId: number }> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Invoice Paid Plan ${stamp}`,
    billingPlanDescription: 'fixture 7693',
  })
  const price = await BillingPlanPrice.create({
    billingPlanId: plan.billingPlanId,
    billingPlanPriceAmount: 65,
    billingPlanPriceCurrency: 'MXN',
    billingPlanPriceTaxRate: 0.16,
    billingPlanPriceTrialDays: 7,
    billingPlanPriceEffectiveFrom: '2025-01-01',
    billingPlanPriceStripePriceId: null,
    billingPlanPriceProvider: BILLING_PROVIDER_KEYS.MANUAL,
  })
  await BillingVolumeTier.create({
    billingPlanId: plan.billingPlanId,
    billingVolumeTierMinEmployees: 1,
    billingVolumeTierDiscountPercent: 0,
  })
  await catalog.publishPlan(plan.billingPlanId)
  return { planId: plan.billingPlanId, priceId: price.billingPlanPriceId }
}

function stubHandler(deps?: {
  paymentService?: BillingPaymentService
  notifications?: BillingInternalNotificationService
}) {
  const paymentService =
    deps?.paymentService ?? (new BillingPaymentService() as BillingPaymentService)
  const notifications =
    deps?.notifications ??
    ({
      notifyProviderPaymentUnsettled: async () => {},
      notifyProviderPaymentMisaligned: async () => {},
    } as unknown as BillingInternalNotificationService)
  return new BillingProviderInvoicePaidHandler(paymentService, notifications)
}

test.group('BillingProviderInvoicePaidHandler — funciones puras (7693)', () => {
  test('selectProviderPeriodLine y providerPeriodFromInvoice', ({ assert }) => {
    const invoice = basePaidInvoice()
    assert.isNotNull(selectProviderPeriodLine(invoice))
    assert.deepEqual(providerPeriodFromInvoice(invoice), {
      start: '2026-11-01',
      end: '2026-12-01',
    })

    const twoItems = basePaidInvoice({
      lines: [subscriptionItemLine(), { ...subscriptionItemLine(), lineRef: 'il_dup' }],
    })
    assert.isNull(selectProviderPeriodLine(twoItems))
    assert.isNull(providerPeriodFromInvoice(twoItems))
  })

  test('invoiceDebtCents e isPaymentMisaligned', ({ assert }) => {
    const invoice = basePaidInvoice({
      lines: [
        subscriptionItemLine(),
        {
          lineRef: 'il_debt',
          amountCents: 4523,
          source: 'invoice_item',
          priceRef: null,
          periodStart: PERIOD_START,
          periodEnd: PERIOD_END,
          proration: false,
          valanserhPart: 'increase_debt',
        },
      ],
    })
    assert.equal(invoiceDebtCents(invoice), 4523)
    assert.isTrue(
      isPaymentMisaligned({ periodsCovered: 1, debtAppliedCents: 0 }, 4523, true)
    )
    assert.isFalse(
      isPaymentMisaligned({ periodsCovered: 1, debtAppliedCents: 4523 }, 4523, true)
    )
    assert.isTrue(isPaymentMisaligned({ periodsCovered: 0, debtAppliedCents: 0 }, 0, true))
  })

  test('isProviderInvoiceDuplicate solo uq_billing_payment_provider_invoice', ({ assert }) => {
    assert.isTrue(
      isProviderInvoiceDuplicate({
        code: 'ER_DUP_ENTRY',
        sqlMessage: "Duplicate entry 'in_x' for key 'billing_payments.uq_billing_payment_provider_invoice'",
      })
    )
    assert.isTrue(
      isProviderInvoiceDuplicate({
        original: {
          code: 'ER_DUP_ENTRY',
          sqlMessage: "Duplicate entry for key 'uq_billing_payment_provider_invoice'",
        },
      })
    )
    assert.isFalse(
      isProviderInvoiceDuplicate({
        code: 'ER_DUP_ENTRY',
        sqlMessage: "Duplicate entry for key 'otro_indice'",
      })
    )
  })

  test('isInvoiceBoundToSubscription', ({ assert }) => {
    const invoice = basePaidInvoice()
    const sub = {
      billingSubscriptionProvider: BILLING_PROVIDER_KEYS.STRIPE,
      billingSubscriptionStripeSubscriptionId: 'sub_fixtureP2',
      billingSubscriptionStripeCustomerId: 'cus_fixtureP2',
    } as BillingSubscription
    assert.isTrue(isInvoiceBoundToSubscription(invoice, sub))
    assert.isFalse(
      isInvoiceBoundToSubscription(invoice, {
        ...sub,
        billingSubscriptionStripeSubscriptionId: 'sub_other',
      } as BillingSubscription)
    )
  })
})

async function createStripeSubscriptionForHandler(stamp: number): Promise<{
  businessUnit: BusinessUnit
  subscription: BillingSubscription
  stripeCustomerRef: string
  stripeSubscriptionRef: string
}> {
  const stripeCustomerRef = `cus_fixtureP2_${stamp}`
  const stripeSubscriptionRef = `sub_fixtureP2_${stamp}`
  const { planId, priceId } = await createPublishedPlanWithPrice(stamp)
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Invoice Paid BU ${stamp}`,
    businessUnitSlug: `invoice-paid-bu-${stamp}`,
    businessUnitLegalName: `Invoice Paid Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'self_service',
  })

  const zone = getBusinessTimeZone()
  const subscription = await BillingSubscription.create({
    businessUnitId: businessUnit.businessUnitId,
    billingPlanId: planId,
    billingPlanPriceId: priceId,
    billingSubscriptionProvider: BILLING_PROVIDER_KEYS.STRIPE,
    billingSubscriptionStripeCustomerId: stripeCustomerRef,
    billingSubscriptionStripeSubscriptionId: stripeSubscriptionRef,
    billingSubscriptionStatus: 'active',
    billingSubscriptionContractedEmployees: 40,
    billingSubscriptionContractedCurrency: 'MXN',
    billingSubscriptionContractedTotal: 10440,
    billingSubscriptionContractedSubtotal: 9000,
    billingSubscriptionContractedTaxAmount: 1440,
    billingSubscriptionContractedTaxRate: 0.16,
    billingSubscriptionContractedUnitAmount: 65,
    billingSubscriptionDiscountPercent: 0,
    billingSubscriptionCreditBalanceCents: 0,
    billingSubscriptionContractedTrialDays: 0,
    billingSubscriptionContractedEffectiveFrom: DateTime.now(),
    billingSubscriptionSubscribedAt: DateTime.now(),
    billingSubscriptionCurrentPeriodStart: DateTime.fromISO('2026-10-01', { zone }),
    billingSubscriptionCurrentPeriodEnd: DateTime.fromISO('2026-11-01', { zone }),
    billingSubscriptionLiveBusinessUnitId: businessUnit.businessUnitId,
  })
  return { businessUnit, subscription, stripeCustomerRef, stripeSubscriptionRef }
}

async function destroyHandlerFixture(
  businessUnit: BusinessUnit,
  subscription: BillingSubscription
): Promise<void> {
  await BillingPayment.query()
    .where('billing_subscription_id', subscription.billingSubscriptionId)
    .delete()
  await subscription.delete()
  await businessUnit.delete()
}

test.group('BillingProviderInvoicePaidHandler — manejador (7693)', () => {
  let businessUnit: BusinessUnit
  let subscription: BillingSubscription
  let stripeCustomerRef: string
  let stripeSubscriptionRef: string

  async function freshSubscription(): Promise<void> {
    const stamp = Date.now() + Math.floor(Math.random() * 100_000)
    ;({ businessUnit, subscription, stripeCustomerRef, stripeSubscriptionRef } =
      await createStripeSubscriptionForHandler(stamp))
  }

  function eventForInvoice(invoiceRef: string) {
    return {
      ...EVENT_FIXTURE,
      objectId: invoiceRef,
      object: {
        ...EVENT_FIXTURE.object,
        subscriptionRef: stripeSubscriptionRef,
        customerRef: stripeCustomerRef,
      },
    }
  }

  function fixtureInvoice(overrides: Partial<ProviderInvoice> = {}, invoiceRef = 'in_fixtureP2') {
    return basePaidInvoice(overrides, {
      subscriptionRef: stripeSubscriptionRef,
      customerRef: stripeCustomerRef,
      invoiceRef,
    })
  }

  test('CA-9: ignorados not-invoice, not-paid, paid-off-stripe, zero-amount-cycle', async ({
    assert,
  }) => {
    await freshSubscription()
    let unsettled: NotifyProviderPaymentUnsettledParams | null = null
    const notifications = {
      notifyProviderPaymentUnsettled: async (p: NotifyProviderPaymentUnsettledParams) => {
        unsettled = p
      },
      notifyProviderPaymentMisaligned: async () => {},
    } as unknown as BillingInternalNotificationService
    const handler = stubHandler({ notifications })
    const provider = new FakeInvoiceProvider(fixtureInvoice())

    assert.deepEqual(
      await handler.handle({
        event: { ...eventForInvoice('in_fixtureP2'), objectType: 'charge', objectId: null },
        billingSubscription: subscription,
        provider: asProvider(provider),
      }),
      { status: 'ignored', reason: 'not-invoice' }
    )

    const openProvider = new FakeInvoiceProvider(fixtureInvoice({ status: 'open' }))
    assert.deepEqual(
      await handler.handle({
        event: eventForInvoice('in_fixtureP2'),
        billingSubscription: subscription,
        provider: asProvider(openProvider),
      }),
      { status: 'ignored', reason: 'not-paid' }
    )

    const offStripe = new FakeInvoiceProvider(
      fixtureInvoice({ amountPaidOffStripeCents: PERIOD_AMOUNT })
    )
    assert.deepEqual(
      await handler.handle({
        event: eventForInvoice('in_fixtureP2'),
        billingSubscription: subscription,
        provider: asProvider(offStripe),
        attempt: 1,
      }),
      { status: 'ignored', reason: 'paid-off-stripe' }
    )
    assert.equal((unsettled as NotifyProviderPaymentUnsettledParams | null)?.reason, 'paid-off-stripe')

    unsettled = null
    const zeroCreate = new FakeInvoiceProvider(
      fixtureInvoice({
        amountPaidCents: 0,
        billingReason: 'subscription_create',
        totalCents: 0,
      })
    )
    assert.deepEqual(
      await handler.handle({
        event: eventForInvoice('in_fixtureP2'),
        billingSubscription: subscription,
        provider: asProvider(zeroCreate),
      }),
      { status: 'ignored', reason: 'zero-amount' }
    )
    assert.isNull(unsettled)

    unsettled = null
    const zeroCycle = new FakeInvoiceProvider(fixtureInvoice({ amountPaidCents: 0, totalCents: 0 }))
    assert.deepEqual(
      await handler.handle({
        event: eventForInvoice('in_fixtureP2'),
        billingSubscription: subscription,
        provider: asProvider(zeroCycle),
      }),
      { status: 'ignored', reason: 'zero-amount' }
    )
    assert.equal((unsettled as NotifyProviderPaymentUnsettledParams | null)?.reason, 'zero-amount-cycle')
    await destroyHandlerFixture(businessUnit, subscription)
  })

  test('CA-9: not-subscription-invoice, not-cycle, currency, amount-out-of-range, canceled', async ({
    assert,
  }) => {
    await freshSubscription()
    const reasons: NotifyProviderPaymentUnsettledParams[] = []
    const notifications = {
      notifyProviderPaymentUnsettled: async (p: NotifyProviderPaymentUnsettledParams) => {
        reasons.push(p)
      },
      notifyProviderPaymentMisaligned: async () => {},
    } as unknown as BillingInternalNotificationService
    const handler = stubHandler({ notifications })

    const notSub = new FakeInvoiceProvider(
      fixtureInvoice({ subscriptionRef: null, billingReason: 'manual' })
    )
    assert.deepEqual(
      await handler.handle({
        event: eventForInvoice('in_fixtureP2'),
        billingSubscription: subscription,
        provider: asProvider(notSub),
      }),
      { status: 'ignored', reason: 'not-subscription-invoice' }
    )

    const notCycle = new FakeInvoiceProvider(
      fixtureInvoice({ billingReason: 'subscription_update' })
    )
    assert.deepEqual(
      await handler.handle({
        event: eventForInvoice('in_fixtureP2'),
        billingSubscription: subscription,
        provider: asProvider(notCycle),
      }),
      { status: 'ignored', reason: 'not-cycle' }
    )

    const usd = new FakeInvoiceProvider(fixtureInvoice({ currency: 'usd' }))
    assert.deepEqual(
      await handler.handle({
        event: eventForInvoice('in_fixtureP2'),
        billingSubscription: subscription,
        provider: asProvider(usd),
      }),
      { status: 'ignored', reason: 'currency-mismatch' }
    )

    const tiny = new FakeInvoiceProvider(fixtureInvoice({ amountPaidCents: 99 }))
    assert.deepEqual(
      await handler.handle({
        event: eventForInvoice('in_fixtureP2'),
        billingSubscription: subscription,
        provider: asProvider(tiny),
      }),
      { status: 'ignored', reason: 'amount-out-of-range' }
    )

    subscription.billingSubscriptionStatus = 'canceled'
    await subscription.save()
    const canceled = new FakeInvoiceProvider(fixtureInvoice({}, 'in_fixture_canceled'))
    assert.deepEqual(
      await handler.handle({
        event: eventForInvoice('in_fixture_canceled'),
        billingSubscription: subscription,
        provider: asProvider(canceled),
      }),
      { status: 'ignored', reason: 'subscription-canceled' }
    )
    subscription.billingSubscriptionStatus = 'active'
    await subscription.save()

    assert.isAtLeast(reasons.length, 4)
    await destroyHandlerFixture(businessUnit, subscription)
  })

  test('CA-3: ciclo normal asienta con card y periodo del proveedor', async ({ assert }) => {
    await freshSubscription()
    const invoiceRef = `in_fixture_ca3_${Date.now()}`
    const provider = new FakeInvoiceProvider(fixtureInvoice({}, invoiceRef))
    const handler = stubHandler()

    assert.deepEqual(
      await handler.handle({
        event: { ...eventForInvoice(invoiceRef), id: `evt_${invoiceRef}` },
        billingSubscription: subscription,
        provider: asProvider(provider),
      }),
      { status: 'processed' }
    )

    assert.deepEqual(provider.readCalls[0]?.options, { includePayments: true })

    const payment = await BillingPayment.query()
      .where('billing_payment_provider_invoice_id', invoiceRef)
      .firstOrFail()
    assert.equal(payment.billingPaymentMethod, 'card')
    assert.equal(payment.billingPaymentProvider, 'stripe')
    assert.isNull(payment.billingPaymentReceiptPath)
    assert.equal(payment.billingPaymentAmountCents, PERIOD_AMOUNT)
    assert.equal(payment.billingPaymentPeriodsCovered, 1)
    assert.equal(payment.billingPaymentDebtAppliedCents, 0)

    await subscription.refresh()
    assert.equal(
      toCalendarIsoDate(subscription.billingSubscriptionCurrentPeriodStart),
      '2026-11-01'
    )
    assert.equal(
      toCalendarIsoDate(subscription.billingSubscriptionCurrentPeriodEnd),
      '2026-12-01'
    )
    await destroyHandlerFixture(businessUnit, subscription)
  })

  test('CA-5: aumento cancelado asienta y avisa desalineado', async ({ assert }) => {
    await freshSubscription()
    const invoiceRef = `in_fixture_ca5_${Date.now()}`
    const debt = 4523
    const totalPaid = 1_222_523
    const invoice = fixtureInvoice(
      {
        amountPaidCents: totalPaid,
        totalCents: totalPaid,
        lines: [
          subscriptionItemLine(),
          {
            lineRef: 'il_period',
            amountCents: 1_218_000,
            source: 'invoice_item',
            priceRef: null,
            periodStart: PERIOD_START,
            periodEnd: PERIOD_END,
            proration: false,
            valanserhPart: 'period',
          },
          {
            lineRef: 'il_debt',
            amountCents: debt,
            source: 'invoice_item',
            priceRef: null,
            periodStart: PERIOD_START,
            periodEnd: PERIOD_END,
            proration: false,
            valanserhPart: 'increase_debt',
          },
        ],
      },
      invoiceRef
    )
    const provider = new FakeInvoiceProvider(invoice)
    let misaligned: NotifyProviderPaymentMisalignedParams | null = null
    const notifications = {
      notifyProviderPaymentUnsettled: async () => {},
      notifyProviderPaymentMisaligned: async (p: NotifyProviderPaymentMisalignedParams) => {
        misaligned = p
      },
    } as unknown as BillingInternalNotificationService
    const handler = stubHandler({ notifications })

    assert.deepEqual(
      await handler.handle({
        event: { ...eventForInvoice(invoiceRef), id: `evt_${invoiceRef}` },
        billingSubscription: subscription,
        provider: asProvider(provider),
      }),
      { status: 'processed' }
    )

    assert.isNotNull(misaligned)
    assert.equal(misaligned!.debtAppliedCents, 0)
    assert.equal(misaligned!.invoiceDebtCents, debt)
    assert.isTrue(misaligned!.periodsCovered >= 0)
    assert.isTrue(misaligned!.invoiceDebtCents !== misaligned!.debtAppliedCents)
    await destroyHandlerFixture(businessUnit, subscription)
  })

  test('CA-6: periodo ya cubierto → periodsCovered 0 y aviso', async ({ assert }) => {
    await freshSubscription()
    const zone = getBusinessTimeZone()
    subscription.billingSubscriptionCurrentPeriodStart = DateTime.fromISO('2026-11-01', { zone })
    subscription.billingSubscriptionCurrentPeriodEnd = DateTime.fromISO('2026-12-01', { zone })
    await subscription.save()

    const invoiceRef = `in_fixture_ca6_${Date.now()}`
    const provider = new FakeInvoiceProvider(fixtureInvoice({}, invoiceRef))
    let misaligned: NotifyProviderPaymentMisalignedParams | null = null
    const handler = stubHandler({
      notifications: {
        notifyProviderPaymentUnsettled: async () => {},
        notifyProviderPaymentMisaligned: async (p: NotifyProviderPaymentMisalignedParams) => {
          misaligned = p
        },
      } as unknown as BillingInternalNotificationService,
    })

    assert.deepEqual(
      await handler.handle({
        event: { ...eventForInvoice(invoiceRef), id: `evt_${invoiceRef}` },
        billingSubscription: subscription,
        provider: asProvider(provider),
      }),
      { status: 'processed' }
    )

    const payment = await BillingPayment.query()
      .where('billing_payment_provider_invoice_id', invoiceRef)
      .firstOrFail()
    assert.equal(payment.billingPaymentPeriodsCovered, 0)
    assert.isNull(payment.billingPaymentPeriodStart)
    assert.isNull(payment.billingPaymentPeriodEnd)
    assert.equal(payment.billingPaymentCreditBalanceAfterCents, PERIOD_AMOUNT)
    assert.isNotNull(misaligned)
    assert.equal(misaligned!.providerPeriodApplied, false)

    subscription.billingSubscriptionCurrentPeriodStart = DateTime.fromISO('2026-10-01', { zone })
    subscription.billingSubscriptionCurrentPeriodEnd = DateTime.fromISO('2026-11-01', { zone })
    await subscription.save()
    await destroyHandlerFixture(businessUnit, subscription)
  })

  test('CA-7: sin periodo del proveedor asienta y avisa', async ({ assert }) => {
    await freshSubscription()
    const invoiceRef = `in_fixture_ca7_${Date.now()}`
    const invoice = fixtureInvoice(
      {
        lines: [
          {
            lineRef: 'il_period_only',
            amountCents: PERIOD_AMOUNT,
            source: 'invoice_item',
            priceRef: null,
            periodStart: PERIOD_START,
            periodEnd: PERIOD_END,
            proration: false,
            valanserhPart: 'period',
          },
        ],
      },
      invoiceRef
    )
    const provider = new FakeInvoiceProvider(invoice)
    let misaligned: NotifyProviderPaymentMisalignedParams | null = null
    const handler = stubHandler({
      notifications: {
        notifyProviderPaymentUnsettled: async () => {},
        notifyProviderPaymentMisaligned: async (p: NotifyProviderPaymentMisalignedParams) => {
          misaligned = p
        },
      } as unknown as BillingInternalNotificationService,
    })

    assert.deepEqual(
      await handler.handle({
        event: { ...eventForInvoice(invoiceRef), id: `evt_${invoiceRef}` },
        billingSubscription: subscription,
        provider: asProvider(provider),
      }),
      { status: 'processed' }
    )
    assert.isNotNull(misaligned)
    assert.isNull(misaligned!.providerPeriod)
    assert.equal(misaligned!.providerPeriodApplied, false)
    await destroyHandlerFixture(businessUnit, subscription)
  })

  test('CA-8: duplicado por índice → processed; otro índice lanza', async ({ assert }) => {
    await freshSubscription()
    const invoiceRef = `in_fixture_ca8_${Date.now()}`
    const dupError = {
      code: 'ER_DUP_ENTRY',
      sqlMessage: `Duplicate entry '${invoiceRef}' for key 'billing_payments.uq_billing_payment_provider_invoice'`,
    }
    const paymentService = {
      settlePaymentWithin: async () => {
        throw dupError
      },
    } as unknown as BillingPaymentService
    const handler = stubHandler({ paymentService })
    const provider = new FakeInvoiceProvider(fixtureInvoice({}, invoiceRef))

    assert.deepEqual(
      await handler.handle({
        event: { ...eventForInvoice(invoiceRef), id: `evt_${invoiceRef}` },
        billingSubscription: subscription,
        provider: asProvider(provider),
      }),
      { status: 'processed' }
    )

    const otherDup = {
      settlePaymentWithin: async () => {
        throw {
          code: 'ER_DUP_ENTRY',
          sqlMessage: "Duplicate entry for key 'otro_indice'",
        }
      },
    } as unknown as BillingPaymentService
    const handler2 = stubHandler({ paymentService: otherDup })
    try {
      await handler2.handle({
        event: { ...eventForInvoice(invoiceRef), id: `evt_${invoiceRef}_2` },
        billingSubscription: subscription,
        provider: asProvider(new FakeInvoiceProvider(fixtureInvoice({}, invoiceRef))),
      })
      assert.fail('Debió lanzar')
    } catch (error) {
      assert.equal(
        assertProviderError(error).errorCode,
        BILLING_PROVIDER_ERROR_CODES.PAYMENT_SETTLEMENT_FAILED
      )
    }
    await destroyHandlerFixture(businessUnit, subscription)
  })

  test('CA-8: already-settled en la misma suscripción', async ({ assert }) => {
    await freshSubscription()
    const invoiceRef = `in_fixture_ca8b_${Date.now()}`
    const provider = new FakeInvoiceProvider(fixtureInvoice({}, invoiceRef))
    const handler = stubHandler()
    const event = { ...eventForInvoice(invoiceRef), id: `evt_${invoiceRef}` }

    assert.deepEqual(
      await handler.handle({ event, billingSubscription: subscription, provider: asProvider(provider) }),
      { status: 'processed' }
    )
    assert.deepEqual(
      await handler.handle({ event, billingSubscription: subscription, provider: asProvider(provider) }),
      { status: 'ignored', reason: 'already-settled' }
    )
    await destroyHandlerFixture(businessUnit, subscription)
  })

  test('CA-10: liga inválida lanza y avisa solo en attempt 1', async ({ assert }) => {
    await freshSubscription()
    const provider = new FakeInvoiceProvider(fixtureInvoice())
    let notifyCount = 0
    const handler = stubHandler({
      notifications: {
        notifyProviderPaymentUnsettled: async () => {
          notifyCount += 1
        },
        notifyProviderPaymentMisaligned: async () => {},
      } as unknown as BillingInternalNotificationService,
    })

    try {
      await handler.handle({
        event: eventForInvoice('in_fixtureP2'),
        billingSubscription: null,
        provider: asProvider(provider),
        attempt: 1,
      })
      assert.fail('Debió lanzar')
    } catch (error) {
      assert.equal(
        assertProviderError(error).errorCode,
        BILLING_PROVIDER_ERROR_CODES.INVOICE_SUBSCRIPTION_NOT_FOUND
      )
    }
    assert.equal(notifyCount, 1)

    try {
      await handler.handle({
        event: eventForInvoice('in_fixtureP2'),
        billingSubscription: null,
        provider: asProvider(provider),
        attempt: 2,
      })
      assert.fail('Debió lanzar')
    } catch {
      /* esperado */
    }
    assert.equal(notifyCount, 1)
    await destroyHandlerFixture(businessUnit, subscription)
  })

  test('CA-11: asiento fallido avisa en attempt 1 y lanza PAYMENT_SETTLEMENT_FAILED', async ({
    assert,
  }) => {
    await freshSubscription()
    const invoiceRef = `in_fixture_ca11_${Date.now()}`
    const paymentService = {
      settlePaymentWithin: async () => {
        throw new BillingPaymentServiceError(
          'fallo simulado',
          BILLING_PAYMENT_ERROR_CODES.SYS_UNHANDLED,
          500,
          'error-interno',
          'Error interno'
        )
      },
    } as unknown as BillingPaymentService
    let notifyCount = 0
    const handler = stubHandler({
      paymentService,
      notifications: {
        notifyProviderPaymentUnsettled: async () => {
          notifyCount += 1
        },
        notifyProviderPaymentMisaligned: async () => {},
      } as unknown as BillingInternalNotificationService,
    })
    const provider = new FakeInvoiceProvider(fixtureInvoice({}, invoiceRef))

    try {
      await handler.handle({
        event: { ...eventForInvoice(invoiceRef), id: `evt_${invoiceRef}` },
        billingSubscription: subscription,
        provider: asProvider(provider),
        attempt: 1,
      })
      assert.fail('Debió lanzar')
    } catch (error) {
      assert.equal(
        assertProviderError(error).errorCode,
        BILLING_PROVIDER_ERROR_CODES.PAYMENT_SETTLEMENT_FAILED
      )
    }
    assert.equal(notifyCount, 1)

    try {
      await handler.handle({
        event: { ...eventForInvoice(invoiceRef), id: `evt_${invoiceRef}_2` },
        billingSubscription: subscription,
        provider: asProvider(provider),
        attempt: 2,
      })
      assert.fail('Debió lanzar')
    } catch {
      /* esperado */
    }
    assert.equal(notifyCount, 1)
    await destroyHandlerFixture(businessUnit, subscription)
  })

  test('CA-12: readInvoice fallido avisa y relanza; manual sin interfaz', async ({ assert }) => {
    await freshSubscription()
    const provider = new FakeInvoiceProvider(fixtureInvoice())
    provider.readInvoiceImpl = async () => {
      throw providerRequestFailed('readInvoice', { stripeErrorType: 'api', stripeRequestId: 'req_x' })
    }
    let unsettled: NotifyProviderPaymentUnsettledParams | null = null
    const handler = stubHandler({
      notifications: {
        notifyProviderPaymentUnsettled: async (p: NotifyProviderPaymentUnsettledParams) => {
          unsettled = p
        },
        notifyProviderPaymentMisaligned: async () => {},
      } as unknown as BillingInternalNotificationService,
    })

    try {
      await handler.handle({
        event: eventForInvoice('in_fixtureP2'),
        billingSubscription: subscription,
        provider: asProvider(provider),
        attempt: 1,
      })
      assert.fail('Debió lanzar')
    } catch (error) {
      assert.equal(
        assertProviderError(error).errorCode,
        BILLING_PROVIDER_ERROR_CODES.PROVIDER_REQUEST_FAILED
      )
    }
    assert.deepEqual(unsettled, {
      billingSubscriptionId: null,
      businessUnitId: null,
      invoiceRef: 'in_fixtureP2',
      subscriptionRef: null,
      eventRef: 'evt_fixtureP2',
      reason: 'settlement-failed',
      errorCode: BILLING_PROVIDER_ERROR_CODES.PROVIDER_REQUEST_FAILED,
      amountPaidCents: null,
      currency: null,
    })

    const manualHandler = new BillingProviderInvoicePaidHandler()
    const manual = new ManualBillingProviderAdapter()
    try {
      await manualHandler.handle({
        event: eventForInvoice('in_fixtureP2'),
        billingSubscription: subscription,
        provider: manual as BillingProviderPort,
      })
      assert.fail('Debió lanzar')
    } catch (error) {
      assert.equal(
        assertProviderError(error).errorCode,
        BILLING_PROVIDER_ERROR_CODES.OPERATION_NOT_AVAILABLE
      )
    }
    await destroyHandlerFixture(businessUnit, subscription)
  })

  test('CA-12: falta lo pagado en relectura', async ({ assert }) => {
    await freshSubscription()
    const invoice = fixtureInvoice({ amountPaidCents: undefined, amountPaidOffStripeCents: 0 })
    const provider = new FakeInvoiceProvider(invoice)
    const handler = stubHandler()
    try {
      await handler.handle({
        event: eventForInvoice('in_fixtureP2'),
        billingSubscription: subscription,
        provider: asProvider(provider),
        attempt: 1,
      })
      assert.fail('Debió lanzar')
    } catch (error) {
      assert.equal(
        assertProviderError(error).errorCode,
        BILLING_PROVIDER_ERROR_CODES.OPERATION_NOT_AVAILABLE
      )
    }
    await destroyHandlerFixture(businessUnit, subscription)
  })
})
