import db from '@adonisjs/lucid/services/db'
import BillingSubscription, { LIVE_SUBSCRIPTION_STATUSES } from '#models/billing_subscription'
import { BILLING_SUBSCRIPTION_ERROR_CODES } from '#constants/billing_subscription_error_codes'
import { BillingSubscriptionServiceError } from '#exceptions/billing_subscription_service_error'
import {
  automaticBillingNotActiveError,
  noLiveSubscriptionError,
} from '../helpers/billing_tenant_error.js'
import {
  BILLING_PROVIDER_KEYS,
  isBillingCheckoutProvider,
  isBillingPaymentMethodProvider,
  type ProviderCard,
} from '#modules/billing-provider/billing_provider.port'
import { operationNotAvailable, paymentMethodNotConfirmed } from '#modules/billing-provider/billing_provider.errors'
import { resolveBillingProvider } from '#modules/billing-provider/billing_provider.registry'
import { TenantContext } from '../utils/tenant_context.js'

export type PaymentMethodView =
  | { managed: false }
  | { managed: true; card: ProviderCard | null }

export type PaymentMethodSetupKeys = {
  clientSecret: string
  publishableKey: string
}

/**
 * Lectura y escritura de tarjeta predeterminada en Stripe para Mi suscripción.
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
    const businessUnitId = this.resolveBusinessUnitId()

    const subscription = await this.findLiveSubscription(businessUnitId)

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

  /**
   * Prepara un SetupIntent para capturar o cambiar la tarjeta (USRH1790708507752).
   *
   * @throws BillingSubscriptionServiceError si no hay cobro automático o suscripción viva.
   * @throws BillingProviderServiceError si Stripe falla o no está configurado.
   */
  async prepareSetup(): Promise<PaymentMethodSetupKeys> {
    const businessUnitId = this.resolveBusinessUnitId()
    const subscription = await this.requireAutomaticStripeSubscription(businessUnitId)

    const customerRef = subscription.billingSubscriptionStripeCustomerId!.trim()
    const subscriptionRef = subscription.billingSubscriptionStripeSubscriptionId
    if (typeof subscriptionRef !== 'string' || subscriptionRef.trim() === '') {
      throw operationNotAvailable('prepareCardSetup')
    }

    const checkout = resolveBillingProvider(BILLING_PROVIDER_KEYS.STRIPE)
    if (!isBillingCheckoutProvider(checkout)) {
      throw operationNotAvailable('prepareCardSetup')
    }

    const owner = {
      kind: 'billing_subscription' as const,
      billingSubscriptionId: subscription.billingSubscriptionId,
    }

    let setupIntentRef = subscription.billingSubscriptionStripeSetupIntentId

    for (let attempt = 0; attempt < 2; attempt++) {
      const setup = await checkout.prepareCardSetup({
        owner,
        customerRef,
        setupIntentRef,
      })

      const previousSetupIntent = setupIntentRef
      setupIntentRef = setup.setupIntentRef

      const persisted = await this.persistSetupIntentRef({
        billingSubscriptionId: subscription.billingSubscriptionId,
        businessUnitId,
        previousSetupIntent,
        setupIntentRef: setup.setupIntentRef,
      })

      if (!persisted) {
        const reloaded = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)
        setupIntentRef = reloaded.billingSubscriptionStripeSetupIntentId
        continue
      }

      return {
        clientSecret: setup.clientSecret,
        publishableKey: setup.publishableKey,
      }
    }

    throw new BillingSubscriptionServiceError(
      'No se pudo reservar la autorización para cambiar la tarjeta',
      BILLING_SUBSCRIPTION_ERROR_CODES.SYS_UNHANDLED,
      500,
      'autorizacion-tarjeta-no-reservada',
      'No se pudo preparar el formulario de tarjeta. Intenta de nuevo.'
    )
  }

  /**
   * Fija la tarjeta confirmada en Stripe como predeterminada (USRH1790708507752).
   *
   * @param setupIntentId - Identificador del SetupIntent en curso de la empresa.
   * @throws BillingProviderServiceError si el intent no coincide o Stripe rechaza.
   */
  async setDefault(setupIntentId: string): Promise<PaymentMethodView> {
    const businessUnitId = this.resolveBusinessUnitId()
    const subscription = await this.requireAutomaticStripeSubscription(businessUnitId)

    const storedSetupIntent = subscription.billingSubscriptionStripeSetupIntentId
    const normalizedSetupIntentId = setupIntentId.trim()

    if (
      storedSetupIntent === null ||
      storedSetupIntent.trim() === '' ||
      storedSetupIntent.trim() !== normalizedSetupIntentId
    ) {
      throw paymentMethodNotConfirmed()
    }

    const customerRef = subscription.billingSubscriptionStripeCustomerId!.trim()
    const subscriptionRef = subscription.billingSubscriptionStripeSubscriptionId
    if (typeof subscriptionRef !== 'string' || subscriptionRef.trim() === '') {
      throw operationNotAvailable('setDefaultPaymentMethod')
    }

    const provider = resolveBillingProvider(BILLING_PROVIDER_KEYS.STRIPE)
    if (!isBillingPaymentMethodProvider(provider)) {
      throw operationNotAvailable('setDefaultPaymentMethod')
    }

    const card = await provider.setDefaultPaymentMethod({
      owner: {
        kind: 'billing_subscription',
        billingSubscriptionId: subscription.billingSubscriptionId,
      },
      customerRef,
      subscriptionRef: subscriptionRef.trim(),
      setupIntentRef: normalizedSetupIntentId,
    })

    return {
      managed: true,
      card: copyProviderCard(card),
    }
  }

  /**
   * @throws BillingSubscriptionServiceError si el tenant no está resuelto.
   */
  private resolveBusinessUnitId(): number {
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

    return businessUnitId
  }

  private async findLiveSubscription(businessUnitId: number): Promise<BillingSubscription | null> {
    return BillingSubscription.query()
      .where('business_unit_id', businessUnitId)
      .whereIn('billing_subscription_status', LIVE_SUBSCRIPTION_STATUSES)
      .whereNull('billing_subscription_deleted_at')
      .orderBy('billing_subscription_id', 'desc')
      .first()
  }

  /**
   * @throws BillingSubscriptionServiceError si no hay suscripción viva con cobro automático.
   */
  private async requireAutomaticStripeSubscription(
    businessUnitId: number
  ): Promise<BillingSubscription> {
    const subscription = await this.findLiveSubscription(businessUnitId)

    if (subscription === null) {
      throw noLiveSubscriptionError()
    }

    if (subscription.billingSubscriptionProvider !== BILLING_PROVIDER_KEYS.STRIPE) {
      throw automaticBillingNotActiveError()
    }

    const customerRef = subscription.billingSubscriptionStripeCustomerId
    if (typeof customerRef !== 'string' || customerRef.trim() === '') {
      throw automaticBillingNotActiveError()
    }

    return subscription
  }

  /**
   * Reserva el SetupIntent en curso con escritura condicional (máx. dos pasadas).
   */
  private async persistSetupIntentRef(params: {
    billingSubscriptionId: number
    businessUnitId: number
    previousSetupIntent: string | null
    setupIntentRef: string
  }): Promise<boolean> {
    const query = db
      .from('billing_subscriptions')
      .where('billing_subscription_id', params.billingSubscriptionId)
      .where('business_unit_id', params.businessUnitId)
      .whereIn('billing_subscription_status', LIVE_SUBSCRIPTION_STATUSES)
      .whereNull('billing_subscription_deleted_at')
      .where((builder) => {
        if (params.previousSetupIntent === null) {
          builder.whereNull('billing_subscription_stripe_setup_intent_id')
        } else {
          builder.where('billing_subscription_stripe_setup_intent_id', params.previousSetupIntent)
        }
        builder.orWhere('billing_subscription_stripe_setup_intent_id', params.setupIntentRef)
      })

    const updated = await query.update({
      billing_subscription_stripe_setup_intent_id: params.setupIntentRef,
    })

    return Number(updated) > 0
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
