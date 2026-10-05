import { BaseMail } from '@adonisjs/mail'
import env from '#start/env'

export interface BillingProviderCompensationFailedMailParams {
  to: string[]
  from: string
  tradeName: string
  signupDraftId: number
  attempt: number
  stripeCustomerId: string
  stripeSubscriptionId: string
  errorCode: string
}

const DEFAULT_SIDEBAR_COLOR = '#0a3057'

/**
 * Aviso interno cuando no se pudo cancelar una suscripción Stripe tras fallar el alta (USRH1790708507607).
 */
export default class BillingProviderCompensationFailedMail extends BaseMail {
  constructor(private readonly params: BillingProviderCompensationFailedMailParams) {
    super()
  }

  prepare() {
    const {
      to,
      from,
      tradeName,
      signupDraftId,
      attempt,
      stripeCustomerId,
      stripeSubscriptionId,
      errorCode,
    } = this.params

    const environment = env.get('NODE_ENV')
    const environmentTag = environment === 'production' ? '' : `[${environment.toUpperCase()}] `
    const subject = `${environmentTag}[Stripe] Suscripción sin compensar`

    for (const recipient of to) {
      this.message.to(recipient)
    }

    this.message.from(from, tradeName).subject(subject)

    this.message.htmlView('emails/billing_provider_compensation_failed', {
      subject,
      tradeName,
      sidebarColor: DEFAULT_SIDEBAR_COLOR,
      signupDraftId,
      attempt,
      stripeCustomerId,
      stripeSubscriptionId,
      errorCode,
    })
  }
}
