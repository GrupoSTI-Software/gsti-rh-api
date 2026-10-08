import { BaseMail } from '@adonisjs/mail'
import i18nManager from '@adonisjs/i18n/services/main'
import { resolveMailLocale } from '#constants/mail_locale'

export interface TraumaticEventReportNewHrMailBranding {
  tradeName: string
  backgroundImageLogo: string
}

export interface TraumaticEventReportNewHrMailParams {
  to: string
  from: string
  language: 'es' | 'en'
  branding: TraumaticEventReportNewHrMailBranding
  companyName: string
  workerName: string
  eventTypeName: string
  occurredAt: string
  boardUrl: string
}

/**
 * Aviso a quien gestiona eventos traumáticos de una empresa cuando un
 * trabajador reporta desde la app. Lleva lo mínimo para ubicar el caso:
 * nunca la descripción ni las personas involucradas.
 */
export default class TraumaticEventReportNewHrMail extends BaseMail {
  constructor(private readonly params: TraumaticEventReportNewHrMailParams) {
    super()
  }

  prepare() {
    const {
      to,
      from,
      language,
      branding,
      companyName,
      workerName,
      eventTypeName,
      occurredAt,
      boardUrl,
    } = this.params
    const i18n = i18nManager.locale(resolveMailLocale(language))
    const { tradeName, backgroundImageLogo } = branding

    const subject = i18n.formatMessage('traumatic_event_new_hr_notification.subject', {
      companyName,
    })
    const preheader = i18n.formatMessage('traumatic_event_new_hr_notification.preheader')
    const greeting = i18n.formatMessage('traumatic_event_new_hr_notification.greeting')
    const intro = i18n.formatMessage('traumatic_event_new_hr_notification.intro', {
      companyName,
    })
    const workerLabel = i18n.formatMessage('traumatic_event_new_hr_notification.worker_label')
    const eventTypeLabel = i18n.formatMessage('traumatic_event_new_hr_notification.event_type_label')
    const occurredAtLabel = i18n.formatMessage(
      'traumatic_event_new_hr_notification.occurred_at_label'
    )
    const cta = i18n.formatMessage('traumatic_event_new_hr_notification.cta')
    const confidentialityNote = i18n.formatMessage(
      'traumatic_event_new_hr_notification.confidentiality_note'
    )
    const fallbackUrl = i18n.formatMessage('traumatic_event_new_hr_notification.fallback_url')
    const footer = i18n.formatMessage('traumatic_event_new_hr_notification.footer', {
      tradeName,
    })

    this.message.to(to).from(from, tradeName).subject(subject)

    this.message.htmlView('emails/traumatic_event_report_new_hr', {
      tradeName,
      backgroundImageLogo,
      subject,
      preheader,
      greeting,
      intro,
      workerLabel,
      workerName,
      eventTypeLabel,
      eventTypeName,
      occurredAtLabel,
      occurredAt,
      cta,
      confidentialityNote,
      fallbackUrl,
      boardUrl,
      footer,
    })
  }
}
