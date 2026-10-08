import { BaseMail } from '@adonisjs/mail'
import env from '#start/env'

export type ProviderPaymentUnsettledReason =
  | 'zero-amount-cycle'
  | 'not-cycle'
  | 'paid-off-stripe'
  | 'subscription-not-found'
  | 'not-subscription-invoice'
  | 'subscription-canceled'
  | 'currency-mismatch'
  | 'amount-out-of-range'
  | 'already-settled-elsewhere'
  | 'settlement-failed'

export interface BillingProviderPaymentUnsettledMailParams {
  to: string[]
  from: string
  tradeName: string
  invoiceRef: string
  subscriptionRef: string | null
  eventRef: string
  reason: ProviderPaymentUnsettledReason
  errorCode: string | null
  billingSubscriptionId: number | null
  amountPaidCents: number | null
  currency: string | null
}

const DEFAULT_SIDEBAR_COLOR = '#0a3057'

export const PROVIDER_PAYMENT_UNSETTLED_REASON_LABELS: Record<
  ProviderPaymentUnsettledReason,
  string
> = {
  'zero-amount-cycle': 'Factura de ciclo con monto cero.',
  'not-cycle': 'La factura no corresponde a un ciclo de suscripción.',
  'paid-off-stripe': 'La factura fue marcada como pagada fuera de Stripe.',
  'subscription-not-found': 'No hay suscripción local ligada a la factura.',
  'not-subscription-invoice': 'La factura no está ligada a una suscripción.',
  'subscription-canceled': 'La suscripción local está cancelada.',
  'currency-mismatch': 'La moneda de la factura no coincide con el trato.',
  'amount-out-of-range': 'El monto cobrado está fuera del rango esperado.',
  'already-settled-elsewhere': 'La factura ya quedó referida en otro pago.',
  'settlement-failed': 'Falló el asentamiento del pago en Valanserh.',
}

/**
 * Aviso interno: cobro Stripe sin asiento (USRH1790724549115).
 */
export default class BillingProviderPaymentUnsettledMail extends BaseMail {
  constructor(private readonly params: BillingProviderPaymentUnsettledMailParams) {
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
      reason,
      errorCode,
      billingSubscriptionId,
      amountPaidCents,
      currency,
    } = this.params

    const environment = env.get('NODE_ENV')
    const environmentTag = environment === 'production' ? '' : `[${environment.toUpperCase()}] `
    const subject = `${environmentTag}[Cobro sin asiento] Revisión en consola de plataforma`

    for (const recipient of to) {
      this.message.to(recipient)
    }

    this.message.from(from, tradeName).subject(subject)

    const reasonLabel = PROVIDER_PAYMENT_UNSETTLED_REASON_LABELS[reason]
    const showRefundAction = reason === 'subscription-canceled'

    this.message.htmlView('emails/billing_provider_payment_unsettled', {
      subject,
      tradeName,
      sidebarColor: DEFAULT_SIDEBAR_COLOR,
      invoiceRef,
      subscriptionRef: subscriptionRef ?? '—',
      eventRef,
      reasonLabel,
      errorCode: errorCode ?? '—',
      billingSubscriptionId: billingSubscriptionId ?? '—',
      amountPaidCents: amountPaidCents ?? '—',
      currency: currency ?? '—',
      showRefundAction,
    })
  }
}
