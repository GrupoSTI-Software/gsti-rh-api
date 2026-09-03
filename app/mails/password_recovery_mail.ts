import { BaseMail } from '@adonisjs/mail'
import i18nManager from '@adonisjs/i18n/services/main'
import { resolveMailLocale } from '#constants/mail_locale'

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

    // Correo siempre en español hasta el lanzamiento en inglés (mail_locale.ts).
    const i18n = i18nManager.locale(resolveMailLocale(language))
    const subject = i18n.formatMessage('auth.password_recovery.subject', {
      tradeName: branding.tradeName,
    })
    const preheader = i18n.formatMessage('auth.password_recovery.preheader')
    // El saludo va partido a propósito: el diseño resalta solo el nombre, y
    // `firstName` se imprime desde la vista con `{{ }}` para que Edge lo escape.
    const greetingLead = i18n.formatMessage('auth.password_recovery.greeting_lead')
    const intro = i18n.formatMessage('auth.password_recovery.intro')
    const codeLabel = i18n.formatMessage('auth.password_recovery.code_label')
    // `validity` trae `<strong>` alrededor de los minutos para respetar el diseño;
    // la vista la imprime sin escapar. El único dato interpolado es el entero de
    // vigencia que define el propio servidor, nunca entrada del usuario.
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
        greetingLead,
        firstName,
        intro,
        codeLabel,
        validity,
        ignoreNotice,
        fallbackUrl,
        footer,
      })
  }
}
