import mail from '@adonisjs/mail/services/main'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import type BillingSubscription from '#models/billing_subscription'
import type {
  ApplyIncreaseNotApplicableReason,
  SubscriptionChangeRecord,
} from '#services/billing_subscription_change_service'
import SelfServiceSubscriptionCreatedMail from '../mails/self_service_subscription_created_mail.js'
import SubscriptionChangeNotApplicableMail from '../mails/subscription_change_not_applicable_mail.js'

const DEFAULT_RECIPIENTS_FALLBACK = 'desarrollo-software@gruposti.com'
const SENDER_TRADE_NAME = 'Valanserh'

export type NotifySelfServiceSubscriptionCreatedParams = {
  subscription: BillingSubscription
  businessUnitName: string
  billingPlanName: string
}

export type NotifySubscriptionChangeNotApplicableParams = {
  subscription: BillingSubscription
  change: SubscriptionChangeRecord
  businessUnitName: string
  billingPlanName: string
  billingPaymentId: number
  amountCents: number
  reason: ApplyIncreaseNotApplicableReason
}

type FailureLogPayload = {
  billingSubscriptionId: number
  businessUnitName: string
  billingPlanName: string
  contractedEmployees: number
  contractedTotal: number
  contractedCurrency: string
  contractedTrialDays: number
  firstPaymentDate: string | null
  recipients?: string[]
}

/**
 * Aviso interno de GSTI cuando una empresa contrata por la vía de autoservicio
 * (USRH1785441817250).
 *
 * Resiliente al SMTP: el método público nunca lanza; cualquier fallo de envío
 * se loguea y se descarta para que el registro del cliente no quede bloqueado.
 */
export default class BillingInternalNotificationService {
  /**
   * Notifica al equipo interno de GSTI sobre una contratación self-service recién
   * registrada. Solo formatea datos del snapshot; no recalcula montos ni fechas.
   */
  async notifySelfServiceSubscriptionCreated(
    params: NotifySelfServiceSubscriptionCreatedParams
  ): Promise<void> {
    const { subscription, businessUnitName, billingPlanName } = params
    const failureBase = this.buildFailureLogPayload(params)

    try {
      const recipients = this.resolveRecipients()

      if (recipients.length === 0) {
        logger.warn(
          { billingSubscriptionId: subscription.billingSubscriptionId },
          'BillingInternalNotificationService: sin destinatarios configurados; se omite el aviso de contratación self-service.'
        )
        return
      }

      const from = this.resolveSenderEmail()
      if (!from) {
        logger.error(
          { billingSubscriptionId: subscription.billingSubscriptionId },
          'BillingInternalNotificationService: SMTP_USERNAME no configurado; aviso omitido.'
        )
        return
      }

      await mail.send(
        new SelfServiceSubscriptionCreatedMail({
          to: recipients,
          from,
          tradeName: SENDER_TRADE_NAME,
          subscription,
          businessUnitName,
          billingPlanName,
        })
      )
    } catch (error) {
      const recipients = this.resolveRecipients()
      logger.error(
        {
          err: error,
          ...failureBase,
          recipients: recipients.map((email) => this.redactEmail(email)),
        },
        'BillingInternalNotificationService: fallo al enviar el aviso de contratación self-service.'
      )
    }
  }

  /**
   * Destinatarios internos de GSTI desde configuración de entorno.
   * split → trim → descartar vacíos → deduplicar por minúsculas.
   */
  resolveRecipients(): string[] {
    const raw = env.get('BILLING_INTERNAL_NOTIFICATION_EMAILS', DEFAULT_RECIPIENTS_FALLBACK)
    const seen = new Set<string>()
    const out: string[] = []

    for (const part of raw.split(',')) {
      const email = part.trim()
      if (!email) continue
      const key = email.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(email)
    }

    return out
  }

  private resolveSenderEmail(): string | null {
    const sender = env.get('SMTP_USERNAME')
    if (typeof sender !== 'string' || sender.trim().length === 0) {
      return null
    }
    return sender.trim()
  }

  private buildFailureLogPayload(
    params: NotifySelfServiceSubscriptionCreatedParams
  ): FailureLogPayload {
    const { subscription, businessUnitName, billingPlanName } = params
    return {
      billingSubscriptionId: subscription.billingSubscriptionId,
      businessUnitName,
      billingPlanName,
      contractedEmployees: subscription.billingSubscriptionContractedEmployees,
      contractedTotal: subscription.billingSubscriptionContractedTotal,
      contractedCurrency: subscription.billingSubscriptionContractedCurrency,
      contractedTrialDays: subscription.billingSubscriptionContractedTrialDays,
      firstPaymentDate: subscription.billingSubscriptionTrialEndsAt?.toISODate() ?? null,
    }
  }

  /**
   * Notifica al equipo interno cuando un pago cubre el adeudo del aumento pero el cambio
   * queda `not_applicable` (USRH1786107870856). Nunca lanza al caller.
   */
  async notifySubscriptionChangeNotApplicable(
    params: NotifySubscriptionChangeNotApplicableParams
  ): Promise<void> {
    const {
      subscription,
      change,
      businessUnitName,
      billingPlanName,
      billingPaymentId,
      amountCents,
      reason,
    } = params

    try {
      const recipients = this.resolveRecipients()

      if (recipients.length === 0) {
        logger.warn(
          {
            billingSubscriptionId: subscription.billingSubscriptionId,
            billingSubscriptionChangeId: change.billingSubscriptionChangeId,
          },
          'BillingInternalNotificationService: sin destinatarios configurados; se omite el aviso de cambio no aplicable.'
        )
        return
      }

      const from = this.resolveSenderEmail()
      if (!from) {
        logger.error(
          {
            billingSubscriptionId: subscription.billingSubscriptionId,
            billingSubscriptionChangeId: change.billingSubscriptionChangeId,
          },
          'BillingInternalNotificationService: SMTP_USERNAME no configurado; aviso de cambio no aplicable omitido.'
        )
        return
      }

      await mail.send(
        new SubscriptionChangeNotApplicableMail({
          to: recipients,
          from,
          tradeName: SENDER_TRADE_NAME,
          businessUnitName,
          billingPlanName,
          billingSubscriptionId: subscription.billingSubscriptionId,
          billingSubscriptionChangeId: change.billingSubscriptionChangeId,
          billingPaymentId,
          amountCents,
          currency: subscription.billingSubscriptionContractedCurrency,
          previousEmployees: change.billingSubscriptionChangePreviousEmployees,
          newEmployees: change.billingSubscriptionChangeNewEmployees,
          proratedAmountCents: change.billingSubscriptionChangeProratedAmountCents,
          reason,
        })
      )
    } catch (error) {
      const recipients = this.resolveRecipients()
      logger.error(
        {
          err: error,
          billingSubscriptionId: subscription.billingSubscriptionId,
          billingSubscriptionChangeId: change.billingSubscriptionChangeId,
          billingPaymentId,
          amountCents,
          reason,
          businessUnitName,
          billingPlanName,
          recipients: recipients.map((email) => this.redactEmail(email)),
        },
        'BillingInternalNotificationService: fallo al enviar el aviso de cambio no aplicable.'
      )
    }
  }

  /** Ej.: `juan@gsti.mx` → `***@gsti.mx` (mismo criterio que AuthMailService). */
  private redactEmail(value: string): string {
    if (!value || !value.includes('@')) {
      return '***'
    }
    const [, domain] = value.split('@')
    return `***@${domain}`
  }
}
