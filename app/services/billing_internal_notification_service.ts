import mail from '@adonisjs/mail/services/main'
import logger from '@adonisjs/core/services/logger'
import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import { resolveMailSender } from '#helpers/resolve_mail_sender'
import BusinessUnit from '#models/business_unit'
import BillingSubscriptionChange from '#models/billing_subscription_change'
import type BillingSubscription from '#models/billing_subscription'
import type {
  ApplyIncreaseNotApplicableReason,
  SubscriptionChangeRecord,
} from '#services/billing_subscription_change_service'
import SelfServiceSubscriptionCreatedMail from '../mails/self_service_subscription_created_mail.js'
import SubscriptionChangeNotApplicableMail from '../mails/subscription_change_not_applicable_mail.js'
import SubscriptionChangeRequestedMail from '../mails/subscription_change_requested_mail.js'

const DEFAULT_RECIPIENTS_FALLBACK = 'desarrollo-software@gruposti.com'
const SENDER_TRADE_NAME = 'Valanserh'

/**
 * Lista de desarrollo para pruebas — solo estos correos reciben avisos
 * reales fuera de producción. Espejo del gate de `telework_policy_notification.service.ts`
 * (bloquea antes de `mail.send()`). Incluye `wramirez@gruposti.com` además de la
 * lista estándar del repo, porque los destinatarios reales de este aviso salen de
 * `BILLING_INTERNAL_NOTIFICATION_EMAILS` y `.env.example` instruye dejar ese correo
 * al final. Para probar con otro buzón propio, agrégalo aquí en tu rama local sin mergear.
 */
const DEVELOPMENT_EMAIL_LIST = [
  'jsoto@gruposti.com',
  'wilvardo@gmail.com',
  'wramirez@gruposti.com',
] as const

export type SubscriptionChangeNotificationEvent =
  | 'increase_requested'
  | 'decrease_scheduled'
  | 'change_canceled'

export type NotifySubscriptionChangeRequestedParams = {
  change: BillingSubscriptionChange
  businessUnitName: string
  requestedByName: string
  requestedByEmail: string
  event: SubscriptionChangeNotificationEvent
  replacedChangeId: number | null
  appliedImmediately: boolean
}

export type DispatchSubscriptionChangeRequestedOptions = {
  event: SubscriptionChangeNotificationEvent
  appliedImmediately: boolean
  replacedChangeId?: number | null
  /** Solo en `increase_requested`: detecta la solicitud viva reemplazada (regla 8). */
  resolveSupersededOnIncrease?: boolean
}

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

type SubscriptionChangeFailureLogPayload = {
  billingSubscriptionChangeId: number
  billingSubscriptionId: number
  businessUnitId: number
  businessUnitName: string
  event: SubscriptionChangeNotificationEvent
  changeType: BillingSubscriptionChange['billingSubscriptionChangeType']
  changeStatus: BillingSubscriptionChange['billingSubscriptionChangeStatus']
  previousEmployees: number
  newEmployees: number
  proratedAmountCents: number
  effectiveAt: string | null
  replacedChangeId: number | null
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

      const from = resolveMailSender()

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
   * Notifica al equipo interno de GSTI sobre una solicitud de cambio de suscripción
   * recién registrada (USRH1786107870862). Tres variantes según `event`: ampliación,
   * reducción agendada y cancelación explícita. Fuera de producción aplica gate de
   * lista blanca antes de `mail.send()`. Nunca lanza al caller.
   */
  async notifySubscriptionChangeRequested(
    params: NotifySubscriptionChangeRequestedParams
  ): Promise<void> {
    const {
      change,
      businessUnitName,
      requestedByName,
      requestedByEmail,
      event,
      replacedChangeId,
      appliedImmediately,
    } = params
    const failureBase = this.buildSubscriptionChangeFailureLogPayload(params)

    try {
      const recipients = this.resolveRecipients()

      if (recipients.length === 0) {
        logger.warn(
          {
            billingSubscriptionChangeId: change.billingSubscriptionChangeId,
            event,
          },
          'BillingInternalNotificationService: sin destinatarios configurados; se omite el aviso de cambio de suscripción.'
        )
        return
      }

      const from = resolveMailSender()

      const recipientsToSend = this.filterRecipientsForDelivery(recipients, {
        billingSubscriptionChangeId: change.billingSubscriptionChangeId,
        event,
      })

      if (recipientsToSend.length === 0) {
        return
      }

      await mail.send(
        new SubscriptionChangeRequestedMail({
          to: recipientsToSend,
          from,
          tradeName: SENDER_TRADE_NAME,
          businessUnitName,
          requestedByName,
          requestedByEmail,
          billingSubscriptionChangeId: change.billingSubscriptionChangeId,
          billingSubscriptionId: change.billingSubscriptionId,
          changeType: change.billingSubscriptionChangeType,
          changeStatus: change.billingSubscriptionChangeStatus,
          previousEmployees: change.billingSubscriptionChangePreviousEmployees,
          newEmployees: change.billingSubscriptionChangeNewEmployees,
          proratedAmountCents: change.billingSubscriptionChangeProratedAmountCents,
          effectiveAtIso: change.billingSubscriptionChangeEffectiveAt?.toISO() ?? null,
          requestedAtIso: change.billingSubscriptionChangeCreatedAt.toISO() ?? '',
          event,
          replacedChangeId,
          appliedImmediately,
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
        'BillingInternalNotificationService: fallo al enviar el aviso de solicitud de cambio de suscripción.'
      )
    }
  }

  /**
   * Punto de enganche post-commit desde el controller (USRH1786107870862).
   * Resuelve solicitante y empresa, carga el cambio y dispara el aviso sin `await`
   * en el caller: la respuesta HTTP no espera al SMTP.
   */
  dispatchSubscriptionChangeRequestedFromSession(
    ctx: HttpContext,
    businessUnitId: number,
    billingSubscriptionChangeId: number,
    options: DispatchSubscriptionChangeRequestedOptions
  ): void {
    void this.runSubscriptionChangeRequestedDispatch(
      ctx,
      businessUnitId,
      billingSubscriptionChangeId,
      options
    ).catch((err) =>
      logger.error(
        { err, billingSubscriptionChangeId, event: options.event },
        'BillingInternalNotificationService: fallo al preparar el aviso de solicitud de cambio de suscripción.'
      )
    )
  }

  /**
   * Resuelve nombre de empresa y datos del solicitante desde la sesión autenticada.
   */
  async resolveSubscriptionChangeNotificationContext(
    ctx: HttpContext,
    businessUnitId: number
  ): Promise<{ businessUnitName: string; requestedByName: string; requestedByEmail: string }> {
    const user = ctx.auth.user!
    await user.preload('person')

    const businessUnit = await BusinessUnit.query()
      .where('business_unit_id', businessUnitId)
      .whereNull('business_unit_deleted_at')
      .first()

    const requestedByName =
      [user.person?.personFirstname, user.person?.personLastname, user.person?.personSecondLastname]
        .filter(Boolean)
        .join(' ')
        .trim() || user.userEmail

    return {
      businessUnitName: businessUnit?.businessUnitName ?? `Empresa #${businessUnitId}`,
      requestedByName,
      requestedByEmail: user.userEmail,
    }
  }

  /**
   * Detecta la solicitud viva cancelada automáticamente en la misma operación
   * (regla 8). Usa proximidad de `updated_at` para no confundir cancelaciones
   * explícitas anteriores.
   */
  async resolveSupersededChangeIdAfterIncrease(
    change: BillingSubscriptionChange,
    businessUnitId: number
  ): Promise<number | null> {
    const superseded = await BillingSubscriptionChange.query()
      .where('billing_subscription_id', change.billingSubscriptionId)
      .where('business_unit_id', businessUnitId)
      .where('billing_subscription_change_status', 'canceled')
      .where('billing_subscription_change_id', '<', change.billingSubscriptionChangeId)
      .whereNull('billing_subscription_change_deleted_at')
      .where(
        'billing_subscription_change_updated_at',
        '>=',
        change.billingSubscriptionChangeCreatedAt.minus({ seconds: 2 }).toSQL()!
      )
      .orderBy('billing_subscription_change_id', 'desc')
      .first()

    return superseded?.billingSubscriptionChangeId ?? null
  }

  private async runSubscriptionChangeRequestedDispatch(
    ctx: HttpContext,
    businessUnitId: number,
    billingSubscriptionChangeId: number,
    options: DispatchSubscriptionChangeRequestedOptions
  ): Promise<void> {
    const change = await BillingSubscriptionChange.findOrFail(billingSubscriptionChangeId)
    const context = await this.resolveSubscriptionChangeNotificationContext(ctx, businessUnitId)

    let replacedChangeId = options.replacedChangeId ?? null
    if (options.resolveSupersededOnIncrease) {
      replacedChangeId = await this.resolveSupersededChangeIdAfterIncrease(change, businessUnitId)
    }

    await this.notifySubscriptionChangeRequested({
      change,
      businessUnitName: context.businessUnitName,
      requestedByName: context.requestedByName,
      requestedByEmail: context.requestedByEmail,
      event: options.event,
      replacedChangeId,
      appliedImmediately: options.appliedImmediately,
    })
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

      const from = resolveMailSender()

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

  private buildSubscriptionChangeFailureLogPayload(
    params: NotifySubscriptionChangeRequestedParams
  ): SubscriptionChangeFailureLogPayload {
    const { change, businessUnitName, event, replacedChangeId } = params
    return {
      billingSubscriptionChangeId: change.billingSubscriptionChangeId,
      billingSubscriptionId: change.billingSubscriptionId,
      businessUnitId: change.businessUnitId,
      businessUnitName,
      event,
      changeType: change.billingSubscriptionChangeType,
      changeStatus: change.billingSubscriptionChangeStatus,
      previousEmployees: change.billingSubscriptionChangePreviousEmployees,
      newEmployees: change.billingSubscriptionChangeNewEmployees,
      proratedAmountCents: change.billingSubscriptionChangeProratedAmountCents,
      effectiveAt: change.billingSubscriptionChangeEffectiveAt?.toISO() ?? null,
      replacedChangeId,
    }
  }

  /**
   * Fuera de producción simula la entrega a destinatarios fuera de la lista blanca
   * (info en bitácora) y devuelve solo los autorizados para envío real.
   */
  private filterRecipientsForDelivery(
    recipients: string[],
    context: { billingSubscriptionChangeId: number; event: SubscriptionChangeNotificationEvent }
  ): string[] {
    const isDevelopment = env.get('NODE_ENV') !== 'production'
    if (!isDevelopment) {
      return recipients
    }

    const authorized: string[] = []

    for (const email of recipients) {
      const isInDevList = DEVELOPMENT_EMAIL_LIST.some(
        (devEmail) => devEmail.toLowerCase() === email.toLowerCase()
      )

      if (!isInDevList) {
        logger.info(
          {
            billingSubscriptionChangeId: context.billingSubscriptionChangeId,
            event: context.event,
            recipient: this.redactEmail(email),
          },
          'BillingInternalNotificationService: entrega simulada por gate de desarrollo.'
        )
        continue
      }

      authorized.push(email)
    }

    return authorized
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
