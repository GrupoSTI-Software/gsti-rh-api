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
