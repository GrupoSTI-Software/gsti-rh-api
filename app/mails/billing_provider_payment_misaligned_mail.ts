import { BaseMail } from '@adonisjs/mail'
import env from '#start/env'
import type { ProviderSettlementPeriod } from '#services/billing_payment_service'

export interface BillingProviderPaymentMisalignedMailParams {
  to: string[]
  from: string
  tradeName: string
  billingSubscriptionId: number
  billingPaymentId: number
  invoiceRef: string
  eventRef: string
  amountPaidCents: number
  periodsCovered: number
  debtAppliedCents: number
  invoiceDebtCents: number
  providerPeriod: ProviderSettlementPeriod | null
  providerPeriodApplied: boolean
}

const DEFAULT_SIDEBAR_COLOR = '#0a3057'

/**
 * Aviso interno: pago con tarjeta asentado pero desalineado con la factura (USRH1790724549115).
 */
export default class BillingProviderPaymentMisalignedMail extends BaseMail {
  constructor(private readonly params: BillingProviderPaymentMisalignedMailParams) {
    super()
  }

  prepare() {
    const {
      to,
      from,
      tradeName,
      billingSubscriptionId,
      billingPaymentId,
      invoiceRef,
      eventRef,
      amountPaidCents,
      periodsCovered,
      debtAppliedCents,
      invoiceDebtCents,
      providerPeriod,
      providerPeriodApplied,
    } = this.params

    const environment = env.get('NODE_ENV')
    const environmentTag = environment === 'production' ? '' : `[${environment.toUpperCase()}] `
    const subject = `${environmentTag}[Pago desalineado] Revisión en consola de plataforma`

    for (const recipient of to) {
      this.message.to(recipient)
    }

    this.message.from(from, tradeName).subject(subject)

    const providerPeriodLabel =
      providerPeriod === null ? '—' : `${providerPeriod.start} → ${providerPeriod.end}`

    this.message.htmlView('emails/billing_provider_payment_misaligned', {
      subject,
      tradeName,
      sidebarColor: DEFAULT_SIDEBAR_COLOR,
      billingSubscriptionId,
      billingPaymentId,
      invoiceRef,
      eventRef,
      amountPaidCents,
      periodsCovered,
      debtAppliedCents,
      invoiceDebtCents,
      providerPeriodLabel,
      providerPeriodApplied: providerPeriodApplied ? 'Sí' : 'No',
    })
  }
}
