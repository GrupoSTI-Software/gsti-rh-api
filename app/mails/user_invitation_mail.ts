import { BaseMail } from '@adonisjs/mail'
import i18nManager from '@adonisjs/i18n/services/main'

export interface UserInvitationMailBranding {
  tradeName: string
  backgroundImageLogo: string
}

export interface UserInvitationMailParams {
  to: string
  from: string
  firstName: string
  invitationUrl: string
  language: 'es' | 'en'
  branding: UserInvitationMailBranding
  validityDays: number
  /** `false` para rol empleado (solo app); `true` incluye opción de backoffice web. */
  canAccessBackoffice: boolean
}

/**
 * Correo de invitación de acceso al dar de alta un usuario (USRH1786736057522).
 * Nunca incluye contraseña: solo enlace personal con caducidad.
 */
export default class UserInvitationMail extends BaseMail {
  constructor(private readonly params: UserInvitationMailParams) {
    super()
  }

  prepare() {
    const {
      to,
      from,
      firstName,
      invitationUrl,
      language,
      branding,
      validityDays,
      canAccessBackoffice,
    } = this.params

    const i18n = i18nManager.locale(language)
    const subject = i18n.formatMessage('auth.user_invitation.subject', {
      tradeName: branding.tradeName,
    })
    const preheader = i18n.formatMessage('auth.user_invitation.preheader')
    const greeting = i18n.formatMessage('auth.user_invitation.greeting', { firstName })
    const intro = i18n.formatMessage('auth.user_invitation.intro', {
      tradeName: branding.tradeName,
    })
    const cta = i18n.formatMessage('auth.user_invitation.cta')
    const ctaCaption = i18n.formatMessage('auth.user_invitation.cta_caption')
    const validity = i18n.formatMessage('auth.user_invitation.validity', { days: validityDays })
    const fallbackUrl = i18n.formatMessage('auth.user_invitation.fallback_url')
    const appNotice = i18n.formatMessage('auth.user_invitation.app_notice')
    const backofficeNotice = i18n.formatMessage('auth.user_invitation.backoffice_notice')
    const footer = i18n.formatMessage('auth.user_invitation.footer', {
      tradeName: branding.tradeName,
    })

    this.message
      .to(to)
      .from(from, branding.tradeName)
      .subject(subject)
      .htmlView('emails/user_invitation', {
        tradeName: branding.tradeName,
        backgroundImageLogo: branding.backgroundImageLogo,
        invitationUrl,
        subject,
        preheader,
        greeting,
        intro,
        cta,
        ctaCaption,
        validity,
        fallbackUrl,
        appNotice,
        backofficeNotice,
        canAccessBackoffice,
        footer,
      })
  }
}
