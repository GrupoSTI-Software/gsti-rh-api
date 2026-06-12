import { BaseMail } from '@adonisjs/mail'
import i18nManager from '@adonisjs/i18n/services/main'

export interface PasswordRecoveryMailBranding {
  tradeName: string
  backgroundImageLogo: string
}

export interface PasswordRecoveryMailParams {
  to: string
  from: string
  firstName: string
  resetUrl: string
  pinCode: string
  language: 'es' | 'en'
  branding: PasswordRecoveryMailBranding
  validityMinutes: number
}

/**
 * Correo de recuperación de contraseña para el backoffice web (enlace + código OTP).
 */
export default class PasswordRecoveryMail extends BaseMail {
  constructor(private readonly params: PasswordRecoveryMailParams) {
    super()
  }

  prepare() {
    const { to, from, firstName, resetUrl, pinCode, language, branding, validityMinutes } =
      this.params

    const i18n = i18nManager.locale(language)
    const subject = i18n.formatMessage('auth.password_recovery.subject', {
      tradeName: branding.tradeName,
    })
    const preheader = i18n.formatMessage('auth.password_recovery.preheader')
    const greeting = i18n.formatMessage('auth.password_recovery.greeting', { firstName })
    const intro = i18n.formatMessage('auth.password_recovery.intro')
    const cta = i18n.formatMessage('auth.password_recovery.cta')
    const ctaCaption = i18n.formatMessage('auth.password_recovery.cta_caption')
    const codeLabel = i18n.formatMessage('auth.password_recovery.code_label')
    const validity = i18n.formatMessage('auth.password_recovery.validity', {
      minutes: validityMinutes,
    })
    const ignoreNotice = i18n.formatMessage('auth.password_recovery.ignore_notice')
    const fallbackUrl = i18n.formatMessage('auth.password_recovery.fallback_url')
    const footer = i18n.formatMessage('auth.password_recovery.footer', {
      tradeName: branding.tradeName,
    })

    this.message
      .to(to)
      .from(from, branding.tradeName)
      .subject(subject)
      .htmlView('emails/password_recovery', {
        tradeName: branding.tradeName,
        backgroundImageLogo: branding.backgroundImageLogo,
        resetUrl,
        pinCode,
        subject,
        preheader,
        greeting,
        intro,
        cta,
        ctaCaption,
        codeLabel,
        validity,
        ignoreNotice,
        fallbackUrl,
        footer,
      })
  }
}
