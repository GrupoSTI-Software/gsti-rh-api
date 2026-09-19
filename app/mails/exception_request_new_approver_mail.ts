import { BaseMail } from '@adonisjs/mail'
import i18nManager from '@adonisjs/i18n/services/main'
import { resolveMailLocale, type MailLocale } from '#constants/mail_locale'

/** Marca de la empresa con la que sale el correo. */
export interface ExceptionRequestMailBranding {
  tradeName: string
  backgroundImageLogo: string
}

/** Datos del aviso al aprobador. */
export interface ExceptionRequestNewApproverMailParams {
  to: string
  from: string
  language: MailLocale
  branding: ExceptionRequestMailBranding
  /** Nombre de quien recibe; vacio si no se pudo resolver. */
  approverName: string
  /** Colaborador que pidio el permiso. */
  employeeName: string
  /** Tipo de permiso, tal como lo nombra el catalogo de la empresa. */
  exceptionTypeName: string
  /** Periodo pedido ya redactado: un dia suelto o un rango. */
  periodLabel: string
  /** Dias que cubre la peticion. */
  daysCount: number
  /** Motivo con las palabras del colaborador; vacio si no capturo ninguno. */
  reason: string
  /** Verdadero si la peticion trae comprobante. */
  hasAttachment: boolean
  /** Enlace al modulo de solicitudes del backoffice. */
  boardUrl: string
}

/**
 * Aviso de que un colaborador pidio un permiso.
 *
 * Sale UNA vez por peticion, no una por dia: un permiso de cinco dias se guarda
 * como cinco solicitudes para poder resolverse por separado, pero quien tiene
 * que enterarse lo hace de una sola cosa.
 *
 * El correo no resuelve nada ni lleva botones de autorizar o rechazar: la
 * decision se toma en el backoffice, donde queda registrada con su autor y su
 * motivo.
 */
export default class ExceptionRequestNewApproverMail extends BaseMail {
  constructor(private readonly params: ExceptionRequestNewApproverMailParams) {
    super()
  }

  prepare() {
    const {
      to,
      from,
      language,
      branding,
      approverName,
      employeeName,
      exceptionTypeName,
      periodLabel,
      daysCount,
      reason,
      hasAttachment,
      boardUrl,
    } = this.params

    // Correo siempre en español hasta el lanzamiento en inglés (mail_locale.ts).
    const i18n = i18nManager.locale(resolveMailLocale(language))
    const { tradeName, backgroundImageLogo } = branding

    const subject = i18n.formatMessage('exception_request_new_approver.subject', {
      tradeName,
      employeeName,
    })
    const preheader = i18n.formatMessage('exception_request_new_approver.preheader', {
      exceptionTypeName,
      periodLabel,
    })
    const greeting =
      approverName.length > 0
        ? i18n.formatMessage('exception_request_new_approver.greeting_named', { approverName })
        : i18n.formatMessage('exception_request_new_approver.greeting')
    const intro = i18n.formatMessage('exception_request_new_approver.intro', { employeeName })

    this.message
      .to(to)
      .from(from, tradeName)
      .subject(subject)
      .htmlView('emails/exception_request_new_approver', {
        tradeName,
        backgroundImageLogo,
        subject,
        preheader,
        greeting,
        intro,
        detailsTitle: i18n.formatMessage('exception_request_new_approver.details_title'),
        employeeLabel: i18n.formatMessage('exception_request_new_approver.employee_label'),
        employeeName,
        typeLabel: i18n.formatMessage('exception_request_new_approver.type_label'),
        exceptionTypeName,
        periodLabel: i18n.formatMessage('exception_request_new_approver.period_label'),
        periodValue: periodLabel,
        daysLabel: i18n.formatMessage('exception_request_new_approver.days_label'),
        daysValue: i18n.formatMessage('exception_request_new_approver.days_value', { daysCount }),
        reasonLabel: i18n.formatMessage('exception_request_new_approver.reason_label'),
        reasonValue:
          reason.length > 0
            ? reason
            : i18n.formatMessage('exception_request_new_approver.reason_empty'),
        attachmentNote: hasAttachment
          ? i18n.formatMessage('exception_request_new_approver.attachment_present')
          : '',
        perDayNote: i18n.formatMessage('exception_request_new_approver.per_day_note'),
        cta: i18n.formatMessage('exception_request_new_approver.cta'),
        ctaCaption: i18n.formatMessage('exception_request_new_approver.cta_caption'),
        fallbackUrl: i18n.formatMessage('exception_request_new_approver.fallback_url'),
        boardUrl,
        footer: i18n.formatMessage('exception_request_new_approver.footer', { tradeName }),
      })
  }
}
