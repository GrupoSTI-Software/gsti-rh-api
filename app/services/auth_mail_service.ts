import mail from '@adonisjs/mail/services/main'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import SystemSetting from '#models/system_setting'
import SystemSettingService from './system_setting_service.js'
import SignupOtpMail from '#mails/signup_otp_mail'
import WelcomeMail from '#mails/welcome_mail'
import MagicLinkMail from '#mails/magic_link_mail'
import PasswordRecoveryMail from '#mails/password_recovery_mail'
import { PASSWORD_RECOVERY_PIN_VALIDITY_MINUTES } from '#constants/password_recovery'

/**
 * Idiomas soportados por las plantillas de correo del flujo de signup.
 *
 * El proyecto actualmente publica catálogos `es` y `en`. Si en el futuro se
 * agregan variantes regionales (ej. `es-MX`, `en-US`), basta con extender este
 * tipo y crear las carpetas correspondientes en `resources/langs`.
 */
export type AuthMailLanguage = 'es' | 'en'

/**
 * Tiempo de vigencia del OTP que se muestra en la plantilla. La generación y
 * persistencia del código viven en los endpoints del flujo de signup (fuera del
 * alcance de esta historia); este valor sirve únicamente para informar al
 * destinatario en el cuerpo del correo.
 */
const OTP_VALIDITY_MINUTES = 10

/**
 * URL por defecto del backoffice cuando `BACKOFFICE_URL` no está configurada.
 * Se mantiene apuntando al host de desarrollo para no romper instalaciones
 * legacy mientras se propaga la variable a los `.env` de cada ambiente.
 */
const DEFAULT_BACKOFFICE_URL = 'http://127.0.0.1:3000'

/**
 * Branding inyectable en las plantillas. Se resuelve desde
 * `SystemSettingService.getActive()` y, ante ausencia de configuración activa,
 * aplica los mismos fallbacks del flujo de recuperación de contraseña
 * (`user_controller.ts:705`) para mantener consistencia con el resto del repo.
 */
interface AuthMailBranding {
  tradeName: string
  backgroundImageLogo: string
  favicon: string | null
}

interface SendSignupOtpParams {
  to: string
  firstName: string
  pinCode: string
  language: AuthMailLanguage
}

interface SendWelcomeParams {
  to: string
  firstName: string
  businessUnitName: string
  language: AuthMailLanguage
}

interface SendMagicLinkParams {
  to: string
  firstName: string
  magicLinkUrl: string
  language: AuthMailLanguage
}

interface SendPasswordRecoveryParams {
  to: string
  firstName: string
  resetUrl: string
  pinCode: string
  language: AuthMailLanguage
}

/**
 * Servicio de correo dedicado al flujo de autenticación self-service.
 *
 * Responsabilidades:
 *
 * - Resolver el branding (logo, tradeName, favicon) leyendo el `SystemSetting`
 *   activo, con fallback al patrón legacy cuando no exista.
 * - Validar configuración mínima de SMTP antes de invocar el transporte.
 * - Componer la instancia de la `Mail class` correspondiente y enviarla.
 *
 * Características clave:
 *
 * - Los métodos públicos son fijos (no acepta plantillas dinámicas) para evitar
 *   template injection desde inputs no confiables del flujo de signup.
 * - Resiliente al SMTP: cualquier error de envío se loguea y se descarta para
 *   que el flujo de negocio (creación de Person/User/BusinessUnit) no quede
 *   bloqueado por un fallo de transporte de correo.
 * - Redacción defensiva en logs: nunca emite `to` ni `pinCode` en plano.
 * - Composición delegada a `SignupOtpMail` y `WelcomeMail` (clases `BaseMail`)
 *   para permitir interceptación limpia con `mail.fake()` en pruebas.
 */
export default class AuthMailService {
  /**
   * Envía el correo con el código OTP que el prospecto necesita ingresar para
   * verificar su email durante el wizard de signup.
   *
   * El método nunca lanza: ante cualquier fallo de configuración SMTP o de
   * envío, registra el error y resuelve sin propagarlo al caller.
   */
  async sendSignupOtp(params: SendSignupOtpParams): Promise<void> {
    const { to, firstName, pinCode, language } = params

    try {
      const senderEmail = this.resolveSenderEmail()
      if (!senderEmail) {
        logger.error(
          { to: this.redactEmail(to) },
          'AuthMailService.sendSignupOtp: SMTP_USERNAME no configurado; correo de OTP omitido.'
        )
        return
      }

      const isWhiteLabel = false
      const branding = await this.resolveBranding()

      if (!isWhiteLabel) {
        branding.tradeName = 'Valanserh'
        branding.backgroundImageLogo = 'https://gsti-assets.sfo3.cdn.digitaloceanspaces.com/valanserh/logos/logotipo-min.png'
      }

      await mail.send(
        new SignupOtpMail({
          to,
          from: senderEmail,
          firstName,
          pinCode,
          language,
          branding,
          validityMinutes: OTP_VALIDITY_MINUTES,
        })
      )
    } catch (error) {
      logger.error(
        { err: error, to: this.redactEmail(to) },
        'AuthMailService.sendSignupOtp: fallo al enviar correo de OTP.'
      )
    }
  }

  /**
   * Envía el correo de bienvenida tras la creación exitosa de la cuenta y la
   * empresa. El cuerpo NO incluye credenciales ni token de sesión: solo nombre
   * del prospecto, nombre de la empresa y un CTA al backoffice.
   *
   * Igual que `sendSignupOtp`, el método nunca lanza ante fallos de SMTP.
   */
  async sendWelcome(params: SendWelcomeParams): Promise<void> {
    const { to, firstName, businessUnitName, language } = params

    try {
      const senderEmail = this.resolveSenderEmail()
      if (!senderEmail) {
        logger.error(
          { to: this.redactEmail(to) },
          'AuthMailService.sendWelcome: SMTP_USERNAME no configurado; correo de bienvenida omitido.'
        )
        return
      }

      const branding = await this.resolveBranding()
      const backofficeUrl = env.get('BACKOFFICE_URL') ?? DEFAULT_BACKOFFICE_URL

      await mail.send(
        new WelcomeMail({
          to,
          from: senderEmail,
          firstName,
          businessUnitName,
          language,
          branding,
          backofficeUrl,
        })
      )
    } catch (error) {
      logger.error(
        { err: error, to: this.redactEmail(to) },
        'AuthMailService.sendWelcome: fallo al enviar correo de bienvenida.'
      )
    }
  }

  /**
   * Envía el correo con el enlace mágico de acceso sin contraseña al backoffice.
   * Nunca lanza ante fallos de SMTP.
   */
  async sendMagicLink(params: SendMagicLinkParams): Promise<void> {
    const { to, firstName, magicLinkUrl, language } = params

    try {
      const senderEmail = this.resolveSenderEmail()
      if (!senderEmail) {
        logger.error(
          { to: this.redactEmail(to) },
          'AuthMailService.sendMagicLink: SMTP_USERNAME no configurado; correo omitido.'
        )
        return
      }

      const branding = await this.resolveBranding()

      await mail.send(
        new MagicLinkMail({
          to,
          from: senderEmail,
          firstName,
          magicLinkUrl,
          language,
          branding,
          validityMinutes: 15,
        })
      )
    } catch (error) {
      logger.error(
        { err: error, to: this.redactEmail(to) },
        'AuthMailService.sendMagicLink: fallo al enviar correo de magic link.'
      )
    }
  }

  /**
   * Envía el correo de recuperación de contraseña para el backoffice web
   * (enlace + código OTP). Nunca lanza ante fallos de SMTP.
   */
  async sendPasswordRecovery(params: SendPasswordRecoveryParams): Promise<void> {
    const { to, firstName, resetUrl, pinCode, language } = params

    try {
      const senderEmail = this.resolveSenderEmail()
      if (!senderEmail) {
        logger.error(
          { to: this.redactEmail(to) },
          'AuthMailService.sendPasswordRecovery: SMTP_USERNAME no configurado; correo omitido.'
        )
        return
      }

      const branding = await this.resolveBranding()

      await mail.send(
        new PasswordRecoveryMail({
          to,
          from: senderEmail,
          firstName,
          resetUrl,
          pinCode,
          language,
          branding,
          validityMinutes: PASSWORD_RECOVERY_PIN_VALIDITY_MINUTES,
        })
      )
    } catch (error) {
      logger.error(
        { err: error, to: this.redactEmail(to) },
        'AuthMailService.sendPasswordRecovery: fallo al enviar correo de recuperación.'
      )
    }
  }

  /**
   * Lee el `SystemSetting` activo y arma el branding con los mismos fallbacks
   * que el flujo legacy de recuperación de contraseña, manteniendo la
   * consistencia visual de todos los correos transaccionales.
   */
  private async resolveBranding(): Promise<AuthMailBranding> {
    const branding: AuthMailBranding = {
      tradeName: 'Valanserh',
      backgroundImageLogo: 'https://gsti-assets.sfo3.cdn.digitaloceanspaces.com/valanserh/logos/logotipo-min.png',
      favicon: null,
    }

    try {
      const isWhiteLabel = false
      const systemSettingService = new SystemSettingService()
      const active = (await systemSettingService.getActive()) as unknown as SystemSetting | null

      if (active && isWhiteLabel) {
        if (active.systemSettingLogo) {
          branding.backgroundImageLogo = active.systemSettingLogo
        }

        if (active.systemSettingTradeName) {
          branding.tradeName = active.systemSettingTradeName
        }
      }
    } catch (error) {
      logger.warn(
        { err: error },
        'AuthMailService.resolveBranding: no se pudo leer SystemSetting activo; se usan fallbacks por defecto.'
      )
    }

    return branding
  }

  /**
   * Resuelve la dirección remitente desde `SMTP_USERNAME`. Devuelve `null`
   * cuando no hay configuración válida, lo que el caller utiliza como señal
   * para abortar el envío sin lanzar.
   */
  private resolveSenderEmail(): string | null {
    const sender = env.get('SMTP_USERNAME')
    if (typeof sender !== 'string' || sender.trim().length === 0) {
      return null
    }
    return sender
  }

  /**
   * Redacta una dirección de correo conservando el dominio (útil para
   * diagnosticar problemas por dominio sin exponer la identidad del prospecto
   * en logs persistentes).
   *
   * Ej.: `juan.perez@gsti.mx` → `***@gsti.mx`.
   */
  private redactEmail(value: string): string {
    if (!value || !value.includes('@')) {
      return '***'
    }
    const [, domain] = value.split('@')
    return `***@${domain}`
  }
}
