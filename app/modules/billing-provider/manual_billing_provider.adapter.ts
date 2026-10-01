import { operationNotAvailable } from '#modules/billing-provider/billing_provider.errors'
import {
  BILLING_PROVIDER_KEYS,
  type BillingCatalogProviderPort,
  type BillingProviderPort,
  type CatalogPriceDraft,
  type CatalogProductDraft,
  type ProviderObjectRef,
  type RecordedPaymentRequest,
  type SubscriptionOpening,
  type SubscriptionOpeningRequest,
} from '#modules/billing-provider/billing_provider.port'

/**
 * Cobro manual: la empresa paga por fuera y operación registra el comprobante (sin I/O externo).
 */
export default class ManualBillingProviderAdapter
  implements BillingProviderPort, BillingCatalogProviderPort
{
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

  async createCatalogProduct(_draft: CatalogProductDraft): Promise<ProviderObjectRef> {
    throw operationNotAvailable('createCatalogProduct')
  }

  async createCatalogPrice(_draft: CatalogPriceDraft): Promise<ProviderObjectRef> {
    throw operationNotAvailable('createCatalogPrice')
  }

  async archiveCatalogProduct(_externalId: string): Promise<void> {
    throw operationNotAvailable('archiveCatalogProduct')
  }

  async archiveCatalogPrice(_externalId: string): Promise<void> {
    throw operationNotAvailable('archiveCatalogPrice')
  }
}
