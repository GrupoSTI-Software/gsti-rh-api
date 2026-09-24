import { BaseMail } from '@adonisjs/mail'
import i18nManager from '@adonisjs/i18n/services/main'
import { resolveMailLocale, type MailLocale } from '#constants/mail_locale'

/** Marca con la que sale el correo. */
export interface SubscriptionRenewalRequestMailBranding {
  tradeName: string
  backgroundImageLogo: string
}

/** Datos del aviso interno de solicitud de renovacion. */
export interface SubscriptionRenewalRequestMailParams {
  to: string
  from: string
  language: MailLocale
  branding: SubscriptionRenewalRequestMailBranding
  /** Empresa que pide renovar. */
  companyName: string
  planName: string
  /** Situacion que dejo la contratacion fuera de servicio. */
  status: 'past_due' | 'canceled'
  /** Importe pendiente, ya formateado con su separador de miles. */
  amount: string
  currency: string
  periodsOverdue: number
  contractedEmployees: number
  /** Persona que apreto el boton; el equipo responde a esta direccion. */
  requesterName: string
  requesterEmail: string
}

/**
 * Aviso interno de que un cliente quiere renovar su contratacion.
 *
 * El cobro ocurre fuera de la plataforma: no hay pasarela ni registro
 * automatico, asi que este correo es el unico disparo que recibe el equipo
 * para responder con la referencia de pago. Por eso lleva todo lo necesario
 * para contestar sin abrir el backoffice: empresa, plan, saldo y quien pide.
 */
export default class SubscriptionRenewalRequestMail extends BaseMail {
  constructor(private readonly params: SubscriptionRenewalRequestMailParams) {
    super()
  }

  prepare() {
    const {
      to,
      from,
      language,
      branding,
      companyName,
      planName,
      status,
      amount,
      currency,
      periodsOverdue,
      contractedEmployees,
      requesterName,
      requesterEmail,
    } = this.params

    // Correo siempre en español hasta el lanzamiento en inglés (mail_locale.ts).
    const i18n = i18nManager.locale(resolveMailLocale(language))
    const { tradeName, backgroundImageLogo } = branding

    const subject = i18n.formatMessage('subscription_renewal_request.subject', { companyName })
    const statusValue =
      status === 'canceled'
        ? i18n.formatMessage('subscription_renewal_request.status_canceled')
        : i18n.formatMessage('subscription_renewal_request.status_past_due')

    this.message
      .to(to)
      .from(from, tradeName)
      // El equipo responde al cliente directo desde el aviso.
      .replyTo(requesterEmail, requesterName)
      .subject(subject)
      .htmlView('emails/subscription_renewal_request', {
        tradeName,
        backgroundImageLogo,
        subject,
        preheader: i18n.formatMessage('subscription_renewal_request.preheader', {
          companyName,
          planName,
        }),
        greeting: i18n.formatMessage('subscription_renewal_request.greeting'),
        intro: i18n.formatMessage('subscription_renewal_request.intro', { companyName }),
        detailsTitle: i18n.formatMessage('subscription_renewal_request.details_title'),
        // La ficha se arma como lista de pares para que la plantilla no tenga
        // que saber cuantos datos trae ni en que orden.
        detailRows: [
          {
            label: i18n.formatMessage('subscription_renewal_request.company_label'),
            value: companyName,
          },
          {
            label: i18n.formatMessage('subscription_renewal_request.plan_label'),
            value: planName,
          },
          {
            label: i18n.formatMessage('subscription_renewal_request.status_label'),
            value: statusValue,
          },
          {
            label: i18n.formatMessage('subscription_renewal_request.amount_label'),
            value: i18n.formatMessage('subscription_renewal_request.amount_value', {
              amount,
              currency,
              periods: periodsOverdue,
            }),
          },
          {
            label: i18n.formatMessage('subscription_renewal_request.employees_label'),
            value: i18n.formatMessage('subscription_renewal_request.employees_value', {
              employees: contractedEmployees,
            }),
          },
        ],
        requesterLabel: i18n.formatMessage('subscription_renewal_request.requester_label'),
        requesterValue: i18n.formatMessage('subscription_renewal_request.requester_value', {
          requesterName,
          requesterEmail,
        }),
        requesterEmail,
        nextStep: i18n.formatMessage('subscription_renewal_request.next_step'),
        footer: i18n.formatMessage('subscription_renewal_request.footer', { tradeName }),
      })
  }
}
