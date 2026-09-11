import { BaseMail } from '@adonisjs/mail'
import env from '#start/env'
import type { ApplyIncreaseNotApplicableReason } from '#services/billing_subscription_change_service'

export interface SubscriptionChangeNotApplicableMailParams {
  to: string[]
  from: string
  tradeName: string
  businessUnitName: string
  billingPlanName: string
  billingSubscriptionId: number
  billingSubscriptionChangeId: number
  billingPaymentId: number
  amountCents: number
  currency: string
  previousEmployees: number
  newEmployees: number
  proratedAmountCents: number
  reason: ApplyIncreaseNotApplicableReason
}

const DEFAULT_SIDEBAR_COLOR = '#0a3057'

const REASON_LABELS: Record<ApplyIncreaseNotApplicableReason, string> = {
  'base-de-cantidad-desfasada':
    'La cantidad contratada actual ya no coincide con la base congelada al solicitar el aumento.',
  'plan-no-disponible':
    'El plan de la suscripción ya no está publicado o no tiene precio vigente.',
  'descuento-desfasado':
    'El código de descuento congelado al solicitar el aumento ya no coincide con el de la suscripción (se agotó o cambió antes de pagarse).',
}

/**
 * Aviso interno de GSTI cuando un pago cubre el adeudo del aumento pero el cambio
 * queda en `not_applicable` (USRH1786107870856).
 */
export default class SubscriptionChangeNotApplicableMail extends BaseMail {
  constructor(private readonly params: SubscriptionChangeNotApplicableMailParams) {
    super()
  }

  prepare() {
    const {
      to,
      from,
      tradeName,
      businessUnitName,
      billingPlanName,
      billingSubscriptionId,
      billingSubscriptionChangeId,
      billingPaymentId,
      amountCents,
      currency,
      previousEmployees,
      newEmployees,
      proratedAmountCents,
      reason,
    } = this.params

    const environment = env.get('NODE_ENV')
    const environmentTag = environment === 'production' ? '' : `[${environment.toUpperCase()}] `
    const subject = `${environmentTag}[Cambio no aplicable] ${businessUnitName} — pago #${billingPaymentId}`

    for (const recipient of to) {
      this.message.to(recipient)
    }

    this.message.from(from, tradeName).subject(subject)

    this.message.htmlView('emails/subscription_change_not_applicable', {
      subject,
      tradeName,
      sidebarColor: DEFAULT_SIDEBAR_COLOR,
      businessUnitName,
      billingPlanName,
      billingSubscriptionId,
      billingSubscriptionChangeId,
      billingPaymentId,
      amountPaid: this.formatMoney(amountCents / 100, currency),
      proratedDue: this.formatMoney(proratedAmountCents / 100, currency),
      previousEmployees,
      newEmployees,
      reasonLabel: REASON_LABELS[reason],
      reasonCode: reason,
    })
  }

  private formatMoney(amount: number, currency: string): string {
    try {
      return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount)
    } catch {
      return `${amount} ${currency}`
    }
  }
}
