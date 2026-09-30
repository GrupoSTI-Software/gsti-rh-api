import {
  BILLING_PROVIDER_KEYS,
  type BillingProviderPort,
  type RecordedPaymentRequest,
  type SubscriptionOpening,
  type SubscriptionOpeningRequest,
} from '#modules/billing-provider/billing_provider.port'

/**
 * Cobro manual: la empresa paga por fuera y operación registra el comprobante (sin I/O externo).
 */
export default class ManualBillingProviderAdapter implements BillingProviderPort {
  readonly key = BILLING_PROVIDER_KEYS.MANUAL

  async openSubscription(_request: SubscriptionOpeningRequest): Promise<SubscriptionOpening> {
    return {
      provider: BILLING_PROVIDER_KEYS.MANUAL,
      externalCustomerRef: null,
      externalSubscriptionRef: null,
    }
  }

  async admitRecordedPayment(_request: RecordedPaymentRequest): Promise<void> {
    return undefined
  }
}
