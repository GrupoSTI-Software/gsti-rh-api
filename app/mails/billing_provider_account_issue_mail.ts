import { BaseMail } from '@adonisjs/mail'
import env from '#start/env'
import type { StripeErrorEntryKey } from '#constants/billing_stripe_error_catalog'
import { BILLING_STRIPE_ERROR_ENTRIES } from '#constants/billing_stripe_error_catalog'

export interface BillingProviderAccountIssueMailParams {
  to: string[]
  from: string
  tradeName: string
  billingSubscriptionId: number
  businessUnitTradeName: string
  invoiceRef: string
  eventRef: string
  failedAtIso: string
  code: string | null
  declineCode: string | null
  catalogKey: StripeErrorEntryKey
  resolvedByStripeSupport: boolean
  landlordSubscriptionUrl: string
}

const DEFAULT_SIDEBAR_COLOR = '#0a3057'

export default class BillingProviderAccountIssueMail extends BaseMail {
  constructor(private readonly params: BillingProviderAccountIssueMailParams) {
    super()
  }

  prepare() {
    const {
      to,
      from,
      tradeName,
      billingSubscriptionId,
      businessUnitTradeName,
      invoiceRef,
      eventRef,
      failedAtIso,
      code,
      declineCode,
      catalogKey,
      resolvedByStripeSupport,
      landlordSubscriptionUrl,
    } = this.params

    const environment = env.get('NODE_ENV')
    const environmentTag = environment === 'production' ? '' : `[${environment.toUpperCase()}] `
    const entryTitle = BILLING_STRIPE_ERROR_ENTRIES[catalogKey]?.title ?? 'Problema de cobro'
    const subject = `${environmentTag}[Cuenta de Stripe] Suscripción #${billingSubscriptionId} — ${entryTitle}`

    for (const recipient of to) {
      this.message.to(recipient)
    }

    this.message.from(from, tradeName).subject(subject)

    this.message.htmlView('emails/billing_provider_account_issue', {
      tradeName,
      sidebarColor: DEFAULT_SIDEBAR_COLOR,
      subject,
      billingSubscriptionId,
      businessUnitTradeName,
      invoiceRef,
      eventRef,
      failedAtIso,
      code,
      declineCode,
      catalogKey,
      entryTitle,
      resolvedByStripeSupport,
      landlordSubscriptionUrl,
    })
  }
}
