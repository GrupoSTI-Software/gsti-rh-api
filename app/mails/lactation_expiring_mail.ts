import { BaseMail } from '@adonisjs/mail'
import i18nManager from '@adonisjs/i18n/services/main'
import { resolveMailLocale } from '#constants/mail_locale'
import { MAIL_BRAND_HEADER_COLOR, MAIL_BRAND_LOGO_URL, MAIL_BRAND_TRADE_NAME } from '#constants/mail_branding'

/**
 * Una fila de la tabla del correo (un periodo por vencer).
 *
 * No expone `employeeId`, ni notas internas del periodo, ni claves de
 * archivo: el correo cumple el principio de mínima exposición de la HU
 * ("sólo lo necesario: nombre de la empleada y fecha de vencimiento").
 */
export interface LactationExpiringMailRow {
  employeeName: string
  employeeCode: string | null
  /** Fin del periodo en formato `YYYY-MM-DD` (se formatea para mostrar). */
  endDateIso: string
  /** Días restantes (positivo) calculados en CDMX. */
  daysLeft: number
}

export interface LactationExpiringMailParams {
  to: string
  bcc?: string[]
  from: string
  language: 'es' | 'en'
  companyName: string
  rows: LactationExpiringMailRow[]
}

/**
 * Correo masivo a RH con la lista de periodos de lactancia cuyo fin cae
 * dentro de los próximos 30 días.
 *
 * Sigue el patrón `BaseMail` para facilitar tests con `mail.fake()` y
 * dejar la composición del HTML 100% en el mailer (la vista Edge sólo
 * recibe strings ya traducidos, sin lógica i18n adentro).
 *
 * El idioma del cuerpo se resuelve por **empresa**: cada tenant elige
 * idioma (no se mezclan idiomas en el mismo correo) usando
 * `LactationExpiringMailParams.language`.
 */
export default class LactationExpiringMail extends BaseMail {
  constructor(private readonly params: LactationExpiringMailParams) {
    super()
  }

  prepare() {
    const { to, bcc, from, language, companyName, rows } = this.params
    const tradeName = MAIL_BRAND_TRADE_NAME
    // Correo siempre en español hasta el lanzamiento en inglés (mail_locale.ts).
    const i18n = i18nManager.locale(resolveMailLocale(language))

    const subject = i18n.formatMessage(
      'employee_lactation_expiring_notification.subject',
      { companyName }
    )
    const preheader = i18n.formatMessage(
      'employee_lactation_expiring_notification.preheader',
      { count: rows.length }
    )
    const headerSubtitle = i18n.formatMessage(
      'employee_lactation_expiring_notification.header_subtitle'
    )
    const greeting = i18n.formatMessage(
      'employee_lactation_expiring_notification.greeting'
    )
    const intro = i18n.formatMessage(
      'employee_lactation_expiring_notification.intro',
      { count: rows.length, companyName }
    )
    const headerEmployee = i18n.formatMessage(
      'employee_lactation_expiring_notification.table_employee'
    )
    const headerEndDate = i18n.formatMessage(
      'employee_lactation_expiring_notification.table_end_date'
    )
    const headerDaysLeft = i18n.formatMessage(
      'employee_lactation_expiring_notification.table_days_left'
    )
    const codeLabel = i18n.formatMessage(
      'employee_lactation_expiring_notification.code_label'
    )
    const legalNote = i18n.formatMessage(
      'employee_lactation_expiring_notification.legal_note'
    )
    const footer = i18n.formatMessage(
      'employee_lactation_expiring_notification.footer',
      { tradeName }
    )

    const formattedRows = rows.map((r) => ({
      employeeName: r.employeeName,
      employeeCode: r.employeeCode,
      codeLabel,
      endDateLabel: this.formatDateDmy(r.endDateIso, language),
      daysLeftLabel:
        r.daysLeft === 1
          ? i18n.formatMessage(
              'employee_lactation_expiring_notification.days_left_one'
            )
          : i18n.formatMessage(
              'employee_lactation_expiring_notification.days_left_other',
              { days: r.daysLeft }
            ),
    }))

    this.message.to(to).from(from, MAIL_BRAND_TRADE_NAME).subject(subject)
    if (bcc && bcc.length > 0) {
      this.message.bcc(bcc)
    }

    this.message.htmlView('emails/lactation_expiring', {
      language,
      tradeName,
      headerColor: MAIL_BRAND_HEADER_COLOR,
      backgroundImageLogo: MAIL_BRAND_LOGO_URL,
      subject,
      preheader,
      headerSubtitle,
      greeting,
      intro,
      headerEmployee,
      headerEndDate,
      headerDaysLeft,
      legalNote,
      footer,
      rows: formattedRows,
    })
  }

  /**
   * Formatea una fecha ISO (`YYYY-MM-DD`) sin recurrir a `luxon` para
   * que el mailer sea autónomo: ES → `dd/MM/yyyy`, EN → `MM/dd/yyyy`.
   * Si el string no parsea, devuelve el original como salvavidas.
   */
  private formatDateDmy(iso: string, language: 'es' | 'en'): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
    if (!match) return iso
    const [, y, m, d] = match
    return language === 'en' ? `${m}/${d}/${y}` : `${d}/${m}/${y}`
  }
}
