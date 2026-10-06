import Stripe from 'stripe'
import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import {
  BILLING_PROVIDER_ERROR_CODES,
  BILLING_PROVIDER_WEBHOOK_PROCESSING_FAILED_DETAIL,
} from '#constants/billing_provider_error_codes'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingProviderEvent, {
  BILLING_PROVIDER_EVENT_STATUSES,
} from '#models/billing_provider_event'
import BillingSubscription from '#models/billing_subscription'
import BillingVolumeTier from '#models/billing_volume_tier'
import BusinessUnit from '#models/business_unit'
import {
  BILLING_PROVIDER_KEYS,
  type BillingProviderPort,
  type BillingInvoiceProviderPort,
  type BillingWebhookProviderPort,
  type InvoiceChargeDraft,
  type ProviderInvoice,
} from '#modules/billing-provider/billing_provider.port'
import { CYCLE_BILLING_REASON } from '#modules/billing-provider/billing_provider_invoice_created.handler'
import { billingProviderRegistry } from '#modules/billing-provider/billing_provider.registry'
import StripeBillingProviderAdapter from '#modules/billing-provider/stripe_billing_provider.adapter'
import type { StripeSettings } from '#modules/billing-provider/stripe_billing_provider.config'
import BillingCatalogService from '#services/billing_catalog_service'

const WEBHOOK_SECRET = 'whsec_fixtureInv1'
const STRIPE_FIXTURE_SETTINGS: StripeSettings = {
  status: 'enabled',
  mode: 'test',
  secretKey: 'sk_test_fixtureSecret1',
  publishableKey: null,
  webhookSecret: WEBHOOK_SECRET,
}

const PERIOD_START = 1_793_512_800
const PERIOD_END = 1_796_104_800

function signPayload(payload: string): string {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET })
}

function invoiceEventPayload(
  eventId: string,
  invoiceId: string,
  subscriptionId: string,
  customerId: string
): string {
  return JSON.stringify({
    id: eventId,
    object: 'event',
    type: 'invoice.created',
    livemode: false,
    created: 1_700_000_000,
    data: {
      object: {
        id: invoiceId,
        object: 'invoice',
        customer: customerId,
        status: 'draft',
        billing_reason: 'subscription_cycle',
        parent: {
          type: 'subscription_details',
          subscription_details: { subscription: subscriptionId },
        },
      },
    },
  })
}

function baseProviderInvoice(
  invoiceRef: string,
  subscriptionRef: string,
  customerRef: string,
  overrides: Partial<ProviderInvoice> = {}
): ProviderInvoice {
  return {
    invoiceRef,
    status: 'draft',
    billingReason: CYCLE_BILLING_REASON,
    subscriptionRef,
    customerRef,
    currency: 'mxn',
    totalCents: 0,
    autoAdvance: true,
    lines: [
      {
        lineRef: 'il_base',
        amountCents: 0,
        source: 'subscription_item',
        priceRef: 'price_sim1',
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        proration: false,
        valanserhPart: null,
      },
    ],
    ...overrides,
  }
}

class InvoiceWebhookTestAdapter
  implements BillingProviderPort, BillingWebhookProviderPort, BillingInvoiceProviderPort
{
  readonly key = BILLING_PROVIDER_KEYS.STRIPE
  private readonly delegate = new StripeBillingProviderAdapter(STRIPE_FIXTURE_SETTINGS)
  invoice: ProviderInvoice = baseProviderInvoice('in_placeholder', 'sub_placeholder', 'cus_placeholder')

  verifyWebhookEvent(rawBody: string, signatureHeader: string | null) {
    return this.delegate.verifyWebhookEvent(rawBody, signatureHeader)
  }

  async openSubscription(): Promise<never> {
    throw new Error('not used')
  }
  async admitRecordedPayment(): Promise<void> {
    throw new Error('not used')
  }

  async readInvoice(ref: string): Promise<ProviderInvoice> {
    if (ref !== this.invoice.invoiceRef) {
      throw new Error('unexpected invoice ref')
    }
    return structuredClone(this.invoice)
  }

  async addInvoiceCharge(charge: InvoiceChargeDraft) {
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
    this.invoice.totalCents += charge.amountCents
    return { externalId: `ii_${charge.part}` }
  }

  async holdInvoice(ref: string): Promise<void> {
    if (ref !== this.invoice.invoiceRef) {
      throw new Error('unexpected hold ref')
    }
    this.invoice.autoAdvance = false
  }

  async resumeInvoice(ref: string): Promise<void> {
    if (ref !== this.invoice.invoiceRef) {
      throw new Error('unexpected resume ref')
    }
    this.invoice.autoAdvance = true
  }
}

async function createStripeSubscriptionFixture(
  stamp: number,
  stripeIds: { subscriptionRef: string; customerRef: string }
): Promise<{
  businessUnit: BusinessUnit
  subscription: BillingSubscription
}> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Webhook Invoice Plan ${stamp}`,
    billingPlanDescription: 'fixture 7665 functional',
  })
  const price = await BillingPlanPrice.create({
    billingPlanId: plan.billingPlanId,
    billingPlanPriceAmount: 65,
    billingPlanPriceCurrency: 'MXN',
    billingPlanPriceTaxRate: 0.16,
    billingPlanPriceTrialDays: 0,
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

  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Webhook Invoice BU ${stamp}`,
    businessUnitSlug: `webhook-invoice-bu-${stamp}`,
    businessUnitLegalName: `Webhook Invoice Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'self_service',
  })
  const now = DateTime.now()
  const subscription = await BillingSubscription.create({
    businessUnitId: businessUnit.businessUnitId,
    billingPlanId: plan.billingPlanId,
    billingPlanPriceId: price.billingPlanPriceId,
    billingSubscriptionProvider: BILLING_PROVIDER_KEYS.STRIPE,
    billingSubscriptionStripeCustomerId: stripeIds.customerRef,
    billingSubscriptionStripeSubscriptionId: stripeIds.subscriptionRef,
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
  return { businessUnit, subscription }
}

test.group('POST /api/webhooks/stripe — invoice.created (7665)', (group) => {
  let adapter: InvoiceWebhookTestAdapter
  let restoreProvider: (() => void) | null = null

  group.each.setup(() => {
    adapter = new InvoiceWebhookTestAdapter()
    restoreProvider = billingProviderRegistry.register(adapter)
  })

  group.each.teardown(() => {
    restoreProvider?.()
    restoreProvider = null
  })

  test('CA-7: moneda inválida → 500 uniforme y fila failed con code de factura', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now()
    const invoiceRef = `in_fixture_usd_${stamp}`
    const subscriptionRef = `sub_fixture_usd_${stamp}`
    const customerRef = `cus_fixture_usd_${stamp}`
    const { businessUnit, subscription } = await createStripeSubscriptionFixture(stamp, {
      subscriptionRef,
      customerRef,
    })
    adapter.invoice = baseProviderInvoice(invoiceRef, subscriptionRef, customerRef, {
      currency: 'usd',
    })
    const externalId = `evt_fixture_inv_usd_${stamp}`
    const payload = invoiceEventPayload(externalId, invoiceRef, subscriptionRef, customerRef)

    try {
      const response = await client
        .post('/api/webhooks/stripe')
        .header('stripe-signature', signPayload(payload))
        .header('Content-Type', 'application/json')
        .setup((request) => {
          request.request.ok(() => true)
        })
        .json(payload)

      response.assertStatus(500)
      const body = response.body() as { code: string; detail: string }
      assert.equal(body.code, BILLING_PROVIDER_ERROR_CODES.WEBHOOK_PROCESSING_FAILED)
      assert.equal(body.detail, BILLING_PROVIDER_WEBHOOK_PROCESSING_FAILED_DETAIL)

      const row = await BillingProviderEvent.query()
        .where('billing_provider_event_external_id', externalId)
        .firstOrFail()
      assert.equal(row.billingProviderEventStatus, BILLING_PROVIDER_EVENT_STATUSES.FAILED)
      assert.equal(
        row.billingProviderEventLastErrorCode,
        BILLING_PROVIDER_ERROR_CODES.INVOICE_UNEXPECTED_LINES
      )
      assert.equal(row.billingSubscriptionId, subscription.billingSubscriptionId)
      assert.isFalse(adapter.invoice.autoAdvance)
    } finally {
      await BillingProviderEvent.query()
        .where('billing_provider_event_external_id', externalId)
        .delete()
      await subscription.delete()
      await businessUnit.delete()
    }
  })

  test('CA-9: sin suscripción local → failed; reentrega tras alta → processed', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now()
    const invoiceRef = `in_fixture_nosub_${stamp}`
    const subscriptionRef = `sub_fixture_nosub_${stamp}`
    const customerRef = `cus_fixture_nosub_${stamp}`
    adapter.invoice = baseProviderInvoice(invoiceRef, subscriptionRef, customerRef)
    const externalId = `evt_fixture_inv_nosub_${stamp}`
    const payload = invoiceEventPayload(externalId, invoiceRef, subscriptionRef, customerRef)

    let businessUnit: BusinessUnit | null = null
    let subscription: BillingSubscription | null = null

    try {
      const first = await client
        .post('/api/webhooks/stripe')
        .header('stripe-signature', signPayload(payload))
        .header('Content-Type', 'application/json')
        .setup((request) => {
          request.request.ok(() => true)
        })
        .json(payload)

      first.assertStatus(500)
      let row = await BillingProviderEvent.query()
        .where('billing_provider_event_external_id', externalId)
        .firstOrFail()
      assert.equal(row.billingProviderEventStatus, BILLING_PROVIDER_EVENT_STATUSES.FAILED)
      assert.equal(
        row.billingProviderEventLastErrorCode,
        BILLING_PROVIDER_ERROR_CODES.INVOICE_SUBSCRIPTION_NOT_FOUND
      )
      assert.isNull(row.billingSubscriptionId)

      ;({ businessUnit, subscription } = await createStripeSubscriptionFixture(stamp, {
        subscriptionRef,
        customerRef,
      }))
      adapter.invoice.autoAdvance = true

      const second = await client
        .post('/api/webhooks/stripe')
        .header('stripe-signature', signPayload(payload))
        .header('Content-Type', 'application/json')
        .setup((request) => {
          request.request.ok(() => true)
        })
        .json(payload)

      second.assertStatus(200)
      row = await BillingProviderEvent.query()
        .where('billing_provider_event_external_id', externalId)
        .firstOrFail()
      assert.equal(row.billingProviderEventStatus, BILLING_PROVIDER_EVENT_STATUSES.PROCESSED)
      assert.equal(row.billingSubscriptionId, subscription!.billingSubscriptionId)
      assert.isTrue(adapter.invoice.autoAdvance)
    } finally {
      await BillingProviderEvent.query()
        .where('billing_provider_event_external_id', externalId)
        .delete()
      if (subscription) {
        await subscription.delete()
      }
      if (businessUnit) {
        await businessUnit.delete()
      }
    }
  })
})
