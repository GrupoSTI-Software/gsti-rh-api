import { BaseMail } from '@adonisjs/mail'
import i18nManager from '@adonisjs/i18n/services/main'

export interface MagicLinkMailBranding {
  tradeName: string
  backgroundImageLogo: string
  favicon: string | null
}

export interface MagicLinkMailParams {
  to: string
  from: string
  firstName: string
  magicLinkUrl: string
  language: 'es' | 'en'
  branding: MagicLinkMailBranding
  validityMinutes: number
}

/**
 * Correo del flujo de magic link para acceso sin contraseña al backoffice.
 */
export default class MagicLinkMail extends BaseMail {
  constructor(private readonly params: MagicLinkMailParams) {
    super()
  }

  prepare() {
    const { to, from, firstName, magicLinkUrl, language, branding, validityMinutes } = this.params

    const isWhiteLabel = false

    if (!isWhiteLabel) {
      branding.tradeName = 'Valanserh'
      branding.backgroundImageLogo =
        'https://gsti-assets.sfo3.cdn.digitaloceanspaces.com/valanserh/logos/logotipo-min.png'
    }

    const i18n = i18nManager.locale(language)
    const subject = i18n.formatMessage('auth.magic_link.subject', { tradeName: branding.tradeName })
    const preheader = i18n.formatMessage('auth.magic_link.preheader')
    const greeting = i18n.formatMessage('auth.magic_link.greeting', { firstName })
    const intro = i18n.formatMessage('auth.magic_link.intro', { tradeName: branding.tradeName })
    const cta = i18n.formatMessage('auth.magic_link.cta')
    const validity = i18n.formatMessage('auth.magic_link.validity', { minutes: validityMinutes })
    const ignoreNotice = i18n.formatMessage('auth.magic_link.ignore_notice')
    const footer = i18n.formatMessage('auth.magic_link.footer', { tradeName: branding.tradeName })

    this.message
      .to(to)
      .from(from, branding.tradeName)
      .subject(subject)
      .htmlView('emails/magic_link', {
        tradeName: branding.tradeName,
        backgroundImageLogo: branding.backgroundImageLogo,
        favicon: branding.favicon,
        magicLinkUrl,
        firstName,
        subject,
        preheader,
        greeting,
        intro,
        cta,
        validity,
        ignoreNotice,
        footer,
      })
  }
}
