import type { BillingPaymentMethod } from '#models/billing_payment'

export const BILLING_PROVIDER_KEYS = {
  MANUAL: 'manual',
  STRIPE: 'stripe',
} as const

export type BillingProviderKey = (typeof BILLING_PROVIDER_KEYS)[keyof typeof BILLING_PROVIDER_KEYS]

const BILLING_PROVIDER_KEY_SET: ReadonlySet<string> = new Set(Object.values(BILLING_PROVIDER_KEYS))

/** Coincidencia exacta con una clave conocida; sin trim ni cambio de casing. */
export function isBillingProviderKey(value: string): value is BillingProviderKey {
  return BILLING_PROVIDER_KEY_SET.has(value)
}

export interface SubscriptionOpeningRequest {
  businessUnitId: number
  billingPlanId: number
  billingPlanPriceId: number
  contractedEmployees: number
}

export interface SubscriptionOpening {
  provider: BillingProviderKey
  externalCustomerRef: string | null
  externalSubscriptionRef: string | null
}

export interface RecordedPaymentRequest {
  billingSubscriptionId: number
  method: BillingPaymentMethod
}

/**
 * Valanserh decide CUÁNTO; el proveedor decide CUÁNDO. Ningún tipo de SDK cruza esta interfaz.
 */
export interface BillingProviderPort {
  readonly key: BillingProviderKey
  openSubscription(request: SubscriptionOpeningRequest): Promise<SubscriptionOpening>
  /** Lanza BillingProviderServiceError si el proveedor no admite pagos capturados por operación. */
  admitRecordedPayment(request: RecordedPaymentRequest): Promise<void>
}

export interface CatalogProductDraft {
  billingPlanId: number
  name: string
}

export interface CatalogPriceDraft {
  productRef: string
  billingPlanId: number
  billingPlanPriceId: number
  currency: string
  unitAmountCents: 0
  intervalMonths: 1
}

export interface ProviderObjectRef {
  externalId: string
}

/** Operaciones de catálogo en Stripe (USRH1790708507553); interfaz aparte del alta de suscripción. */
export interface BillingCatalogProviderPort {
  createCatalogProduct(draft: CatalogProductDraft): Promise<ProviderObjectRef>
  createCatalogPrice(draft: CatalogPriceDraft): Promise<ProviderObjectRef>
  archiveCatalogProduct(externalId: string): Promise<void>
  archiveCatalogPrice(externalId: string): Promise<void>
}

export function isBillingCatalogProvider(
  provider: BillingProviderPort
): provider is BillingProviderPort & BillingCatalogProviderPort {
  const candidate = provider as unknown as BillingCatalogProviderPort
  return (
    typeof candidate.createCatalogProduct === 'function' &&
    typeof candidate.createCatalogPrice === 'function'
  )
}

/** Resumen del objeto del evento: sin payload ni PII (USRH1790708507579). */
export interface ProviderEventObjectSummary {
  subscriptionRef: string | null
  customerRef: string | null
  status: string | null
}

export interface VerifiedProviderEvent {
  id: string
  type: string
  objectId: string | null
  objectType: string | null
  livemode: boolean
  createdAt: number
  fromConnectedAccount: boolean
  object: ProviderEventObjectSummary
}

/** Verificación síncrona de webhooks; sin red. */
export interface BillingWebhookProviderPort {
  verifyWebhookEvent(rawBody: string, signatureHeader: string | null): VerifiedProviderEvent
}

export function isBillingWebhookProvider(
  provider: BillingProviderPort
): provider is BillingProviderPort & BillingWebhookProviderPort {
  const candidate = provider as unknown as BillingWebhookProviderPort
  return typeof candidate.verifyWebhookEvent === 'function'
}
