import { BaseMail } from '@adonisjs/mail'
import i18nManager from '@adonisjs/i18n/services/main'

/**
 * Branding inyectado por `AuthMailService`. Mantiene la consistencia visual
 * con `SignupOtpMail` y con el resto de correos transaccionales del sistema.
 */
export interface WelcomeMailBranding {
  tradeName: string
  backgroundImageLogo: string
  favicon: string | null
}

export interface WelcomeMailParams {
  to: string
  from: string
  firstName: string
  businessUnitName: string
  language: 'es' | 'en'
  branding: WelcomeMailBranding
  backofficeUrl: string
}

/**
 * Correo de bienvenida tras completar el wizard de signup self-service.
 *
 * Sigue el patrón `BaseMail` para facilitar los tests con `mail.fake()` y
 * mantener la separación de responsabilidades:
 *
 * - `AuthMailService` resuelve branding, idioma y configuración.
 * - Esta clase compone el mensaje (subject + html).
 *
 * El cuerpo del correo NO incluye credenciales ni token de sesión: solo nombre
 * del usuario, nombre de la empresa creada y un CTA al backoffice, conforme al
 * requisito de seguridad de la historia.
 */
export default class WelcomeMail extends BaseMail {
  constructor(private readonly params: WelcomeMailParams) {
    super()
  }

  prepare() {
    const { to, from, firstName, businessUnitName, language, branding, backofficeUrl } = this.params

    const isWhiteLabel = false

    if (!isWhiteLabel) {
      branding.tradeName = 'Valanserh'
      branding.backgroundImageLogo = 'https://gsti-assets.sfo3.cdn.digitaloceanspaces.com/valanserh/logos/logotipo-min.png'
    }

    const i18n = i18nManager.locale(language)
    const subject = i18n.formatMessage('auth.signup.welcome.subject', {
      tradeName: branding.tradeName,
      firstName,
    })
    const preheader = i18n.formatMessage('auth.signup.welcome.preheader')
    const greeting = i18n.formatMessage('auth.signup.welcome.greeting', { firstName })
    // La empresa salió del texto: el diseño la muestra en la ficha de datos.
    const intro = i18n.formatMessage('auth.signup.welcome.intro', {
      tradeName: branding.tradeName,
    })
    const magicLinkNote = i18n.formatMessage('auth.signup.welcome.magic_link_note')
    const cta = i18n.formatMessage('auth.signup.welcome.cta', { tradeName: branding.tradeName })
    const emailLabel = i18n.formatMessage('auth.signup.welcome.email_label')
    const companyLabel = i18n.formatMessage('auth.signup.welcome.company_label')
    const tipsTitle = i18n.formatMessage('auth.signup.welcome.tips_title')
    const tipOne = i18n.formatMessage('auth.signup.welcome.tip_one')
    const tipTwo = i18n.formatMessage('auth.signup.welcome.tip_two')
    const tipThree = i18n.formatMessage('auth.signup.welcome.tip_three')
    const support = i18n.formatMessage('auth.signup.welcome.support')
    const footer = i18n.formatMessage('auth.signup.welcome.footer', {
      tradeName: branding.tradeName,
    })

    this.message.to(to).from(from, branding.tradeName).subject(subject).htmlView('emails/welcome', {
      tradeName: branding.tradeName,
      backgroundImageLogo: branding.backgroundImageLogo,
      favicon: branding.favicon,
      firstName,
      businessUnitName,
      backofficeUrl,
      email: to,
      subject,
      preheader,
      greeting,
      intro,
      magicLinkNote,
      cta,
      emailLabel,
      companyLabel,
      accountEmail: to,
      tipsTitle,
      tipOne,
      tipTwo,
      tipThree,
      support,
      footer,
    })
  }
}
