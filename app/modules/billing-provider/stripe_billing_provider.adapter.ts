import Stripe from 'stripe'
import logger from '@adonisjs/core/services/logger'
import {
  BILLING_PROVIDER_ERROR_CODES,
  BILLING_PROVIDER_STRIPE_NOT_CONFIGURED_DETAIL,
  BILLING_PROVIDER_WEBHOOK_MODE_MISMATCH_DETAIL,
  BILLING_PROVIDER_WEBHOOK_SIGNATURE_INVALID_DETAIL,
} from '#constants/billing_provider_error_codes'
import { BillingProviderServiceError } from '#exceptions/billing_provider_service_error'
import { operationNotAvailable, providerRequestFailed } from '#modules/billing-provider/billing_provider.errors'
import {
  BILLING_PROVIDER_KEYS,
  type BillingCatalogProviderPort,
  type BillingProviderPort,
  type BillingWebhookProviderPort,
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
export default class StripeBillingProviderAdapter
  implements BillingProviderPort, BillingCatalogProviderPort, BillingWebhookProviderPort
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

  async openSubscription(_request: SubscriptionOpeningRequest): Promise<SubscriptionOpening> {
    this.#requireClient()
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
