import { BaseMail } from '@adonisjs/mail'
import env from '#start/env'
import type BillingSubscription from '#models/billing_subscription'

export interface SelfServiceSubscriptionCreatedMailParams {
  to: string[]
  from: string
  tradeName: string
  subscription: BillingSubscription
  businessUnitName: string
  billingPlanName: string
  /**
   * `true` cuando la notificación proviene del alta de empresa adicional
   * (USRH1787932877001); cambia el asunto del correo para que el equipo de
   * operaciones distinga el primer registro del de una empresa nueva.
   */
  isAdditional?: boolean
  /**
   * Número de empresas activas del usuario creador tras el alta (incluida la
   * nueva). Se incorpora al asunto solo cuando `isAdditional === true`.
   */
  creatorLiveBusinessUnitCount?: number
}

/**
 * Logotipo en blanco para el encabezado azul de los correos internos. Vive en el
 * mismo bucket público que el logo a color del resto de plantillas.
 */
const HEADER_LOGO_URL =
  'https://gsti-assets.sfo3.cdn.digitaloceanspaces.com/valanserh/logos/logotipo-white.png'

/**
 * Correo interno de operación: aviso de contratación self-service (USRH1785441817250).
 *
 * Es un aviso operativo (no de cara al cliente final), por lo que el contenido va en
 * español fijo, sin i18n por tenant. Sigue el mismo patrón que
 * `WorkJournalSealRunSummaryMail`: mailer = construcción de variables, plantilla Edge
 * = presentación HTML con estilos inline (compatible Gmail/Outlook).
 */
export default class SelfServiceSubscriptionCreatedMail extends BaseMail {
  constructor(private readonly params: SelfServiceSubscriptionCreatedMailParams) {
    super()
  }

  prepare() {
    const {
      to,
      from,
      tradeName,
      subscription,
      businessUnitName,
      billingPlanName,
      isAdditional,
      creatorLiveBusinessUnitCount,
    } = this.params

    const environment = env.get('NODE_ENV')
    const environmentTag = environment === 'production' ? '' : `[${environment.toUpperCase()}] `

    let subject: string
    if (isAdditional === true) {
      const countTag =
        creatorLiveBusinessUnitCount !== undefined ? ` #${creatorLiveBusinessUnitCount}` : ''
      subject = `${environmentTag}[Interno] Empresa adicional${countTag} — ${businessUnitName}`
    } else {
      subject = `${environmentTag}[Interno] Nueva contratación — ${businessUnitName}`
    }

    const discountLabel =
      subscription.billingSubscriptionDiscountPercent > 0
        ? `${subscription.billingSubscriptionDiscountPercent}%`
        : 'Sin descuento'

    for (const recipient of to) {
      this.message.to(recipient)
    }

    this.message.from(from, tradeName).subject(subject)

    this.message.htmlView('emails/self_service_subscription_created', {
      subject,
      tradeName,
      headerLogoUrl: HEADER_LOGO_URL,
      businessUnitName,
      billingPlanName,
      subscriptionId: subscription.billingSubscriptionId,
      contractedEmployees: subscription.billingSubscriptionContractedEmployees,
      contractedUnitAmount: this.formatMoney(
        subscription.billingSubscriptionContractedUnitAmount,
        subscription.billingSubscriptionContractedCurrency
      ),
      discountLabel,
      contractedSubtotal: this.formatMoney(
        subscription.billingSubscriptionContractedSubtotal,
        subscription.billingSubscriptionContractedCurrency
      ),
      contractedTaxAmount: this.formatMoney(
        subscription.billingSubscriptionContractedTaxAmount,
        subscription.billingSubscriptionContractedCurrency
      ),
      taxRatePercent: Math.round(subscription.billingSubscriptionContractedTaxRate * 100),
      contractedTotal: this.formatMoney(
        subscription.billingSubscriptionContractedTotal,
        subscription.billingSubscriptionContractedCurrency
      ),
      currency: subscription.billingSubscriptionContractedCurrency,
      contractedTrialDays: subscription.billingSubscriptionContractedTrialDays,
      subscribedAt: this.formatDateDmy(subscription.billingSubscriptionSubscribedAt.toISODate() ?? ''),
      trialEndsAt: this.formatDateDmy(subscription.billingSubscriptionTrialEndsAt?.toISODate() ?? ''),
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

  private formatDateDmy(iso: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
    if (!match) return iso
    const [, y, m, d] = match
    return `${d}/${m}/${y}`
  }
}
