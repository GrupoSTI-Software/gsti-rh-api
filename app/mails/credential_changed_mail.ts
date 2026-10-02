import { BaseMail } from '@adonisjs/mail'
import i18nManager from '@adonisjs/i18n/services/main'
import { DateTime } from 'luxon'
import { resolveMailLocale, type MailLocale } from '#constants/mail_locale'
import { MAIL_TIME_ZONE } from '#constants/mail_branding'

export interface CredentialChangedMailBranding {
  tradeName: string
  backgroundImageLogo: string
}

export interface CredentialChangedMailParams {
  readonly to: string
  readonly from: string
  readonly firstName: string
  readonly variant: 'previous' | 'current'
  readonly newEmailDisplay: string
  readonly changedAt: string
  readonly loginUrl: string
  readonly language: 'es' | 'en'
  readonly branding: CredentialChangedMailBranding
}

export default class CredentialChangedMail extends BaseMail {
  constructor(private readonly params: CredentialChangedMailParams) {
    super()
  }

  prepare() {
    const {
      to,
      from,
      firstName,
      variant,
      newEmailDisplay,
      changedAt,
      loginUrl,
      language,
      branding,
    } = this.params
    const isPreviousRecipient = variant === 'previous'
    const locale = resolveMailLocale(language)
    const i18n = i18nManager.locale(locale)
    const changedAtLabel = formatChangedAt(changedAt, locale)
    const subject = i18n.formatMessage(
      isPreviousRecipient
        ? 'auth.credential_changed.subject_previous'
        : 'auth.credential_changed.subject_current',
      { tradeName: branding.tradeName }
    )
    this.message
      .to(to)
      .from(from, branding.tradeName)
      .subject(subject)
      .htmlView('emails/credential_changed', {
        tradeName: branding.tradeName,
        backgroundImageLogo: branding.backgroundImageLogo,
        firstName,
        isPreviousRecipient,
        newEmailDisplay,
        changedAt: changedAtLabel,
        loginUrl,
        subject,
        preheader: i18n.formatMessage('auth.credential_changed.preheader'),
        titlePrevious: i18n.formatMessage('auth.credential_changed.title_previous'),
        titleCurrent: i18n.formatMessage('auth.credential_changed.title_current'),
        greetingLead: i18n.formatMessage('auth.credential_changed.greeting_lead', { firstName }),
        bodyPrevious: i18n.formatMessage('auth.credential_changed.body_previous', {
          tradeName: branding.tradeName,
          changedAt: changedAtLabel,
        }),
        bodyCurrent: i18n.formatMessage('auth.credential_changed.body_current', {
          tradeName: branding.tradeName,
        }),
        newEmailLabel: i18n.formatMessage('auth.credential_changed.new_email_label'),
        passwordUnchangedNotice: i18n.formatMessage(
          'auth.credential_changed.password_unchanged_notice'
        ),
        sessionsClosedNotice: i18n.formatMessage('auth.credential_changed.sessions_closed_notice'),
        alertTitle: i18n.formatMessage('auth.credential_changed.alert_title'),
        alertBody: i18n.formatMessage('auth.credential_changed.alert_body'),
        cta: i18n.formatMessage('auth.credential_changed.cta'),
        ctaCaption: i18n.formatMessage('auth.credential_changed.cta_caption'),
        supportLinkCaption: i18n.formatMessage('auth.credential_changed.support_link_caption'),
        footer: i18n.formatMessage('auth.credential_changed.footer', {
          tradeName: branding.tradeName,
        }),
      })
  }
}

/** Fecha en la zona de los clientes y con am/pm en minúsculas, regla del producto. */
function formatChangedAt(iso: string, locale: MailLocale): string {
  const moment = DateTime.fromISO(iso, { zone: 'utc' }).setZone(MAIL_TIME_ZONE).setLocale(locale)
  if (!moment.isValid) return iso
  const pattern = locale === 'en' ? 'LLLL d, yyyy, h:mm' : "d 'de' LLLL 'de' yyyy, h:mm"
  return `${moment.toFormat(pattern)} ${moment.hour < 12 ? 'am' : 'pm'}`
}
