import Stripe from 'stripe'
import logger from '@adonisjs/core/services/logger'
import {
  BILLING_PROVIDER_ERROR_CODES,
  BILLING_PROVIDER_STRIPE_NOT_CONFIGURED_DETAIL,
  BILLING_PROVIDER_WEBHOOK_MODE_MISMATCH_DETAIL,
  BILLING_PROVIDER_WEBHOOK_SIGNATURE_INVALID_DETAIL,
} from '#constants/billing_provider_error_codes'
import { BillingProviderServiceError } from '#exceptions/billing_provider_service_error'
import {
  cardNotConfirmed,
  operationNotAvailable,
  providerRequestFailed,
} from '#modules/billing-provider/billing_provider.errors'
import {
  BILLING_PROVIDER_KEYS,
  type BillingCatalogProviderPort,
  type BillingCheckoutProviderPort,
  type BillingInvoiceProviderPort,
  type BillingProviderPort,
  type BillingWebhookProviderPort,
  type InvoiceChargeDraft,
  type ProviderInvoice,
  type ProviderInvoiceLine,
  type ProviderInvoiceStatus,
  type ValanserhInvoicePart,
  type CardSetup,
  type CardSetupRequest,
  type ProviderSubscriptionRequest,
  type CatalogPriceDraft,
  type CatalogProductDraft,
  type ProviderEventObjectSummary,
  type ProviderObjectRef,
  type RecordedPaymentRequest,
  type SubscriptionOpening,
  type SubscriptionOpeningRequest,
  type VerifiedProviderEvent,
} from '#modules/billing-provider/billing_provider.port'
import type { StripeProviderDescription, StripeSettings } from '#modules/billing-provider/stripe_billing_provider.config'
import { toStripeProviderDescription } from '#modules/billing-provider/stripe_billing_provider.config'

export const STRIPE_API_VERSION = '2026-08-26.dahlia' as const

export type StripeClientFactory = (secretKey: string) => Stripe

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    timeout: 20_000,
    maxNetworkRetries: 2,
    appInfo: { name: 'valanserh-api' },
  })
}

export function catalogIdempotencyKey(kind: 'product' | 'price', id: number): string {
  return kind === 'product'
    ? `valanserh-billing-plan-${id}-product`
    : `valanserh-billing-plan-price-${id}-base`
}

export function buildStripeProductParams(draft: CatalogProductDraft): Stripe.ProductCreateParams {
  return {
    name: draft.name,
    metadata: {
      valanserh_billing_plan_id: String(draft.billingPlanId),
    },
  }
}

const REUSABLE_SETUP_INTENT_STATUSES = new Set([
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
  'processing',
])

export function cardSetupIdempotencyKey(signupDraftId: number, setupIntentRef: string | null): string {
  const suffix = setupIntentRef ?? 'initial'
  return `valanserh-signup-draft-${signupDraftId}-setup-${suffix}`
}

export function buildStripeCardSetupCustomerParams(
  email: string,
  signupDraftId: number
): Stripe.CustomerCreateParams {
  return {
    email,
    metadata: {
      valanserh_signup_draft_id: String(signupDraftId),
    },
  }
}

export const ZERO_TRIAL_END_OFFSET_SECONDS = 300

const REUSABLE_STRIPE_SUBSCRIPTION_STATUSES = new Set([
  'trialing',
  'active',
  'incomplete',
  'past_due',
])

export function subscriptionIdempotencyKey(signupDraftId: number, attempt: number): string {
  return `valanserh-signup-draft-${signupDraftId}-subscription-${attempt}`
}

export function subscriptionCancelIdempotencyKey(subscriptionRef: string): string {
  return `valanserh-subscription-${subscriptionRef}-cancel`
}

export function buildStripeSubscriptionParams(params: {
  customerRef: string
  priceRef: string
  paymentMethodRef: string
  trialEndEpoch: number
  signupDraftId: number
  attempt: number
}): Stripe.SubscriptionCreateParams {
  return {
    customer: params.customerRef,
    items: [{ price: params.priceRef }],
    default_payment_method: params.paymentMethodRef,
    trial_end: params.trialEndEpoch,
    proration_behavior: 'none',
    payment_behavior: 'allow_incomplete',
    collection_method: 'charge_automatically',
    metadata: {
      valanserh_signup_draft_id: String(params.signupDraftId),
      valanserh_signup_attempt: String(params.attempt),
    },
  }
}

const INVOICE_REF_PATTERN = /^in_[A-Za-z0-9]+$/
const CUSTOMER_REF_PATTERN = /^cus_[A-Za-z0-9]+$/

const PROVIDER_INVOICE_STATUSES: ReadonlySet<ProviderInvoiceStatus> = new Set([
  'draft',
  'open',
  'paid',
  'uncollectible',
  'void',
])

export function assertInvoiceRef(ref: string, operation: string): void {
  if (!INVOICE_REF_PATTERN.test(ref)) {
    throw providerRequestFailed(operation, { stripeErrorType: null, stripeRequestId: null })
  }
}

export function assertCustomerRef(ref: string, operation: string): void {
  if (!CUSTOMER_REF_PATTERN.test(ref)) {
    throw providerRequestFailed(operation, { stripeErrorType: null, stripeRequestId: null })
  }
}

export function invoiceChargeIdempotencyKey(
  invoiceRef: string,
  part: ValanserhInvoicePart
): string {
  return `valanserh-invoice-${invoiceRef}-${part}`
}

export function buildInvoiceItemParams(
  charge: InvoiceChargeDraft
): Stripe.InvoiceItemCreateParams {
  return {
    customer: charge.customerRef,
    invoice: charge.invoiceRef,
    amount: charge.amountCents,
    currency: charge.currency.toLowerCase(),
    description: charge.description,
    metadata: {
      valanserh_invoice_part: charge.part,
      valanserh_invoice_ref: charge.invoiceRef,
      valanserh_billing_subscription_id: String(charge.billingSubscriptionId),
    },
  }
}

function throwReadInvoiceShapeError(field: string): never {
  logger.warn(
    { provider: BILLING_PROVIDER_KEYS.STRIPE, operation: 'readInvoice', field },
    'Cobro: respuesta de Stripe con forma inesperada'
  )
  throw providerRequestFailed('readInvoice', { stripeErrorType: null, stripeRequestId: null })
}

function mapProviderInvoiceStatus(status: unknown): ProviderInvoiceStatus | null {
  if (typeof status !== 'string') {
    return null
  }
  return PROVIDER_INVOICE_STATUSES.has(status as ProviderInvoiceStatus)
    ? (status as ProviderInvoiceStatus)
    : null
}

function readStripeCustomerRef(customer: Stripe.Invoice['customer']): string {
  if (typeof customer === 'string' && customer.length > 0) {
    return customer
  }
  if (
    typeof customer === 'object' &&
    customer !== null &&
    'id' in customer &&
    typeof customer.id === 'string' &&
    customer.id.length > 0
  ) {
    return customer.id
  }
  throwReadInvoiceShapeError('customer')
}

function readStripeSubscriptionRefFromInvoice(invoice: Stripe.Invoice): string | null {
  const parent = invoice.parent
  if (parent?.type !== 'subscription_details') {
    return null
  }
  const subscription = parent.subscription_details?.subscription
  if (typeof subscription === 'string') {
    return subscription
  }
  if (
    typeof subscription === 'object' &&
    subscription !== null &&
    typeof subscription.id === 'string'
  ) {
    return subscription.id
  }
  return null
}

function readValanserhPart(metadata: Stripe.Metadata | null | undefined): ValanserhInvoicePart | null {
  const raw = metadata?.valanserh_invoice_part
  if (raw === 'period' || raw === 'increase_debt') {
    return raw
  }
  return null
}

function readPriceRefFromLine(line: Stripe.InvoiceLineItem): string | null {
  const price = line.pricing?.price_details?.price
  if (typeof price === 'string') {
    return price
  }
  if (typeof price === 'object' && price !== null && typeof price.id === 'string') {
    return price.id
  }
  return null
}

function readLineSource(line: Stripe.InvoiceLineItem): ProviderInvoiceLine['source'] {
  const parentType = line.parent?.type
  if (parentType === 'subscription_item_details') {
    return 'subscription_item'
  }
  if (parentType === 'invoice_item_details') {
    return 'invoice_item'
  }
  return 'other'
}

function readLineProration(line: Stripe.InvoiceLineItem): boolean {
  const parent = line.parent
  if (parent?.type === 'subscription_item_details') {
    return parent.subscription_item_details?.proration === true
  }
  if (parent?.type === 'invoice_item_details') {
    return parent.invoice_item_details?.proration === true
  }
  return false
}

export function mapProviderInvoiceLine(raw: Stripe.InvoiceLineItem): ProviderInvoiceLine {
  if (typeof raw.id !== 'string' || raw.id === '') {
    throwReadInvoiceShapeError('line.id')
  }
  if (!Number.isInteger(raw.amount)) {
    throwReadInvoiceShapeError('line.amount')
  }
  const periodStart = raw.period?.start
  const periodEnd = raw.period?.end
  if (!Number.isInteger(periodStart)) {
    throwReadInvoiceShapeError('line.period.start')
  }
  if (!Number.isInteger(periodEnd)) {
    throwReadInvoiceShapeError('line.period.end')
  }

  return {
    lineRef: raw.id,
    amountCents: raw.amount,
    source: readLineSource(raw),
    priceRef: readPriceRefFromLine(raw),
    periodStart,
    periodEnd,
    proration: readLineProration(raw),
    valanserhPart: readValanserhPart(raw.metadata),
  }
}

export function mapProviderInvoice(
  raw: Stripe.Invoice,
  lines: Stripe.InvoiceLineItem[]
): ProviderInvoice {
  if (typeof raw.id !== 'string' || raw.id === '') {
    throwReadInvoiceShapeError('id')
  }
  if (typeof raw.currency !== 'string' || raw.currency === '') {
    throwReadInvoiceShapeError('currency')
  }
  if (!Number.isInteger(raw.total)) {
    throwReadInvoiceShapeError('total')
  }
  if (typeof raw.auto_advance !== 'boolean') {
    throwReadInvoiceShapeError('auto_advance')
  }

  return {
    invoiceRef: raw.id,
    status: mapProviderInvoiceStatus(raw.status),
    billingReason: typeof raw.billing_reason === 'string' ? raw.billing_reason : null,
    subscriptionRef: readStripeSubscriptionRefFromInvoice(raw),
    customerRef: readStripeCustomerRef(raw.customer),
    currency: raw.currency,
    totalCents: raw.total,
    autoAdvance: raw.auto_advance,
    lines: lines.map(mapProviderInvoiceLine),
  }
}

async function listAllInvoiceLineItems(
  client: Stripe,
  invoiceRef: string
): Promise<Stripe.InvoiceLineItem[]> {
  const lines: Stripe.InvoiceLineItem[] = []
  let startingAfter: string | undefined

  for (;;) {
    const page = await client.invoices.listLineItems(invoiceRef, {
      limit: 100,
      ...(startingAfter !== undefined ? { starting_after: startingAfter } : {}),
    })
    lines.push(...page.data)
    if (!page.has_more || page.data.length === 0) {
      break
    }
    const lastId = page.data[page.data.length - 1]?.id
    if (typeof lastId !== 'string' || lastId === '') {
      break
    }
    startingAfter = lastId
  }

  return lines
}

function readPaymentMethodId(paymentMethod: Stripe.SetupIntent['payment_method']): string | null {
  if (typeof paymentMethod === 'string') {
    return paymentMethod.length > 0 ? paymentMethod : null
  }
  if (typeof paymentMethod === 'object' && paymentMethod !== null) {
    const id = paymentMethod.id
    return typeof id === 'string' && id.length > 0 ? id : null
  }
  return null
}

function setupIntentReadyForSubscription(
  setupIntent: Stripe.SetupIntent,
  customerRef: string,
  signupDraftId: number
): string | null {
  if (setupIntent.status !== 'succeeded') {
    return null
  }
  const customer = setupIntent.customer
  const customerId = typeof customer === 'string' ? customer : customer?.id ?? null
  if (customerId !== customerRef) {
    return null
  }
  if (setupIntent.usage !== 'off_session') {
    return null
  }
  const paymentMethodId = readPaymentMethodId(setupIntent.payment_method)
  if (paymentMethodId === null) {
    return null
  }
  if (setupIntent.metadata?.valanserh_signup_draft_id !== String(signupDraftId)) {
    return null
  }
  return paymentMethodId
}

function subscriptionBelongsToDraft(subscription: Stripe.Subscription, signupDraftId: number): boolean {
  return subscription.metadata?.valanserh_signup_draft_id === String(signupDraftId)
}

function subscriptionPriceRef(subscription: Stripe.Subscription): string | null {
  const item = subscription.items?.data?.[0]
  if (!item?.price) {
    return null
  }
  const price = item.price
  return typeof price === 'string' ? price : price.id ?? null
}

export function buildStripeSetupIntentParams(
  customerId: string,
  signupDraftId: number
): Stripe.SetupIntentCreateParams {
  return {
    customer: customerId,
    usage: 'off_session',
    payment_method_types: ['card'],
    metadata: {
      valanserh_signup_draft_id: String(signupDraftId),
    },
  }
}

export function buildStripePriceParams(draft: CatalogPriceDraft): Stripe.PriceCreateParams {
  return {
    product: draft.productRef,
    currency: draft.currency.toLowerCase(),
    unit_amount: draft.unitAmountCents,
    recurring: {
      interval: 'month',
      interval_count: draft.intervalMonths,
    },
    metadata: {
      valanserh_billing_plan_id: String(draft.billingPlanId),
      valanserh_billing_plan_price_id: String(draft.billingPlanPriceId),
    },
  }
}

function stripeNotConfigured(): BillingProviderServiceError {
  return new BillingProviderServiceError(
    'Stripe no está configurado en este entorno',
    BILLING_PROVIDER_ERROR_CODES.STRIPE_NOT_CONFIGURED,
    500,
    'stripe-no-configurado',
    BILLING_PROVIDER_STRIPE_NOT_CONFIGURED_DETAIL
  )
}

function webhookSignatureInvalid(): BillingProviderServiceError {
  return new BillingProviderServiceError(
    'Firma de webhook inválida',
    BILLING_PROVIDER_ERROR_CODES.WEBHOOK_SIGNATURE_INVALID,
    400,
    'firma-del-aviso-invalida',
    BILLING_PROVIDER_WEBHOOK_SIGNATURE_INVALID_DETAIL
  )
}

function webhookModeMismatch(): BillingProviderServiceError {
  return new BillingProviderServiceError(
    'Modo del webhook distinto al ambiente',
    BILLING_PROVIDER_ERROR_CODES.WEBHOOK_MODE_MISMATCH,
    400,
    'modo-del-aviso-no-coincide',
    BILLING_PROVIDER_WEBHOOK_MODE_MISMATCH_DETAIL
  )
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function readNestedString(record: unknown, key: string): string | null {
  if (typeof record !== 'object' || record === null) return null
  return readString((record as Record<string, unknown>)[key])
}

function resolveSubscriptionRef(objectType: string | null, dataObject: unknown): string | null {
  if (objectType === 'subscription') {
    return readNestedString(dataObject, 'id')
  }
  if (objectType === 'invoice' && typeof dataObject === 'object' && dataObject !== null) {
    const parentObj = (dataObject as Record<string, unknown>).parent
    if (typeof parentObj === 'object' && parentObj !== null) {
      const details = (parentObj as Record<string, unknown>).subscription_details
      if (typeof details === 'object' && details !== null) {
        return readNestedString(details, 'subscription')
      }
    }
  }
  return null
}

function resolveCustomerRef(dataObject: unknown): string | null {
  if (typeof dataObject !== 'object' || dataObject === null) return null
  const customer = (dataObject as Record<string, unknown>).customer
  if (typeof customer === 'string') return customer
  if (typeof customer === 'object' && customer !== null) {
    return readNestedString(customer, 'id')
  }
  return null
}

function mapStripeEventToVerified(event: Stripe.Event): VerifiedProviderEvent {
  const id = readString(event.id)
  const type = readString(event.type)
  if (!id || !id.startsWith('evt_') || id.length > 191) {
    throw webhookSignatureInvalid()
  }
  if (!type || type.length > 100) {
    throw webhookSignatureInvalid()
  }

  const dataObject = event.data?.object
  let objectId = readNestedString(dataObject, 'id')
  let objectType = readNestedString(dataObject, 'object')
  if (objectId !== null && objectId.length > 191) {
    objectId = null
  }
  if (objectType !== null && objectType.length > 50) {
    objectType = null
  }

  const objectSummary: ProviderEventObjectSummary = {
    subscriptionRef: resolveSubscriptionRef(objectType, dataObject),
    customerRef: resolveCustomerRef(dataObject),
    status: readNestedString(dataObject, 'status'),
  }

  const account = readString((event as Stripe.Event & { account?: string }).account)

  return {
    id,
    type,
    objectId,
    objectType,
    livemode: event.livemode === true,
    createdAt: typeof event.created === 'number' ? event.created : 0,
    fromConnectedAccount: account !== null && account.length > 0,
    object: objectSummary,
  }
}

/**
 * Adaptador Stripe: guardia de configuración, catálogo (USRH1790708507553) y esqueleto de cobro (7496).
 */
function setupIntentMatchesDraft(
  setupIntent: Stripe.SetupIntent,
  customerRef: string,
  signupDraftId: number
): boolean {
  const customer = setupIntent.customer
  const customerId = typeof customer === 'string' ? customer : customer?.id ?? null
  if (customerId !== customerRef) {
    return false
  }
  return setupIntent.metadata?.valanserh_signup_draft_id === String(signupDraftId)
}

export default class StripeBillingProviderAdapter
  implements
    BillingProviderPort,
    BillingCatalogProviderPort,
    BillingWebhookProviderPort,
    BillingCheckoutProviderPort,
    BillingInvoiceProviderPort
{
  readonly key = BILLING_PROVIDER_KEYS.STRIPE

  readonly #settings: StripeSettings
  readonly #createClient: StripeClientFactory
  #client: Stripe | null = null

  constructor(settings: StripeSettings, createClient: StripeClientFactory = createStripeClient) {
    this.#settings = settings
    this.#createClient = createClient
  }

  describe(): StripeProviderDescription {
    return toStripeProviderDescription(this.#settings)
  }

  async openSubscription(request: SubscriptionOpeningRequest): Promise<SubscriptionOpening> {
    this.#requireClient()
    if (request.providerSubscription) {
      return {
        provider: BILLING_PROVIDER_KEYS.STRIPE,
        externalCustomerRef: request.providerSubscription.customerRef,
        externalSubscriptionRef: request.providerSubscription.subscriptionRef,
      }
    }
    throw operationNotAvailable('openSubscription')
  }

  async admitRecordedPayment(_request: RecordedPaymentRequest): Promise<void> {
    this.#requireClient()
    throw operationNotAvailable('admitRecordedPayment')
  }

  verifyWebhookEvent(rawBody: string, signatureHeader: string | null): VerifiedProviderEvent {
    const client = this.#requireClient()
    if (this.#settings.status !== 'enabled' || this.#settings.webhookSecret === null) {
      throw stripeNotConfigured()
    }

    if (signatureHeader === null || signatureHeader.trim() === '') {
      throw webhookSignatureInvalid()
    }

    const webhookSecret = this.#settings.webhookSecret
    let event: Stripe.Event
    try {
      event = client.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret)
    } catch {
      throw webhookSignatureInvalid()
    }

    const expectedLive = this.#settings.mode === 'live'
    if (event.livemode !== expectedLive) {
      throw webhookModeMismatch()
    }

    return mapStripeEventToVerified(event)
  }

  async createCatalogProduct(draft: CatalogProductDraft): Promise<ProviderObjectRef> {
    const client = this.#requireClient()
    const params = buildStripeProductParams(draft)
    const idempotencyKey = catalogIdempotencyKey('product', draft.billingPlanId)

    try {
      const created = await client.products.create(params, { idempotencyKey })
      await client.products.update(created.id, { active: true })
      return { externalId: created.id }
    } catch (error) {
      throw this.#wrap('createCatalogProduct', error)
    }
  }

  async createCatalogPrice(draft: CatalogPriceDraft): Promise<ProviderObjectRef> {
    const client = this.#requireClient()
    const params = buildStripePriceParams(draft)
    const idempotencyKey = catalogIdempotencyKey('price', draft.billingPlanPriceId)

    try {
      const created = await client.prices.create(params, { idempotencyKey })
      await client.prices.update(created.id, { active: true })
      return { externalId: created.id }
    } catch (error) {
      throw this.#wrap('createCatalogPrice', error)
    }
  }

  async archiveCatalogProduct(externalId: string): Promise<void> {
    const client = this.#requireClient()
    try {
      await client.products.update(externalId, { active: false })
    } catch (error) {
      throw this.#wrap('archiveCatalogProduct', error)
    }
  }

  async archiveCatalogPrice(externalId: string): Promise<void> {
    const client = this.#requireClient()
    try {
      await client.prices.update(externalId, { active: false })
    } catch (error) {
      throw this.#wrap('archiveCatalogPrice', error)
    }
  }

  async readInvoice(invoiceRef: string): Promise<ProviderInvoice> {
    assertInvoiceRef(invoiceRef, 'readInvoice')
    const client = this.#requireClient()
    try {
      const invoice = await client.invoices.retrieve(invoiceRef)
      const lines = await listAllInvoiceLineItems(client, invoiceRef)
      return mapProviderInvoice(invoice, lines)
    } catch (error) {
      throw this.#wrap('readInvoice', error)
    }
  }

  async addInvoiceCharge(charge: InvoiceChargeDraft): Promise<ProviderObjectRef> {
    assertInvoiceRef(charge.invoiceRef, 'addInvoiceCharge')
    assertCustomerRef(charge.customerRef, 'addInvoiceCharge')
    const client = this.#requireClient()
    const params = buildInvoiceItemParams(charge)
    const idempotencyKey = invoiceChargeIdempotencyKey(charge.invoiceRef, charge.part)

    try {
      const item = await client.invoiceItems.create(params, { idempotencyKey })
      return { externalId: item.id }
    } catch (error) {
      throw this.#wrap('addInvoiceCharge', error)
    }
  }

  async holdInvoice(invoiceRef: string): Promise<void> {
    assertInvoiceRef(invoiceRef, 'holdInvoice')
    const client = this.#requireClient()
    try {
      await client.invoices.update(invoiceRef, { auto_advance: false })
    } catch (error) {
      throw this.#wrap('holdInvoice', error)
    }
  }

  async resumeInvoice(invoiceRef: string): Promise<void> {
    assertInvoiceRef(invoiceRef, 'resumeInvoice')
    const client = this.#requireClient()
    try {
      await client.invoices.update(invoiceRef, { auto_advance: true })
    } catch (error) {
      throw this.#wrap('resumeInvoice', error)
    }
  }

  async prepareCardSetup(request: CardSetupRequest): Promise<CardSetup> {
    const client = this.#requireClient()
    const settings = this.#settings
    if (settings.status !== 'enabled') {
      throw stripeNotConfigured()
    }
    if (settings.publishableKey === null || settings.publishableKey.trim() === '') {
      throw stripeNotConfigured()
    }
    const publishableKey = settings.publishableKey

    const signupDraftId = request.owner.signupDraftId
    let customerRef = request.customerRef

    try {
      if (customerRef === null) {
        const created = await client.customers.create(
          buildStripeCardSetupCustomerParams(request.email, signupDraftId),
          { idempotencyKey: `valanserh-signup-draft-${signupDraftId}-customer` }
        )
        customerRef = created.id
        const createdIntent = await client.setupIntents.create(
          buildStripeSetupIntentParams(customerRef, signupDraftId),
          { idempotencyKey: cardSetupIdempotencyKey(signupDraftId, null) }
        )
        const clientSecret = createdIntent.client_secret
        if (clientSecret === null || clientSecret === '') {
          throw providerRequestFailed('prepareCardSetup', {
            stripeErrorType: null,
            stripeRequestId: null,
          })
        }
        return {
          customerRef,
          setupIntentRef: createdIntent.id,
          clientSecret,
          publishableKey,
          confirmed: createdIntent.status === 'succeeded',
        }
      }

      let setupIntent: Stripe.SetupIntent | null = null
      let confirmed = false

      if (request.setupIntentRef !== null) {
        const retrieved = await client.setupIntents.retrieve(request.setupIntentRef)
        if (setupIntentMatchesDraft(retrieved, customerRef, signupDraftId)) {
          if (retrieved.status === 'succeeded') {
            setupIntent = retrieved
            confirmed = true
          } else if (REUSABLE_SETUP_INTENT_STATUSES.has(retrieved.status)) {
            setupIntent = retrieved
          }
        }
      }

      if (setupIntent === null) {
        setupIntent = await client.setupIntents.create(
          buildStripeSetupIntentParams(customerRef, signupDraftId),
          {
            idempotencyKey: cardSetupIdempotencyKey(signupDraftId, request.setupIntentRef),
          }
        )
        confirmed = setupIntent.status === 'succeeded'
      }

      const clientSecret = setupIntent.client_secret
      if (clientSecret === null || clientSecret === '') {
        throw providerRequestFailed('prepareCardSetup', {
          stripeErrorType: null,
          stripeRequestId: null,
        })
      }

      return {
        customerRef,
        setupIntentRef: setupIntent.id,
        clientSecret,
        publishableKey,
        confirmed,
      }
    } catch (error) {
      throw this.#wrap('prepareCardSetup', error)
    }
  }

  async createProviderSubscription(request: ProviderSubscriptionRequest): Promise<{
    customerRef: string
    subscriptionRef: string
    reused: boolean
  }> {
    const client = this.#requireClient()
    const signupDraftId = request.owner.signupDraftId

    try {
      const setupIntent = await client.setupIntents.retrieve(request.setupIntentRef)
      const paymentMethodId = setupIntentReadyForSubscription(
        setupIntent,
        request.customerRef,
        signupDraftId
      )
      if (paymentMethodId === null) {
        throw cardNotConfirmed()
      }

      await client.customers.update(request.customerRef, {
        invoice_settings: { default_payment_method: paymentMethodId },
      })

      const nowEpoch = Math.floor(Date.now() / 1000)
      const trialEndEpoch = Math.max(request.trialEndsAt, nowEpoch + ZERO_TRIAL_END_OFFSET_SECONDS)

      const listed = await client.subscriptions.list({
        customer: request.customerRef,
        status: 'all',
        limit: 20,
      })

      const liveForDraft = listed.data.filter(
        (sub) =>
          REUSABLE_STRIPE_SUBSCRIPTION_STATUSES.has(sub.status) &&
          subscriptionBelongsToDraft(sub, signupDraftId)
      )

      const canReuseByTrial =
        request.trialEndsAt > nowEpoch + ZERO_TRIAL_END_OFFSET_SECONDS

      if (canReuseByTrial) {
        for (const candidate of liveForDraft) {
          const priceRef = subscriptionPriceRef(candidate)
          if (priceRef === request.priceRef && candidate.trial_end === request.trialEndsAt) {
            return {
              customerRef: request.customerRef,
              subscriptionRef: candidate.id,
              reused: true,
            }
          }
        }
      }

      for (const sub of liveForDraft) {
        await client.subscriptions.cancel(
          sub.id,
          { invoice_now: false, prorate: false },
          { idempotencyKey: subscriptionCancelIdempotencyKey(sub.id) }
        )
      }

      const created = await client.subscriptions.create(
        buildStripeSubscriptionParams({
          customerRef: request.customerRef,
          priceRef: request.priceRef,
          paymentMethodRef: paymentMethodId,
          trialEndEpoch,
          signupDraftId,
          attempt: request.attempt,
        }),
        {
          idempotencyKey: subscriptionIdempotencyKey(signupDraftId, request.attempt),
        }
      )

      return {
        customerRef: request.customerRef,
        subscriptionRef: created.id,
        reused: false,
      }
    } catch (error) {
      throw this.#wrap('createProviderSubscription', error)
    }
  }

  async cancelProviderSubscription(subscriptionRef: string): Promise<void> {
    const client = this.#requireClient()
    try {
      const subscription = await client.subscriptions.retrieve(subscriptionRef)
      if (subscription.status === 'canceled' || subscription.status === 'incomplete_expired') {
        return
      }
      await client.subscriptions.cancel(
        subscriptionRef,
        { invoice_now: false, prorate: false },
        { idempotencyKey: subscriptionCancelIdempotencyKey(subscriptionRef) }
      )
    } catch (error) {
      throw this.#wrap('cancelProviderSubscription', error)
    }
  }

  /** Guardia única de configuración; la reusa USRH1790708507553. */
  #requireClient(): Stripe {
    if (this.#settings.status !== 'enabled') {
      throw stripeNotConfigured()
    }

    this.#client ??= this.#createClient(this.#settings.secretKey)

    return this.#client
  }

  #wrap(operation: string, error: unknown): BillingProviderServiceError {
    if (error instanceof BillingProviderServiceError) {
      return error
    }

    if (error instanceof Stripe.errors.StripeError) {
      logger.warn(
        {
          provider: BILLING_PROVIDER_KEYS.STRIPE,
          operation,
          stripeErrorType: error.type ?? null,
          stripeErrorCode: error.code ?? null,
          stripeRequestId: error.requestId ?? null,
          statusCode: error.statusCode ?? null,
        },
        'Cobro: Stripe rechazó la operación'
      )
      return providerRequestFailed(operation, {
        stripeErrorType: error.type ?? null,
        stripeRequestId: error.requestId ?? null,
      })
    }

    logger.warn(
      {
        provider: BILLING_PROVIDER_KEYS.STRIPE,
        operation,
        stripeErrorType: null,
        stripeErrorCode: null,
        stripeRequestId: null,
        statusCode: null,
      },
      'Cobro: Stripe rechazó la operación'
    )
    return providerRequestFailed(operation, {
      stripeErrorType: null,
      stripeRequestId: null,
    })
  }
}
