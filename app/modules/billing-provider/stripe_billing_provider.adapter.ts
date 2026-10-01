import Stripe from 'stripe'
import {
  BILLING_PROVIDER_ERROR_CODES,
  BILLING_PROVIDER_OPERATION_NOT_AVAILABLE_DETAIL,
  BILLING_PROVIDER_STRIPE_NOT_CONFIGURED_DETAIL,
} from '#constants/billing_provider_error_codes'
import { BillingProviderServiceError } from '#exceptions/billing_provider_service_error'
import {
  BILLING_PROVIDER_KEYS,
  type BillingProviderPort,
  type RecordedPaymentRequest,
  type SubscriptionOpening,
  type SubscriptionOpeningRequest,
} from '#modules/billing-provider/billing_provider.port'
import type { StripeProviderDescription, StripeSettings } from '#modules/billing-provider/stripe_billing_provider.config'
import { toStripeProviderDescription } from '#modules/billing-provider/stripe_billing_provider.config'

export const STRIPE_API_VERSION = '2026-08-26.dahlia' as const

function stripeNotConfigured(): BillingProviderServiceError {
  return new BillingProviderServiceError(
    'Stripe no está configurado en este entorno',
    BILLING_PROVIDER_ERROR_CODES.STRIPE_NOT_CONFIGURED,
    500,
    'stripe-no-configurado',
    BILLING_PROVIDER_STRIPE_NOT_CONFIGURED_DETAIL
  )
}

function operationNotAvailable(operation: string): BillingProviderServiceError {
  return new BillingProviderServiceError(
    `Operación de cobro no disponible: ${operation}`,
    BILLING_PROVIDER_ERROR_CODES.OPERATION_NOT_AVAILABLE,
    500,
    'operacion-de-cobro-no-disponible',
    BILLING_PROVIDER_OPERATION_NOT_AVAILABLE_DETAIL
  )
}

/**
 * Adaptador esqueleto de Stripe (USRH1790708507496): guardia de configuración y cliente
 * perezoso; las operaciones responden hasta las historias de catálogo y cobro.
 */
export default class StripeBillingProviderAdapter implements BillingProviderPort {
  readonly key = BILLING_PROVIDER_KEYS.STRIPE

  readonly #settings: StripeSettings
  #client: Stripe | null = null

  constructor(settings: StripeSettings) {
    this.#settings = settings
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

  /** Guardia única de configuración; la reusa USRH1790708507553. */
  #requireClient(): Stripe {
    if (this.#settings.status !== 'enabled') {
      throw stripeNotConfigured()
    }

    this.#client ??= new Stripe(this.#settings.secretKey, {
      apiVersion: STRIPE_API_VERSION,
      timeout: 20_000,
      maxNetworkRetries: 2,
      appInfo: { name: 'valanserh-api' },
    })

    return this.#client
  }
}
