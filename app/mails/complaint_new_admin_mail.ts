import { BaseMail } from '@adonisjs/mail'
import i18nManager from '@adonisjs/i18n/services/main'
import { resolveMailLocale } from '#constants/mail_locale'

export interface ComplaintNewAdminMailBranding {
  tradeName: string
  backgroundImageLogo: string
}

export interface ComplaintNewAdminMailParams {
  to: string
  from: string
  language: 'es' | 'en'
  branding: ComplaintNewAdminMailBranding
  folio: string
  pendingNewCount: number
  boardUrl: string
}

/**
 * Aviso a administradores designados cuando se registra una queja nueva.
 * Nunca incluye identidad del denunciante: solo folio, conteo pendiente y enlace a la bandeja.
 */
export default class ComplaintNewAdminMail extends BaseMail {
  constructor(private readonly params: ComplaintNewAdminMailParams) {
    super()
  }

  prepare() {
    const { to, from, language, branding, folio, pendingNewCount, boardUrl } = this.params
    // Correo siempre en español hasta el lanzamiento en inglés (mail_locale.ts).
    const i18n = i18nManager.locale(resolveMailLocale(language))
    const { tradeName, backgroundImageLogo } = branding

    const subject = i18n.formatMessage('complaint_new_admin_notification.subject', {
      tradeName,
      folio,
    })
    const preheader = i18n.formatMessage('complaint_new_admin_notification.preheader', {
      pendingNewCount,
    })
    const greeting = i18n.formatMessage('complaint_new_admin_notification.greeting')
    const intro = i18n.formatMessage('complaint_new_admin_notification.intro')
    const cta = i18n.formatMessage('complaint_new_admin_notification.cta')
    const ctaCaption = i18n.formatMessage('complaint_new_admin_notification.cta_caption')
    const folioLabel = i18n.formatMessage('complaint_new_admin_notification.folio_label')
    const pendingCount = i18n.formatMessage('complaint_new_admin_notification.pending_count', {
      pendingNewCount,
    })
    const confidentialityNote = i18n.formatMessage(
      'complaint_new_admin_notification.confidentiality_note'
    )
    const fallbackUrl = i18n.formatMessage('complaint_new_admin_notification.fallback_url')
    const footer = i18n.formatMessage('complaint_new_admin_notification.footer', {
      tradeName,
    })

    this.message.to(to).from(from, tradeName).subject(subject)

    this.message.htmlView('emails/complaint_new_admin', {
      tradeName,
      backgroundImageLogo,
      subject,
      preheader,
      greeting,
      intro,
      cta,
      ctaCaption,
      folioLabel,
      folio,
      pendingCount,
      confidentialityNote,
      fallbackUrl,
      boardUrl,
      footer,
    })
  }
}
