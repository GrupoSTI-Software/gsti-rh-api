import Stripe from 'stripe'
import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import mail from '@adonisjs/mail/services/main'
import env from '#start/env'
import BillingProviderPaymentUnsettledMail from '#mails/billing_provider_payment_unsettled_mail'
import BillingProviderPaymentMisalignedMail from '#mails/billing_provider_payment_misaligned_mail'
import { writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PDFDocument } from 'pdf-lib'
import type { ApiClient } from '@japa/api-client'
import { BILLING_PROVIDER_ERROR_CODES } from '#constants/billing_provider_error_codes'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingProviderEvent, {
  BILLING_PROVIDER_EVENT_STATUSES,
} from '#models/billing_provider_event'
import BillingPayment from '#models/billing_payment'
import BillingSubscription from '#models/billing_subscription'
import BillingVolumeTier from '#models/billing_volume_tier'
import BusinessUnit from '#models/business_unit'
import User from '#models/user'
import Person from '#models/person'
import {
  BILLING_PROVIDER_KEYS,
  type BillingProviderPort,
  type BillingInvoiceProviderPort,
  type BillingWebhookProviderPort,
  type ProviderInvoice,
  type ReadInvoiceOptions,
} from '#modules/billing-provider/billing_provider.port'
import { CYCLE_BILLING_REASON } from '#modules/billing-provider/billing_provider_invoice_created.handler'
import { billingProviderRegistry } from '#modules/billing-provider/billing_provider.registry'
import StripeBillingProviderAdapter from '#modules/billing-provider/stripe_billing_provider.adapter'
import type { StripeSettings } from '#modules/billing-provider/stripe_billing_provider.config'
import BillingCatalogService from '#services/billing_catalog_service'
import { getBusinessTimeZone, toCalendarIsoDate } from '#utils/business_date'
import { ensureRole } from '#tests/helpers/ensure_role'

const WEBHOOK_SECRET = 'whsec_fixtureInvPaid1'
const STRIPE_FIXTURE_SETTINGS: StripeSettings = {
  status: 'enabled',
  mode: 'test',
  secretKey: 'sk_test_fixtureSecret1',
  publishableKey: null,
  webhookSecret: WEBHOOK_SECRET,
}

const PERIOD_START = 1_793_512_800
const PERIOD_END = 1_796_104_800
const PAID_AT = 1_793_599_200
const PERIOD_AMOUNT = 1_044_000

const TEST_PASSWORD = 'BillingInvoicePaid7693!'
const PII_SENTINEL_EMAIL = 'prospecto.fixture@correo.test'
const PII_SENTINEL_NAME = 'Fixture SA'
const DEV_GATE_RECIPIENT = 'wramirez@gruposti.com'
const TEST_SMTP_SENDER = 'smtp-billing-inv-paid@gsti.local'

async function withEnvVars(
  vars: Record<string, string | undefined>,
  executor: () => Promise<void>
): Promise<void> {
  const originals: Record<string, string | undefined> = {}
  const previousGet = env.get.bind(env) as (key: string, defaultValue?: unknown) => unknown

  for (const [key, value] of Object.entries(vars)) {
    originals[key] = process.env[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  ;(env as unknown as { get: typeof previousGet }).get = (
    key: string,
    defaultValue?: unknown
  ) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      const value = vars[key]
      if (value === undefined) {
        return defaultValue
      }
      return value
    }
    return previousGet(key, defaultValue)
  }

  try {
    await executor()
  } finally {
    ;(env as unknown as { get: typeof previousGet }).get = previousGet
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

async function withSmtpConfigured(executor: () => Promise<void>): Promise<void> {
  await withEnvVars({ SMTP_USERNAME: TEST_SMTP_SENDER }, executor)
}

function assertMailFreeOfPii(
  assert: { notInclude: (haystack: string, needle: string) => void },
  subject: string,
  html: string
): void {
  for (const needle of [PII_SENTINEL_EMAIL, PII_SENTINEL_NAME]) {
    assert.notInclude(subject, needle)
    assert.notInclude(html, needle)
  }
}

function signPayload(payload: string): string {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET })
}

function invoicePaidEventPayload(
  eventId: string,
  invoiceId: string,
  subscriptionId: string,
  customerId: string,
  amountPaid = 999_999
): string {
  return JSON.stringify({
    id: eventId,
    object: 'event',
    type: 'invoice.paid',
    livemode: false,
    created: PAID_AT,
    data: {
      object: {
        id: invoiceId,
        object: 'invoice',
        customer: customerId,
        status: 'paid',
        billing_reason: 'subscription_cycle',
        amount_paid: amountPaid,
        parent: {
          type: 'subscription_details',
          subscription_details: { subscription: subscriptionId },
        },
      },
    },
  })
}

function basePaidProviderInvoice(
  invoiceRef: string,
  subscriptionRef: string,
  customerRef: string,
  overrides: Partial<ProviderInvoice> = {}
): ProviderInvoice {
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
      {
        lineRef: 'il_sub_item',
        amountCents: 0,
        source: 'subscription_item',
        priceRef: 'price_sim1',
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        proration: false,
        valanserhPart: null,
      },
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

class InvoicePaidWebhookTestAdapter
  implements BillingProviderPort, BillingWebhookProviderPort, BillingInvoiceProviderPort
{
  readonly key = BILLING_PROVIDER_KEYS.STRIPE
  private readonly delegate = new StripeBillingProviderAdapter(STRIPE_FIXTURE_SETTINGS)
  invoice: ProviderInvoice = basePaidProviderInvoice('in_placeholder', 'sub_placeholder', 'cus_placeholder')

  verifyWebhookEvent(rawBody: string, signatureHeader: string | null) {
    return this.delegate.verifyWebhookEvent(rawBody, signatureHeader)
  }

  async openSubscription(): Promise<never> {
    throw new Error('not used')
  }
  async admitRecordedPayment(): Promise<void> {
    throw new Error('not used')
  }

  async readInvoice(ref: string, _options?: ReadInvoiceOptions): Promise<ProviderInvoice> {
    if (ref !== this.invoice.invoiceRef) {
      throw new Error('unexpected invoice ref')
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

async function createStripeSubscriptionFixture(
  stamp: number,
  stripeIds: { subscriptionRef: string; customerRef: string }
): Promise<{
  businessUnit: BusinessUnit
  subscription: BillingSubscription
}> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Webhook Invoice Paid Plan ${stamp}`,
    billingPlanDescription: 'fixture 7693 functional',
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
    businessUnitName: `Webhook Invoice Paid BU ${stamp}`,
    businessUnitSlug: `webhook-invoice-paid-bu-${stamp}`,
    businessUnitLegalName: `Webhook Invoice Paid Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'self_service',
  })
  const zone = getBusinessTimeZone()
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
    billingSubscriptionContractedEffectiveFrom: DateTime.now(),
    billingSubscriptionSubscribedAt: DateTime.now(),
    billingSubscriptionCurrentPeriodStart: DateTime.fromISO('2026-10-01', { zone }),
    billingSubscriptionCurrentPeriodEnd: DateTime.fromISO('2026-11-01', { zone }),
    billingSubscriptionLiveBusinessUnitId: businessUnit.businessUnitId,
  })
  return { businessUnit, subscription }
}

async function buildPdfReceipt(): Promise<Buffer> {
  const doc = await PDFDocument.create()
  doc.addPage()
  return Buffer.from(await doc.save())
}

async function createPlatformAdmin(): Promise<User> {
  const role = await ensureRole('root')
  const email = `platform-inv-paid-${Date.now()}@gsti-tests.local`
  const person = await Person.create({
    personFirstname: 'Platform',
    personLastname: 'InvoicePaid',
    personSecondLastname: 'Test',
    personEmail: email,
  })
  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    isPlatformAdmin: true,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  return user
}

async function platformToken(client: ApiClient, admin: User): Promise<string> {
  const response = await client.post('/api/platform/auth/login').json({
    userEmail: admin.userEmail,
    userPassword: TEST_PASSWORD,
  })
  response.assertStatus(200)
  const token = (response.body() as { data?: { token?: string } }).data?.token
  if (!token) {
    throw new Error('Login de plataforma no devolvió token')
  }
  return token
}

test.group('POST /api/webhooks/stripe — invoice.paid (7693)', (group) => {
  let adapter: InvoicePaidWebhookTestAdapter
  let restoreProvider: (() => void) | null = null

  group.each.setup(() => {
    adapter = new InvoicePaidWebhookTestAdapter()
    restoreProvider = billingProviderRegistry.register(adapter)
  })

  group.each.teardown(() => {
    restoreProvider?.()
    restoreProvider = null
  })

  test('CA-3: ciclo normal asienta pago card y avanza periodo', async ({ client, assert }) => {
    const stamp = Date.now()
    const invoiceRef = `in_fixtureP2_${stamp}`
    const subscriptionRef = `sub_fixtureP2_${stamp}`
    const customerRef = `cus_fixtureP2_${stamp}`
    const externalId = `evt_fixtureP2_${stamp}`
    const { businessUnit, subscription } = await createStripeSubscriptionFixture(stamp, {
      subscriptionRef,
      customerRef,
    })
    adapter.invoice = basePaidProviderInvoice(invoiceRef, subscriptionRef, customerRef)
    const payload = invoicePaidEventPayload(externalId, invoiceRef, subscriptionRef, customerRef)

    try {
      const response = await client
        .post('/api/webhooks/stripe')
        .header('stripe-signature', signPayload(payload))
        .header('Content-Type', 'application/json')
        .setup((request) => {
          request.request.ok(() => true)
        })
        .json(payload)

      response.assertStatus(200)

      const row = await BillingProviderEvent.query()
        .where('billing_provider_event_external_id', externalId)
        .firstOrFail()
      assert.equal(row.billingProviderEventStatus, BILLING_PROVIDER_EVENT_STATUSES.PROCESSED)

      const payment = await BillingPayment.query()
        .where('billing_payment_provider_invoice_id', invoiceRef)
        .firstOrFail()
      assert.equal(payment.billingPaymentMethod, 'card')
      assert.equal(payment.billingPaymentProvider, 'stripe')
      assert.isNull(payment.billingPaymentReceiptPath)
      assert.equal(payment.billingPaymentAmountCents, PERIOD_AMOUNT)
      assert.equal(payment.billingPaymentProviderInvoiceId, invoiceRef)
      assert.equal(payment.billingPaymentProviderPaymentRef, 'pi_fixtureP2')
      assert.equal(payment.billingPaymentProviderEventId, externalId)
      assert.equal(payment.billingPaymentPeriodsCovered, 1)

      await subscription.refresh()
      assert.equal(
        toCalendarIsoDate(subscription.billingSubscriptionCurrentPeriodStart),
        '2026-11-01'
      )
      assert.equal(
        toCalendarIsoDate(subscription.billingSubscriptionCurrentPeriodEnd),
        '2026-12-01'
      )
      assert.equal(subscription.billingSubscriptionStatus, 'active')
    } finally {
      await BillingProviderEvent.query()
        .where('billing_provider_event_external_id', externalId)
        .delete()
      await BillingPayment.query().where('billing_payment_provider_invoice_id', invoiceRef).delete()
      await subscription.delete()
      await businessUnit.delete()
    }
  })

  test('CA-8: reentrega del mismo evento → duplicate y un solo pago', async ({ client, assert }) => {
    const stamp = Date.now()
    const invoiceRef = `in_fixture_dup_${stamp}`
    const subscriptionRef = `sub_fixture_dup_${stamp}`
    const customerRef = `cus_fixture_dup_${stamp}`
    const externalId = `evt_fixture_dup_${stamp}`
    const { businessUnit, subscription } = await createStripeSubscriptionFixture(stamp, {
      subscriptionRef,
      customerRef,
    })
    adapter.invoice = basePaidProviderInvoice(invoiceRef, subscriptionRef, customerRef)
    const payload = invoicePaidEventPayload(externalId, invoiceRef, subscriptionRef, customerRef)

    try {
      const first = await client
        .post('/api/webhooks/stripe')
        .header('stripe-signature', signPayload(payload))
        .header('Content-Type', 'application/json')
        .setup((request) => {
          request.request.ok(() => true)
        })
        .json(payload)
      first.assertStatus(200)

      const second = await client
        .post('/api/webhooks/stripe')
        .header('stripe-signature', signPayload(payload))
        .header('Content-Type', 'application/json')
        .setup((request) => {
          request.request.ok(() => true)
        })
        .json(payload)
      second.assertStatus(200)

      const payments = await BillingPayment.query().where(
        'billing_payment_provider_invoice_id',
        invoiceRef
      )
      assert.lengthOf(payments, 1)
    } finally {
      await BillingProviderEvent.query()
        .where('billing_provider_event_external_id', externalId)
        .delete()
      await BillingPayment.query().where('billing_payment_provider_invoice_id', invoiceRef).delete()
      await subscription.delete()
      await businessUnit.delete()
    }
  })

  test('CA-10: sin suscripción local → failed; reentrega tras alta → processed', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now()
    const invoiceRef = `in_fixture_nosub_paid_${stamp}`
    const subscriptionRef = `sub_fixture_nosub_paid_${stamp}`
    const customerRef = `cus_fixture_nosub_paid_${stamp}`
    const externalId = `evt_fixture_nosub_paid_${stamp}`
    adapter.invoice = basePaidProviderInvoice(invoiceRef, subscriptionRef, customerRef)
    const payload = invoicePaidEventPayload(externalId, invoiceRef, subscriptionRef, customerRef)

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
      const body = first.body() as { code: string }
      assert.equal(body.code, BILLING_PROVIDER_ERROR_CODES.WEBHOOK_PROCESSING_FAILED)

      let row = await BillingProviderEvent.query()
        .where('billing_provider_event_external_id', externalId)
        .firstOrFail()
      assert.equal(row.billingProviderEventStatus, BILLING_PROVIDER_EVENT_STATUSES.FAILED)
      assert.equal(
        row.billingProviderEventLastErrorCode,
        BILLING_PROVIDER_ERROR_CODES.INVOICE_SUBSCRIPTION_NOT_FOUND
      )

      ;({ businessUnit, subscription } = await createStripeSubscriptionFixture(stamp, {
        subscriptionRef,
        customerRef,
      }))

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
    } finally {
      await BillingProviderEvent.query()
        .where('billing_provider_event_external_id', externalId)
        .delete()
      await BillingPayment.query().where('billing_payment_provider_invoice_id', invoiceRef).delete()
      if (subscription) {
        await subscription.delete()
      }
      if (businessUnit) {
        await businessUnit.delete()
      }
    }
  })

  test('CA-13: avisos unsettled y misaligned sin PII (ciclo cero y desalineado)', async ({
    client,
    assert,
  }) => {
    const fake = mail.fake()
    const stamp = Date.now()
    const zeroInvoiceRef = `in_fixture_zero_paid_${stamp}`
    const misInvoiceRef = `in_fixture_mis_paid_${stamp}`
    const subscriptionRef = `sub_fixture_pii_${stamp}`
    const customerRef = `cus_fixture_pii_${stamp}`
    const zeroEventId = `evt_fixture_zero_paid_${stamp}`
    const misEventId = `evt_fixture_mis_paid_${stamp}`

    const { businessUnit, subscription } = await createStripeSubscriptionFixture(stamp, {
      subscriptionRef,
      customerRef,
    })
    const zone = getBusinessTimeZone()
    subscription.billingSubscriptionCurrentPeriodStart = DateTime.fromISO('2026-11-01', {
      zone,
    })
    subscription.billingSubscriptionCurrentPeriodEnd = DateTime.fromISO('2026-12-01', { zone })
    await subscription.save()

    try {
      await withSmtpConfigured(async () => {
        await withEnvVars(
          {
            BILLING_INTERNAL_NOTIFICATION_EMAILS: DEV_GATE_RECIPIENT,
            NODE_ENV: 'test',
          },
          async () => {
            adapter.invoice = basePaidProviderInvoice(zeroInvoiceRef, subscriptionRef, customerRef, {
              amountPaidCents: 0,
              totalCents: 0,
              paymentIntentRef: null,
              lines: [
                {
                  lineRef: 'il_sub_zero',
                  amountCents: 0,
                  source: 'subscription_item',
                  priceRef: 'price_sim1',
                  periodStart: PERIOD_START,
                  periodEnd: PERIOD_END,
                  proration: false,
                  valanserhPart: null,
                },
              ],
            })
            const zeroPayload = invoicePaidEventPayload(
              zeroEventId,
              zeroInvoiceRef,
              subscriptionRef,
              customerRef,
              0
            )
            const zeroResponse = await client
              .post('/api/webhooks/stripe')
              .header('stripe-signature', signPayload(zeroPayload))
              .header('Content-Type', 'application/json')
              .setup((request) => {
                request.request.ok(() => true)
              })
              .json(zeroPayload)
            zeroResponse.assertStatus(200)

            adapter.invoice = basePaidProviderInvoice(misInvoiceRef, subscriptionRef, customerRef)
            const misPayload = invoicePaidEventPayload(
              misEventId,
              misInvoiceRef,
              subscriptionRef,
              customerRef
            )
            const misResponse = await client
              .post('/api/webhooks/stripe')
              .header('stripe-signature', signPayload(misPayload))
              .header('Content-Type', 'application/json')
              .setup((request) => {
                request.request.ok(() => true)
              })
              .json(misPayload)
            misResponse.assertStatus(200)
          }
        )
      })

      fake.mails.assertSent(BillingProviderPaymentUnsettledMail, ({ message }) => {
        const json = message.toJSON() as { message: { subject: string; html: string } }
        assertMailFreeOfPii(assert, json.message.subject, json.message.html)
        message.assertHtmlIncludes(zeroInvoiceRef)
        return message.hasTo(DEV_GATE_RECIPIENT)
      })
      fake.mails.assertSent(BillingProviderPaymentMisalignedMail, ({ message }) => {
        const json = message.toJSON() as { message: { subject: string; html: string } }
        assertMailFreeOfPii(assert, json.message.subject, json.message.html)
        message.assertHtmlIncludes(misInvoiceRef)
        return message.hasTo(DEV_GATE_RECIPIENT)
      })
    } finally {
      mail.restore()
      await BillingProviderEvent.query()
        .whereIn('billing_provider_event_external_id', [zeroEventId, misEventId])
        .delete()
      await BillingPayment.query()
        .whereIn('billing_payment_provider_invoice_id', [zeroInvoiceRef, misInvoiceRef])
        .delete()
      await subscription.delete()
      await businessUnit.delete()
    }
  })

  test('CA-9: moneda inválida → ignored sin pago', async ({ client, assert }) => {
    const stamp = Date.now()
    const invoiceRef = `in_fixture_usd_paid_${stamp}`
    const subscriptionRef = `sub_fixture_usd_paid_${stamp}`
    const customerRef = `cus_fixture_usd_paid_${stamp}`
    const externalId = `evt_fixture_usd_paid_${stamp}`
    const { businessUnit, subscription } = await createStripeSubscriptionFixture(stamp, {
      subscriptionRef,
      customerRef,
    })
    adapter.invoice = basePaidProviderInvoice(invoiceRef, subscriptionRef, customerRef, {
      currency: 'usd',
    })
    const payload = invoicePaidEventPayload(externalId, invoiceRef, subscriptionRef, customerRef)

    try {
      const response = await client
        .post('/api/webhooks/stripe')
        .header('stripe-signature', signPayload(payload))
        .header('Content-Type', 'application/json')
        .setup((request) => {
          request.request.ok(() => true)
        })
        .json(payload)

      response.assertStatus(200)
      const row = await BillingProviderEvent.query()
        .where('billing_provider_event_external_id', externalId)
        .firstOrFail()
      assert.equal(row.billingProviderEventStatus, BILLING_PROVIDER_EVENT_STATUSES.IGNORED)

      const payments = await BillingPayment.query().where(
        'billing_payment_provider_invoice_id',
        invoiceRef
      )
      assert.lengthOf(payments, 0)
    } finally {
      await BillingProviderEvent.query()
        .where('billing_provider_event_external_id', externalId)
        .delete()
      await subscription.delete()
      await businessUnit.delete()
    }
  })
})

test.group('POST /api/platform/billing/subscriptions/:id/payments — card (7693 / CA-2)', () => {
  test('method card → 422 PLT.PAY.VAL_INPUT', async ({ client, assert }) => {
    const stamp = Date.now()
    const admin = await createPlatformAdmin()
    const { businessUnit, subscription } = await createStripeSubscriptionFixture(stamp, {
      subscriptionRef: `sub_manual_card_${stamp}`,
      customerRef: `cus_manual_card_${stamp}`,
    })
    const token = await platformToken(client, admin)
    const pdf = await buildPdfReceipt()
    const tmpPath = join(tmpdir(), `receipt-card-${stamp}.pdf`)
    await writeFile(tmpPath, Uint8Array.from(pdf))

    try {
      const response = await client
        .post(`/api/platform/billing/subscriptions/${subscription.billingSubscriptionId}/payments`)
        .header('Authorization', `Bearer ${token}`)
        .file('receipt', tmpPath, { filename: 'receipt.pdf', contentType: 'application/pdf' })
        .fields({
          method: 'card',
          paidAt: DateTime.now().toISO()!,
          amountCents: String(PERIOD_AMOUNT),
        })

      response.assertStatus(422)
      const body = response.body() as { code: string; title: string }
      assert.equal(body.code, 'PLT.PAY.VAL_INPUT')
      assert.equal(body.title, 'Pagos de suscripción')

      const count = await BillingPayment.query()
        .where('billing_subscription_id', subscription.billingSubscriptionId)
        .count('* as total')
      assert.equal(Number(count[0]?.$extras.total ?? 0), 0)
    } finally {
      await unlink(tmpPath).catch(() => undefined)
      await subscription.delete()
      await businessUnit.delete()
      await admin.delete()
    }
  })
})
