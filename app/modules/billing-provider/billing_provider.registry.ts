import {
  BILLING_PROVIDER_ADAPTER_NOT_REGISTERED_DETAIL,
  BILLING_PROVIDER_ERROR_CODES,
} from '#constants/billing_provider_error_codes'
import { BillingProviderServiceError } from '#exceptions/billing_provider_service_error'
import {
  isBillingProviderKey,
  type BillingProviderKey,
  type BillingProviderPort,
} from '#modules/billing-provider/billing_provider.port'
import ManualBillingProviderAdapter from '#modules/billing-provider/manual_billing_provider.adapter'
import StripeBillingProviderAdapter from '#modules/billing-provider/stripe_billing_provider.adapter'
import {
  readStripeRawSettings,
  resolveStripeSettings,
} from '#modules/billing-provider/stripe_billing_provider.config'

class BillingProviderRegistry {
  private readonly adapters = new Map<BillingProviderKey, BillingProviderPort>()

  /** Registra o reemplaza el adaptador de su clave; devuelve la función que restaura el anterior. */
  register(adapter: BillingProviderPort): () => void {
    const previous = this.adapters.get(adapter.key)
    this.adapters.set(adapter.key, adapter)
    return () => {
      if (previous === undefined) {
        this.adapters.delete(adapter.key)
      } else {
        this.adapters.set(adapter.key, previous)
      }
    }
  }

  /** Sin normalizar. Clave no válida o sin adaptador → PLT.PRV.ADAPTER_NOT_REGISTERED. */
  resolve(key: string): BillingProviderPort {
    if (!isBillingProviderKey(key)) {
      throw adapterNotRegisteredError(key)
    }

    const adapter = this.adapters.get(key)
    if (!adapter) {
      throw adapterNotRegisteredError(key)
    }

    return adapter
  }
}

function adapterNotRegisteredError(key: string): BillingProviderServiceError {
  return new BillingProviderServiceError(
    `Proveedor de cobro sin adaptador: ${key}`,
    BILLING_PROVIDER_ERROR_CODES.ADAPTER_NOT_REGISTERED,
    500,
    'proveedor-de-cobro-no-soportado',
    BILLING_PROVIDER_ADAPTER_NOT_REGISTERED_DETAIL
  )
}

export const stripeBillingProvider = new StripeBillingProviderAdapter(
  resolveStripeSettings(readStripeRawSettings())
)

export const billingProviderRegistry = new BillingProviderRegistry()
billingProviderRegistry.register(new ManualBillingProviderAdapter())
billingProviderRegistry.register(stripeBillingProvider)

export function resolveBillingProvider(key: string): BillingProviderPort {
  return billingProviderRegistry.resolve(key)
}
