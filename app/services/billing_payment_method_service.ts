import BillingSubscription, { LIVE_SUBSCRIPTION_STATUSES } from '#models/billing_subscription'
import { BILLING_SUBSCRIPTION_ERROR_CODES } from '#constants/billing_subscription_error_codes'
import { BillingSubscriptionServiceError } from '#exceptions/billing_subscription_service_error'
import {
  BILLING_PROVIDER_KEYS,
  isBillingPaymentMethodProvider,
  type ProviderCard,
} from '#modules/billing-provider/billing_provider.port'
import { operationNotAvailable } from '#modules/billing-provider/billing_provider.errors'
import { resolveBillingProvider } from '#modules/billing-provider/billing_provider.registry'
import { TenantContext } from '../utils/tenant_context.js'

export type PaymentMethodView =
  | { managed: false }
  | { managed: true; card: ProviderCard | null }

/**
 * Consulta la tarjeta predeterminada en Stripe para la suscripción viva del tenant.
 * No persiste datos de tarjeta en Valanserh.
 */
export default class BillingPaymentMethodService {
  /**
   * Resuelve la vista de tarjeta para la empresa activa.
   *
   * @returns `managed: false` sin llamar a Stripe cuando no aplica cobro con tarjeta.
   * @throws BillingSubscriptionServiceError si no hay empresa activa.
   * @throws BillingProviderServiceError si Stripe falla o no está configurado.
   */
  async show(): Promise<PaymentMethodView> {
    const businessUnitId = TenantContext.getScope()[0]

    if (!businessUnitId || businessUnitId <= 0) {
      throw new BillingSubscriptionServiceError(
        'No se pudo resolver la empresa activa del tenant',
        BILLING_SUBSCRIPTION_ERROR_CODES.BUSINESS_UNIT_NOT_FOUND,
        500,
        'empresa-no-resuelta',
        'No se pudo determinar la empresa activa para consultar la suscripción.'
      )
    }

    const subscription = await BillingSubscription.query()
      .where('business_unit_id', businessUnitId)
      .whereIn('billing_subscription_status', LIVE_SUBSCRIPTION_STATUSES)
      .whereNull('billing_subscription_deleted_at')
      .orderBy('billing_subscription_id', 'desc')
      .first()

    if (
      subscription === null ||
      subscription.billingSubscriptionProvider !== BILLING_PROVIDER_KEYS.STRIPE
    ) {
      return { managed: false }
    }

    const customerRef = subscription.billingSubscriptionStripeCustomerId
    const subscriptionRef = subscription.billingSubscriptionStripeSubscriptionId

    if (
      typeof customerRef !== 'string' ||
      customerRef.trim() === '' ||
      typeof subscriptionRef !== 'string' ||
      subscriptionRef.trim() === ''
    ) {
      throw operationNotAvailable('readDefaultCard')
    }

    const provider = resolveBillingProvider(BILLING_PROVIDER_KEYS.STRIPE)
    if (!isBillingPaymentMethodProvider(provider)) {
      throw operationNotAvailable('readDefaultCard')
    }

    const card = await provider.readDefaultCard({
      customerRef: customerRef.trim(),
      subscriptionRef: subscriptionRef.trim(),
    })

    return {
      managed: true,
      card: card === null ? null : copyProviderCard(card),
    }
  }
}

/**
 * Copia campo a campo la lista blanca expuesta al cliente.
 *
 * @param card - Tarjeta ya normalizada por el adaptador.
 */
function copyProviderCard(card: ProviderCard): ProviderCard {
  return {
    brand: card.brand,
    last4: card.last4,
    expMonth: card.expMonth,
    expYear: card.expYear,
  }
}
