import { BaseMail } from '@adonisjs/mail'
import { DateTime } from 'luxon'
import env from '#start/env'
import type {
  BillingSubscriptionChangeStatus,
  BillingSubscriptionChangeType,
} from '#models/billing_subscription_change'

export interface SubscriptionChangeRequestedMailParams {
  to: string[]
  from: string
  tradeName: string
  businessUnitName: string
  requestedByName: string
  requestedByEmail: string
  billingSubscriptionChangeId: number
  billingSubscriptionId: number
  changeType: BillingSubscriptionChangeType
  changeStatus: BillingSubscriptionChangeStatus
  previousEmployees: number
  newEmployees: number
  proratedAmountCents: number
  effectiveAtIso: string | null
  requestedAtIso: string
  event: 'increase_requested' | 'decrease_scheduled' | 'change_canceled'
  replacedChangeId: number | null
  appliedImmediately: boolean
}

const DEFAULT_SIDEBAR_COLOR = '#0a3057'
const DISPLAY_TIMEZONE = 'America/Mexico_City'

/**
 * Correo interno de operación: aviso de solicitud de cambio de suscripción
 * (USRH1786107870862). Tres variantes según `event`: ampliación, reducción
 * agendada y cancelación explícita.
 *
 * `proratedAmountCents` llega en centavos enteros (D-8 del diccionario del
 * bloque); la conversión a pesos se hace aquí, una sola vez, antes de
 * `formatMoney` — nunca en el servicio ni en el controller.
 */
export default class SubscriptionChangeRequestedMail extends BaseMail {
  constructor(private readonly params: SubscriptionChangeRequestedMailParams) {
    super()
  }

  prepare() {
    const {
      to,
      from,
      tradeName,
      businessUnitName,
      requestedByName,
      requestedByEmail,
      billingSubscriptionChangeId,
      billingSubscriptionId,
      changeType,
      changeStatus,
      previousEmployees,
      newEmployees,
      proratedAmountCents,
      effectiveAtIso,
      requestedAtIso,
      event,
      replacedChangeId,
      appliedImmediately,
    } = this.params

    const environment = env.get('NODE_ENV')
    const environmentTag = environment === 'production' ? '' : `[${environment.toUpperCase()}] `
    const eventLabel = this.resolveEventLabel(event)
    const subject = `${environmentTag}[${eventLabel}] ${businessUnitName} — solicitud #${billingSubscriptionChangeId}`

    const showChargeAmount =
      event === 'increase_requested' && !appliedImmediately && proratedAmountCents > 0
    const showTrialNotice = event === 'increase_requested' && appliedImmediately
    const showEffectiveDate = event === 'decrease_scheduled' && effectiveAtIso !== null
    const showNoChargeNotice =
      event === 'decrease_scheduled' ||
      event === 'change_canceled' ||
      (event === 'increase_requested' && !showChargeAmount)

    for (const recipient of to) {
      this.message.to(recipient)
    }

    this.message.from(from, tradeName).subject(subject)

    this.message.htmlView('emails/subscription_change_requested', {
      subject,
      tradeName,
      sidebarColor: DEFAULT_SIDEBAR_COLOR,
      event,
      eventLabel,
      businessUnitName,
      requestedByName,
      requestedByEmail,
      billingSubscriptionChangeId,
      billingSubscriptionId,
      changeType,
      changeStatus,
      previousEmployees,
      newEmployees,
      chargeAmount: showChargeAmount
        ? this.formatMoney(proratedAmountCents / 100, 'MXN')
        : null,
      effectiveAt: showEffectiveDate ? this.formatDateDmy(effectiveAtIso!) : null,
      requestedAt: this.formatDateTimeDmy(requestedAtIso),
      replacedChangeId,
      showChargeAmount,
      showTrialNotice,
      showEffectiveDate,
      showNoChargeNotice,
      appliedImmediately,
    })
  }

  private resolveEventLabel(
    event: 'increase_requested' | 'decrease_scheduled' | 'change_canceled'
  ): string {
    switch (event) {
      case 'increase_requested':
        return 'Ampliación de suscripción'
      case 'decrease_scheduled':
        return 'Reducción agendada'
      case 'change_canceled':
        return 'Cancelación de solicitud'
    }
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

  private formatDateDmy(iso: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
    if (!match) return iso
    const [, y, m, d] = match
    return `${d}/${m}/${y}`
  }

  private formatDateTimeDmy(iso: string): string {
    const dt = DateTime.fromISO(iso, { zone: 'utc' }).setZone(DISPLAY_TIMEZONE)
    if (!dt.isValid) {
      return iso
    }
    return dt.toFormat('dd/MM/yyyy HH:mm')
  }
}
