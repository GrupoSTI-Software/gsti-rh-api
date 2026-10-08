import { BaseMail } from '@adonisjs/mail'
import env from '#start/env'
import type { BillingSubscriptionStatus } from '#models/billing_subscription'
import type { ProviderSubscriptionStatus } from '#modules/billing-provider/billing_provider.port'
export type ProviderSubscriptionStateAlert = 'unexpected-status' | 'local-canceled'

export interface BillingProviderSubscriptionStateMailParams {
  to: string[]
  from: string
  tradeName: string
  billingSubscriptionId: number
  businessUnitId: number
  subscriptionRef: string
  eventRef: string
  providerStatus: ProviderSubscriptionStatus
  localStatus: BillingSubscriptionStatus
  alert: ProviderSubscriptionStateAlert
}

const DEFAULT_SIDEBAR_COLOR = '#0a3057'

export const PROVIDER_SUBSCRIPTION_STATE_ALERT_LABELS: Record<
  ProviderSubscriptionStateAlert,
  string
> = {
  'local-canceled': 'Suscripción cancelada localmente',
  'unexpected-status': 'Estado inesperado en Stripe',
}

export default class BillingProviderSubscriptionStateMail extends BaseMail {
  constructor(private readonly params: BillingProviderSubscriptionStateMailParams) {
    super()
  }

  prepare() {
    const {
      to,
      from,
      tradeName,
      billingSubscriptionId,
      subscriptionRef,
      eventRef,
      providerStatus,
      localStatus,
      alert,
    } = this.params

    const environment = env.get('NODE_ENV')
    const environmentTag = environment === 'production' ? '' : `[${environment.toUpperCase()}] `
    const alertLabel = PROVIDER_SUBSCRIPTION_STATE_ALERT_LABELS[alert]
    const subject = `${environmentTag}[Estado de Stripe] Suscripción #${billingSubscriptionId} — ${alertLabel}`

    for (const recipient of to) {
      this.message.to(recipient)
    }

    this.message.from(from, tradeName).subject(subject)

    this.message.htmlView('emails/billing_provider_subscription_state', {
      tradeName,
      sidebarColor: DEFAULT_SIDEBAR_COLOR,
      subject,
      billingSubscriptionId,
      subscriptionRef,
      eventRef,
      providerStatus,
      localStatus,
      alert,
      alertLabel,
    })
  }
}
