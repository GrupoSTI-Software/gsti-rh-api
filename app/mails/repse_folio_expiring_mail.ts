import { BaseMail } from '@adonisjs/mail'
import i18nManager from '@adonisjs/i18n/services/main'
import { resolveMailLocale } from '#constants/mail_locale'
import type { RepseFolioAvisoTipoValue } from '#constants/repse_folio_aviso'
import { REPSE_FOLIO_AVISO_TIPO } from '#constants/repse_folio_aviso'

/**
 * Una fila de la tabla del correo (un aviso por registro/evento).
 * Solo expone folio, tipo, fecha y días restantes (mínima exposición).
 */
export interface RepseFolioExpiringMailRow {
  folio: string
  tipo: RepseFolioAvisoTipoValue
  /** Fecha límite en formato `YYYY-MM-DD`. */
  dueDateIso: string
  daysLeft: number
}

export interface RepseFolioExpiringMailParams {
  to: string
  bcc?: string[]
  from: string
  language: 'es' | 'en'
  tradeName: string
  sidebarColor: string
  rows: RepseFolioExpiringMailRow[]
}

/**
 * Correo masivo a cumplimiento con avisos de vigencia del folio REPSE
 * (renovación trienal e informativas cuatrimestrales).
 *
 * Sigue el patrón `BaseMail` + `lactation_expiring.edge`: composición del
 * HTML 100% en el mailer (la vista Edge sólo recibe strings ya traducidos).
 */
export default class RepseFolioExpiringMail extends BaseMail {
  constructor(private readonly params: RepseFolioExpiringMailParams) {
    super()
  }

  prepare() {
    const { to, bcc, from, language, tradeName, sidebarColor, rows } = this.params
    // Correo siempre en español hasta el lanzamiento en inglés (mail_locale.ts).
    const i18n = i18nManager.locale(resolveMailLocale(language))

    const subject = i18n.formatMessage('repse_folio_expiring_notification.subject')
    const preheader = i18n.formatMessage('repse_folio_expiring_notification.preheader', {
      count: rows.length,
    })
    const headerSubtitle = i18n.formatMessage(
      'repse_folio_expiring_notification.header_subtitle'
    )
    const greeting = i18n.formatMessage('repse_folio_expiring_notification.greeting')
    const intro = i18n.formatMessage('repse_folio_expiring_notification.intro', {
      count: rows.length,
      tradeName,
    })
    const headerFolio = i18n.formatMessage('repse_folio_expiring_notification.table_folio')
    const headerEventType = i18n.formatMessage(
      'repse_folio_expiring_notification.table_event_type'
    )
    const headerDueDate = i18n.formatMessage('repse_folio_expiring_notification.table_due_date')
    const headerDaysLeft = i18n.formatMessage(
      'repse_folio_expiring_notification.table_days_left'
    )
    const legalNote = i18n.formatMessage('repse_folio_expiring_notification.legal_note')
    const footer = i18n.formatMessage('repse_folio_expiring_notification.footer', {
      tradeName,
    })

    const formattedRows = rows.map((r) => ({
      folio: r.folio,
      eventTypeLabel:
        r.tipo === REPSE_FOLIO_AVISO_TIPO.RENOVACION
          ? i18n.formatMessage('repse_folio_expiring_notification.event_type_renovacion')
          : i18n.formatMessage('repse_folio_expiring_notification.event_type_informativa'),
      dueDateLabel: this.formatDateDmy(r.dueDateIso, language),
      daysLeftLabel:
        r.daysLeft === 1
          ? i18n.formatMessage('repse_folio_expiring_notification.days_left_one')
          : i18n.formatMessage('repse_folio_expiring_notification.days_left_other', {
              days: r.daysLeft,
            }),
    }))

    this.message.to(to).from(from, tradeName).subject(subject)
    if (bcc && bcc.length > 0) {
      this.message.bcc(bcc)
    }

    this.message.htmlView('emails/repse_folio_expiring', {
      language,
      tradeName,
      sidebarColor,
      subject,
      preheader,
      headerSubtitle,
      greeting,
      intro,
      headerFolio,
      headerEventType,
      headerDueDate,
      headerDaysLeft,
      legalNote,
      footer,
      rows: formattedRows,
    })
  }

  private formatDateDmy(iso: string, language: 'es' | 'en'): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
    if (!match) return iso
    const [, y, m, d] = match
    return language === 'en' ? `${m}/${d}/${y}` : `${d}/${m}/${y}`
  }
}