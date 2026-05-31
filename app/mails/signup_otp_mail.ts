import { BaseMail } from '@adonisjs/mail'
import i18nManager from '@adonisjs/i18n/services/main'

/**
 * Branding inyectado por `AuthMailService` para mantener consistencia visual
 * entre los correos transaccionales (mismo `tradeName`, `logo` y `favicon` que
 * el flujo legacy de recuperación de contraseña).
 */
export interface SignupOtpMailBranding {
  tradeName: string
  backgroundImageLogo: string
  favicon: string | null
}

export interface SignupOtpMailParams {
  to: string
  from: string
  firstName: string
  pinCode: string
  language: 'es' | 'en'
  branding: SignupOtpMailBranding
  validityMinutes: number
}

/**
 * Correo del flujo de signup self-service que entrega al prospecto el código
 * OTP necesario para verificar su email.
 *
 * Se modela como `BaseMail` (patrón idiomático de Adonis 6) para:
 *
 * - Aprovechar `mail.fake()` con `assertSent(SignupOtpMail, finder)` en los
 *   tests sin tocar el SMTP real.
 * - Centralizar la composición del mensaje (subject + html) en una sola clase
 *   reutilizable y testeable de forma aislada.
 *
 * La clase es pasiva: recibe todo lo necesario por constructor y delega el
 * acceso al SystemSetting y a la configuración de SMTP en el servicio que la
 * instancia (`AuthMailService`).
 */
export default class SignupOtpMail extends BaseMail {
  constructor(private readonly params: SignupOtpMailParams) {
    super()
  }

  prepare() {
    const { to, from, firstName, pinCode, language, branding, validityMinutes } = this.params

    const i18n = i18nManager.locale(language)
    const subject = i18n.formatMessage('auth.signup.otp.subject', { pinCode })
    const preheader = i18n.formatMessage('auth.signup.otp.preheader')
    const greeting = i18n.formatMessage('auth.signup.otp.greeting', { firstName })
    const intro = i18n.formatMessage('auth.signup.otp.intro', { tradeName: branding.tradeName })
    const codeLabel = i18n.formatMessage('auth.signup.otp.code_label')
    const validity = i18n.formatMessage('auth.signup.otp.validity', { minutes: validityMinutes })
    const ignoreNotice = i18n.formatMessage('auth.signup.otp.ignore_notice')
    const footer = i18n.formatMessage('auth.signup.otp.footer', { tradeName: branding.tradeName })

    this.message
      .to(to)
      .from(from, branding.tradeName)
      .subject(subject)
      .htmlView('emails/signup_otp', {
        tradeName: branding.tradeName,
        backgroundImageLogo: branding.backgroundImageLogo,
        favicon: branding.favicon,
        pinCode,
        firstName,
        subject,
        preheader,
        greeting,
        intro,
        codeLabel,
        validity,
        ignoreNotice,
        footer,
      })
  }
}
