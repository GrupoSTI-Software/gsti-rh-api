import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { BILLING_PROVIDER_ERROR_CODES } from '#constants/billing_provider_error_codes'
import { BillingProviderServiceError } from '#exceptions/billing_provider_service_error'
import ManualBillingProviderAdapter from '#modules/billing-provider/manual_billing_provider.adapter'
import BillingProviderInvoiceCreatedHandler, {
  buildExpectedInvoiceCharges,
  CYCLE_BILLING_REASON,
  invoicePeriodBusinessDate,
  planInvoiceCharges,
  resolveCycleAmount,
} from '#modules/billing-provider/billing_provider_invoice_created.handler'
import type {
  BillingProviderPort,
  BillingInvoiceProviderPort,
  ProviderInvoice,
  ProviderInvoiceLine,
  InvoiceChargeDraft,
} from '#modules/billing-provider/billing_provider.port'
import { BILLING_PROVIDER_KEYS } from '#modules/billing-provider/billing_provider.port'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingSubscription from '#models/billing_subscription'
import BillingVolumeTier from '#models/billing_volume_tier'
import BusinessUnit from '#models/business_unit'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingSubscriptionChangeService from '#services/billing_subscription_change_service'
import BillingPaymentService from '#services/billing_payment_service'
import BillingInternalNotificationService, {
  type NotifyProviderInvoiceHeldParams,
} from '#services/billing_internal_notification_service'
import { providerRequestFailed } from '#modules/billing-provider/billing_provider.errors'

/** 2026-11-01 00:00 CDMX … 2026-12-01 00:00 CDMX (CA-2 / CA-4) */
const PERIOD_START = 1_793_512_800
const PERIOD_END = 1_796_104_800

const EVENT_FIXTURE = {
  id: 'evt_fixtureM1',
  type: 'invoice.created' as const,
  objectType: 'invoice' as const,
  objectId: 'in_fixtureM1',
  createdAt: 1,
  livemode: false,
  fromConnectedAccount: false,
  object: {
    subscriptionRef: 'sub_fixtureM1',
    customerRef: 'cus_fixtureM1',
    status: 'draft',
  },
}

function asProvider(fake: FakeInvoiceProvider): BillingProviderPort {
  return fake
}

function baseInvoice(
  overrides: Partial<ProviderInvoice> = {},
  refs?: { subscriptionRef: string; customerRef: string; invoiceRef?: string }
): ProviderInvoice {
  const subscriptionRef = refs?.subscriptionRef ?? 'sub_fixtureM1'
  const customerRef = refs?.customerRef ?? 'cus_fixtureM1'
  const invoiceRef = refs?.invoiceRef ?? 'in_fixtureM1'
  const line: ProviderInvoiceLine = {
    lineRef: 'il_base',
    amountCents: 0,
    source: 'subscription_item',
    priceRef: 'price_sim1',
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    proration: false,
    valanserhPart: null,
  }
  return {
    invoiceRef,
    status: 'draft',
    billingReason: CYCLE_BILLING_REASON,
    subscriptionRef,
    customerRef,
    currency: 'mxn',
    totalCents: 0,
    autoAdvance: true,
    lines: [line],
    ...overrides,
  }
}

class FakeInvoiceProvider implements BillingProviderPort, BillingInvoiceProviderPort {
  readonly key = BILLING_PROVIDER_KEYS.STRIPE

  invoice: ProviderInvoice
  readCount = 0
  addCalls: InvoiceChargeDraft[] = []
  holdCalls: string[] = []
  resumeCalls: string[] = []
  readInvoiceImpl: ((ref: string) => Promise<ProviderInvoice>) | null = null
  holdInvoiceImpl: ((ref: string) => Promise<void>) | null = null
  totalAfterAddOverride: number | null = null

  constructor(invoice: ProviderInvoice) {
    this.invoice = structuredClone(invoice)
  }

  async openSubscription(): Promise<import('#modules/billing-provider/billing_provider.port').SubscriptionOpening> {
    throw new Error('not used')
  }
  async admitRecordedPayment(): Promise<void> {
    throw new Error('not used')
  }

  async readInvoice(ref: string): Promise<ProviderInvoice> {
    if (this.readInvoiceImpl) {
      return this.readInvoiceImpl(ref)
    }
    this.readCount += 1
    if (ref !== this.invoice.invoiceRef) {
      throw new Error('unexpected ref')
    }
    return structuredClone(this.invoice)
  }

  async addInvoiceCharge(charge: InvoiceChargeDraft) {
    this.addCalls.push(charge)
    this.invoice.lines.push({
      lineRef: `il_${charge.part}`,
      amountCents: charge.amountCents,
      source: 'invoice_item',
      priceRef: null,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      proration: false,
      valanserhPart: charge.part,
    })
    const added = charge.amountCents
    this.invoice.totalCents =
      this.totalAfterAddOverride !== null ? this.totalAfterAddOverride : this.invoice.totalCents + added
    return { externalId: `ii_${charge.part}` }
  }

  async holdInvoice(ref: string): Promise<void> {
    if (this.holdInvoiceImpl) {
      return this.holdInvoiceImpl(ref)
    }
    this.holdCalls.push(ref)
    this.invoice.autoAdvance = false
  }

  async resumeInvoice(ref: string): Promise<void> {
    this.resumeCalls.push(ref)
    this.invoice.autoAdvance = true
  }
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
    billingPlanName: `Invoice Handler Plan ${stamp}`,
    billingPlanDescription: 'fixture 7665',
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
  changeService?: BillingSubscriptionChangeService
  paymentService?: BillingPaymentService
  notifications?: BillingInternalNotificationService
}) {
  const changeService =
    deps?.changeService ??
    ({
      applyScheduledDecrease: async () => ({ outcome: 'sin_cambio' as const }),
    } as unknown as BillingSubscriptionChangeService)
  const paymentService =
    deps?.paymentService ??
    ({
      resolveCompositeIncreaseAmounts: async () => null,
    } as unknown as BillingPaymentService)
  const notifications =
    deps?.notifications ??
    ({
      notifyProviderInvoiceHeld: async () => {},
    } as unknown as BillingInternalNotificationService)
  return new BillingProviderInvoiceCreatedHandler(changeService, paymentService, notifications)
}

test.group('BillingProviderInvoiceCreatedHandler — funciones puras (7665)', () => {
  test('resolveCycleAmount y planInvoiceCharges (CA-4 fechas)', ({ assert }) => {
    assert.equal(invoicePeriodBusinessDate(1_793_512_799), '2026-10-31')
    assert.equal(invoicePeriodBusinessDate(1_793_512_800), '2026-11-01')

    const contract = resolveCycleAmount(null, 1044000)
    assert.equal(contract.kind, 'determined')
    if (contract.kind === 'determined') {
      assert.equal(contract.source, 'contract')
      assert.equal(contract.debtCents, 0)
    }

    const plan = planInvoiceCharges(baseInvoice(), [
      { part: 'period', amountCents: 1044000, description: 'Periodo test' },
    ])
    assert.equal(plan.kind, 'ready')
    if (plan.kind === 'ready') {
      assert.lengthOf(plan.missing, 1)
    }
  })

  test('buildExpectedInvoiceCharges omite debt cuando es cero', ({ assert }) => {
    const amount = resolveCycleAmount(null, 100) as Extract<
      ReturnType<typeof resolveCycleAmount>,
      { kind: 'determined' }
    >
    const charges = buildExpectedInvoiceCharges(
      amount,
      { start: PERIOD_START, end: PERIOD_END },
      40,
      false
    )
    assert.lengthOf(charges, 1)
    assert.equal(charges[0]!.part, 'period')
  })
})

test.group('BillingProviderInvoiceCreatedHandler — manejador (7665)', (group) => {
  let businessUnit: BusinessUnit
  let subscription: BillingSubscription
  let planId: number
  let priceId: number
  let stripeCustomerRef: string
  let stripeSubscriptionRef: string

  group.setup(async () => {
    const stamp = Date.now()
    stripeCustomerRef = `cus_fixtureM1_${stamp}`
    stripeSubscriptionRef = `sub_fixtureM1_${stamp}`
    ;({ planId, priceId } = await createPublishedPlanWithPrice(stamp))
    businessUnit = await BusinessUnit.create({
      businessUnitName: `Invoice Handler BU ${stamp}`,
      businessUnitSlug: `invoice-handler-bu-${stamp}`,
      businessUnitLegalName: `Invoice Handler Legal ${stamp}`,
      businessUnitActive: 1,
      businessUnitOrigin: 'self_service',
    })

    const now = DateTime.now()
    subscription = await BillingSubscription.create({
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
      billingSubscriptionContractedEffectiveFrom: now,
      billingSubscriptionSubscribedAt: now,
      billingSubscriptionCurrentPeriodStart: now,
      billingSubscriptionCurrentPeriodEnd: now.plus({ days: 30 }),
      billingSubscriptionLiveBusinessUnitId: businessUnit.businessUnitId,
    })
  })

  group.teardown(async () => {
    await BillingSubscription.query()
      .where('billing_subscription_id', subscription.billingSubscriptionId)
      .delete()
    await BusinessUnit.query().where('business_unit_id', businessUnit.businessUnitId).delete()
  })

  function fixtureInvoice(overrides: Partial<ProviderInvoice> = {}) {
    return baseInvoice(overrides, {
      subscriptionRef: stripeSubscriptionRef,
      customerRef: stripeCustomerRef,
    })
  }

  test('CA-5: ignora factura no borrador, no ciclo o no factura', async ({ assert }) => {
    const handler = stubHandler()
    const openProvider = new FakeInvoiceProvider(fixtureInvoice({ status: 'open' }))
    assert.deepEqual(
      await handler.handle({
        event: EVENT_FIXTURE,
        billingSubscription: subscription,
        provider: asProvider(openProvider),
      }),
      { status: 'ignored', reason: 'not-draft' }
    )
    assert.equal(openProvider.readCount, 1)
    assert.lengthOf(openProvider.addCalls, 0)

    const createProvider = new FakeInvoiceProvider(
      fixtureInvoice({ billingReason: 'subscription_create' })
    )
    assert.deepEqual(
      await handler.handle({
        event: EVENT_FIXTURE,
        billingSubscription: subscription,
        provider: asProvider(createProvider),
      }),
      { status: 'ignored', reason: 'not-cycle' }
    )

    const skipRead = new FakeInvoiceProvider(fixtureInvoice())
    assert.deepEqual(
      await handler.handle({
        event: { ...EVENT_FIXTURE, objectType: 'customer', objectId: null },
        billingSubscription: subscription,
        provider: asProvider(skipRead),
      }),
      { status: 'ignored', reason: 'not-invoice' }
    )
    assert.equal(skipRead.readCount, 0)
  })

  test('CA-12: proveedor sin interfaz de factura', async ({ assert }) => {
    const handler = new BillingProviderInvoiceCreatedHandler()
    const manual = new ManualBillingProviderAdapter()
    try {
      await handler.handle({
        event: {
          id: 'evt_12',
          type: 'invoice.created',
          objectType: 'invoice',
          objectId: 'in_fixtureM1',
          createdAt: 1,
          livemode: false,
          fromConnectedAccount: false,
          object: { subscriptionRef: null, customerRef: null, status: null },
        },
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
  })

  test('CA-2: agrega concepto period con monto del sello', async ({ assert }) => {
    const provider = new FakeInvoiceProvider(fixtureInvoice())
    const handler = stubHandler()

    assert.deepEqual(
      await handler.handle({ event: EVENT_FIXTURE, billingSubscription: subscription, provider: asProvider(provider) }),
      { status: 'processed' }
    )
    assert.lengthOf(provider.addCalls, 1)
    assert.deepEqual(provider.addCalls[0], {
      invoiceRef: 'in_fixtureM1',
      customerRef: stripeCustomerRef,
      billingSubscriptionId: subscription.billingSubscriptionId,
      part: 'period',
      amountCents: 1044000,
      currency: 'MXN',
      description: 'Periodo 2026-11-01 a 2026-11-30 · 40 colaboradores',
    })
    assert.equal(provider.readCount, 2)
    assert.lengthOf(provider.holdCalls, 0)
    assert.lengthOf(provider.resumeCalls, 0)
  })

  test('CA-3: aumento pendiente agrega period e increase_debt', async ({ assert }) => {
    const provider = new FakeInvoiceProvider(fixtureInvoice())
    const paymentService = {
      resolveCompositeIncreaseAmounts: async () => ({
        periodCents: 1218000,
        debtCents: 4523,
        debtPlusPeriodCents: 1222523,
      }),
    } as unknown as BillingPaymentService
    const handler = stubHandler({ paymentService })

    await handler.handle({ event: EVENT_FIXTURE, billingSubscription: subscription, provider: asProvider(provider) })

    assert.lengthOf(provider.addCalls, 2)
    assert.equal(provider.addCalls[0]!.part, 'period')
    assert.equal(provider.addCalls[0]!.amountCents, 1218000)
    assert.equal(provider.addCalls[1]!.part, 'increase_debt')
    assert.equal(provider.addCalls[1]!.amountCents, 4523)
    assert.equal(provider.addCalls[1]!.description, 'Ajuste prorrateado por aumento de colaboradores')
    assert.equal(provider.invoice.totalCents, 1222523)
  })

  test('CA-6: no duplica concepto period existente', async ({ assert }) => {
    const invoice = fixtureInvoice()
    invoice.lines.push({
      lineRef: 'il_existing',
      amountCents: 1044000,
      source: 'invoice_item',
      priceRef: null,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      proration: false,
      valanserhPart: 'period',
    })
    invoice.totalCents = 1044000
    const provider = new FakeInvoiceProvider(invoice)
    const handler = stubHandler()

    assert.deepEqual(
      await handler.handle({ event: EVENT_FIXTURE, billingSubscription: subscription, provider: asProvider(provider) }),
      { status: 'processed' }
    )
    assert.lengthOf(provider.addCalls, 0)
  })

  test('CA-7: moneda distinta retiene y avisa', async ({ assert }) => {
    const provider = new FakeInvoiceProvider(fixtureInvoice({ currency: 'usd' }))
    let notifyCalls = 0
    const notifications = {
      notifyProviderInvoiceHeld: async (params: NotifyProviderInvoiceHeldParams) => {
        notifyCalls += 1
        assert.equal(params.errorCode, BILLING_PROVIDER_ERROR_CODES.INVOICE_UNEXPECTED_LINES)
        assert.equal(params.invoiceRef, provider.invoice.invoiceRef)
        assert.equal(params.subscriptionRef, stripeSubscriptionRef)
      },
    } as unknown as BillingInternalNotificationService
    const handler = stubHandler({ notifications })

    try {
      await handler.handle({ event: EVENT_FIXTURE, billingSubscription: subscription, provider: asProvider(provider) })
      assert.fail('Debió lanzar')
    } catch (error) {
      assert.equal(
        assertProviderError(error).errorCode,
        BILLING_PROVIDER_ERROR_CODES.INVOICE_UNEXPECTED_LINES
      )
    }
    assert.lengthOf(provider.addCalls, 0)
    assert.lengthOf(provider.holdCalls, 1)
    assert.equal(notifyCalls, 1)
  })

  test('CA-7: sello 0.00 retiene con INVOICE_AMOUNT_UNAVAILABLE', async ({ assert }) => {
    subscription.billingSubscriptionContractedTotal = 0
    await subscription.save()
    const provider = new FakeInvoiceProvider(fixtureInvoice())
    const handler = stubHandler()
    try {
      await handler.handle({ event: EVENT_FIXTURE, billingSubscription: subscription, provider: asProvider(provider) })
      assert.fail('Debió lanzar')
    } catch (error) {
      assert.equal(
        assertProviderError(error).errorCode,
        BILLING_PROVIDER_ERROR_CODES.INVOICE_AMOUNT_UNAVAILABLE
      )
    }
    subscription.billingSubscriptionContractedTotal = 10440
    await subscription.save()
  })

  test('CA-8: avisa solo en el primer intento con autoAdvance true', async ({ assert }) => {
    subscription.billingSubscriptionContractedTotal = 0
    await subscription.save()
    let notifyCalls = 0
    const notifications = {
      notifyProviderInvoiceHeld: async () => {
        notifyCalls += 1
      },
    } as unknown as BillingInternalNotificationService
    const handler = stubHandler({ notifications })
    const provider = new FakeInvoiceProvider(fixtureInvoice())

    try {
      await handler.handle({ event: EVENT_FIXTURE, billingSubscription: subscription, provider: asProvider(provider) })
    } catch {
      /* esperado */
    }
    assert.equal(notifyCalls, 1)

    try {
      await handler.handle({ event: { ...EVENT_FIXTURE, id: 'evt_fixtureM2' }, billingSubscription: subscription, provider: asProvider(provider) })
    } catch {
      /* esperado */
    }
    assert.equal(notifyCalls, 1)

    subscription.billingSubscriptionContractedTotal = 10440
    await subscription.save()
    assert.deepEqual(
      await handler.handle({ event: { ...EVENT_FIXTURE, id: 'evt_fixtureM3' }, billingSubscription: subscription, provider: asProvider(provider) }),
      { status: 'processed' }
    )
    assert.equal(notifyCalls, 1)
    assert.lengthOf(provider.resumeCalls, 1)
  })

  test('CA-10: total distinto tras agregar retiene sin reanudar', async ({ assert }) => {
    const provider = new FakeInvoiceProvider(fixtureInvoice())
    provider.totalAfterAddOverride = 1044000 + 167040
    const handler = stubHandler()
    try {
      await handler.handle({ event: EVENT_FIXTURE, billingSubscription: subscription, provider: asProvider(provider) })
      assert.fail('Debió lanzar')
    } catch (error) {
      assert.equal(
        assertProviderError(error).errorCode,
        BILLING_PROVIDER_ERROR_CODES.INVOICE_UNEXPECTED_LINES
      )
    }
    assert.lengthOf(provider.resumeCalls, 0)
  })

  test('CA-11: readInvoice fallido no retiene ni avisa', async ({ assert }) => {
    const provider = new FakeInvoiceProvider(fixtureInvoice())
    provider.readInvoiceImpl = async () => {
      throw providerRequestFailed('readInvoice', { stripeErrorType: 'api', stripeRequestId: 'req_x' })
    }
    let notifyCalls = 0
    const notifications = {
      notifyProviderInvoiceHeld: async () => {
        notifyCalls += 1
      },
    } as unknown as BillingInternalNotificationService
    const handler = stubHandler({ notifications })
    try {
      await handler.handle({ event: EVENT_FIXTURE, billingSubscription: subscription, provider: asProvider(provider) })
      assert.fail('Debió lanzar')
    } catch (error) {
      assert.equal(
        assertProviderError(error).errorCode,
        BILLING_PROVIDER_ERROR_CODES.PROVIDER_REQUEST_FAILED
      )
    }
    assert.lengthOf(provider.holdCalls, 0)
    assert.equal(notifyCalls, 0)
  })

  test('CA-11: holdInvoice fallido no avisa', async ({ assert }) => {
    subscription.billingSubscriptionContractedTotal = 0
    await subscription.save()
    const provider = new FakeInvoiceProvider(fixtureInvoice())
    provider.holdInvoiceImpl = async () => {
      throw new Error('hold blocked')
    }
    let notifyCalls = 0
    const notifications = {
      notifyProviderInvoiceHeld: async () => {
        notifyCalls += 1
      },
    } as unknown as BillingInternalNotificationService
    const handler = stubHandler({ notifications })
    try {
      await handler.handle({ event: EVENT_FIXTURE, billingSubscription: subscription, provider: asProvider(provider) })
      assert.fail('Debió lanzar')
    } catch (error) {
      assert.equal(
        assertProviderError(error).errorCode,
        BILLING_PROVIDER_ERROR_CODES.INVOICE_AMOUNT_UNAVAILABLE
      )
    }
    assert.equal(notifyCalls, 0)
    subscription.billingSubscriptionContractedTotal = 10440
    await subscription.save()
  })
})
