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
  /** Referencias ya creadas fuera de la trx; solo el registro con precio stripe. */
  providerSubscription?: { customerRef: string; subscriptionRef: string }
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

export type CardSetupOwner = { kind: 'signup_draft'; signupDraftId: number }

export interface CardSetupRequest {
  owner: CardSetupOwner
  email: string
  customerRef: string | null
  setupIntentRef: string | null
}

export interface CardSetup {
  customerRef: string
  setupIntentRef: string
  clientSecret: string
  publishableKey: string
  confirmed: boolean
}

export interface ProviderSubscriptionRequest {
  owner: CardSetupOwner
  customerRef: string
  setupIntentRef: string
  priceRef: string
  /** Epoch en segundos de la medianoche CDMX que guardará la fila local. */
  trialEndsAt: number
  attempt: number
}

export interface ProviderSubscription {
  customerRef: string
  subscriptionRef: string
  reused: boolean
}

/** Preparación de tarjeta y suscripción en checkout (registro). */
export interface BillingCheckoutProviderPort {
  prepareCardSetup(request: CardSetupRequest): Promise<CardSetup>
  createProviderSubscription(request: ProviderSubscriptionRequest): Promise<ProviderSubscription>
  cancelProviderSubscription(subscriptionRef: string): Promise<void>
}

export function isBillingCheckoutProvider(
  provider: BillingProviderPort
): provider is BillingProviderPort & BillingCheckoutProviderPort {
  const candidate = provider as unknown as BillingCheckoutProviderPort
  return (
    typeof candidate.prepareCardSetup === 'function' &&
    typeof candidate.createProviderSubscription === 'function' &&
    typeof candidate.cancelProviderSubscription === 'function'
  )
}

export type ProviderInvoiceStatus = 'draft' | 'open' | 'paid' | 'uncollectible' | 'void'

export type ValanserhInvoicePart = 'period' | 'increase_debt'

export interface ProviderInvoiceLine {
  lineRef: string
  amountCents: number
  source: 'subscription_item' | 'invoice_item' | 'other'
  priceRef: string | null
  periodStart: number
  periodEnd: number
  proration: boolean
  valanserhPart: ValanserhInvoicePart | null
}

export interface ReadInvoiceOptions {
  includePayments?: boolean
}

export interface ProviderInvoice {
  invoiceRef: string
  status: ProviderInvoiceStatus | null
  billingReason: string | null
  subscriptionRef: string | null
  customerRef: string
  currency: string
  totalCents: number
  autoAdvance: boolean
  lines: ProviderInvoiceLine[]
  /** Presentes solo con `readInvoice(..., { includePayments: true })` (USRH1790724549115). */
  amountPaidCents?: number
  paidAt?: number | null
  paymentIntentRef?: string | null
  amountPaidOffStripeCents?: number
}

export interface InvoiceChargeDraft {
  invoiceRef: string
  customerRef: string
  billingSubscriptionId: number
  part: ValanserhInvoicePart
  amountCents: number
  currency: string
  description: string
}

/** Lectura y ajuste de facturas en borrador en Stripe (USRH1790718243208). */
export interface BillingInvoiceProviderPort {
  readInvoice(invoiceRef: string, options?: ReadInvoiceOptions): Promise<ProviderInvoice>
  addInvoiceCharge(charge: InvoiceChargeDraft): Promise<ProviderObjectRef>
  holdInvoice(invoiceRef: string): Promise<void>
  resumeInvoice(invoiceRef: string): Promise<void>
}

export function isBillingInvoiceProvider(
  provider: BillingProviderPort
): provider is BillingProviderPort & BillingInvoiceProviderPort {
  const candidate = provider as Partial<BillingInvoiceProviderPort>
  return (
    typeof candidate.readInvoice === 'function' &&
    typeof candidate.addInvoiceCharge === 'function' &&
    typeof candidate.holdInvoice === 'function' &&
    typeof candidate.resumeInvoice === 'function'
  )
}
