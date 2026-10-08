import { BaseMail } from '@adonisjs/mail'
import env from '#start/env'

export interface BillingProviderInvoiceHeldMailParams {
  to: string[]
  from: string
  tradeName: string
  invoiceRef: string
  subscriptionRef: string | null
  eventRef: string
  errorCode: string
  billingSubscriptionId: number | null
}

const DEFAULT_SIDEBAR_COLOR = '#0a3057'

/**
 * Aviso interno: factura de Stripe retenida tras fallo al ajustar el ciclo (USRH1790708507665).
 */
export default class BillingProviderInvoiceHeldMail extends BaseMail {
  constructor(private readonly params: BillingProviderInvoiceHeldMailParams) {
    super()
  }

  prepare() {
    const {
      to,
      from,
      tradeName,
      invoiceRef,
      subscriptionRef,
      eventRef,
      errorCode,
      billingSubscriptionId,
    } = this.params

    const environment = env.get('NODE_ENV')
    const environmentTag = environment === 'production' ? '' : `[${environment.toUpperCase()}] `
    const subject = `${environmentTag}[Factura retenida] Revisión en Stripe`

    for (const recipient of to) {
      this.message.to(recipient)
    }

    this.message.from(from, tradeName).subject(subject)

    this.message.htmlView('emails/billing_provider_invoice_held', {
      subject,
      tradeName,
      sidebarColor: DEFAULT_SIDEBAR_COLOR,
      invoiceRef,
      subscriptionRef: subscriptionRef ?? '—',
      eventRef,
      errorCode,
      billingSubscriptionId: billingSubscriptionId ?? '—',
    })
  }
}
