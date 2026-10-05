import { BaseMail } from '@adonisjs/mail'
import i18nManager from '@adonisjs/i18n/services/main'
import { resolveMailLocale, type MailLocale } from '#constants/mail_locale'
import type { ExceptionRequestMailBranding } from '#mails/exception_request_new_approver_mail'

/** Resolucion que se le comunica al colaborador. */
export type ExceptionRequestResolvedStatus = 'accepted' | 'refused'

/** Datos del aviso de resolucion. */
export interface ExceptionRequestResolvedEmployeeMailParams {
  to: string
  from: string
  language: MailLocale
  branding: ExceptionRequestMailBranding
  /** Colaborador que recibe la respuesta. */
  employeeName: string
  /** Resolucion aplicada. */
  status: ExceptionRequestResolvedStatus
  /** Tipo de permiso. */
  exceptionTypeName: string
  /**
   * Dias resueltos en esta operacion, ya redactados. Son los de ESTA decision,
   * no los de toda la peticion: un permiso de tres dias puede quedar con dos
   * autorizados y uno rechazado, y cada resolucion se avisa con lo suyo.
   */
  periodLabel: string
  /** Dias que cubre esta resolucion. */
  daysCount: number
  /** Nota con la que la empresa resolvio; vacia si no se capturo. */
  resolutionNote: string
}

/**
 * Respuesta de la empresa a un permiso pedido.
 *
 * Nunca habla de "tu solicitud" en singular cuando la peticion tenia varios
 * dias: informa exactamente que dias quedaron autorizados o rechazados en esta
 * decision. Decirle a alguien que su permiso fue autorizado cuando le
 * autorizaron dos de tres dias es peor que no avisarle.
 */
export default class ExceptionRequestResolvedEmployeeMail extends BaseMail {
  constructor(private readonly params: ExceptionRequestResolvedEmployeeMailParams) {
    super()
  }

  prepare() {
    const {
      to,
      from,
      language,
      branding,
      employeeName,
      status,
      exceptionTypeName,
      periodLabel,
      daysCount,
      resolutionNote,
    } = this.params

    // Correo siempre en español hasta el lanzamiento en inglés (mail_locale.ts).
    const i18n = i18nManager.locale(resolveMailLocale(language))
    const { tradeName, backgroundImageLogo } = branding
    const aceptada = status === 'accepted'
    const raiz = aceptada
      ? 'exception_request_resolved_employee.accepted'
      : 'exception_request_resolved_employee.refused'

    const subject = i18n.formatMessage(`${raiz}.subject`, { tradeName, daysCount })

    this.message
      .to(to)
      .from(from, tradeName)
      .subject(subject)
      .htmlView('emails/exception_request_resolved_employee', {
        tradeName,
        backgroundImageLogo,
        subject,
        preheader: i18n.formatMessage(`${raiz}.preheader`, { periodLabel }),
        greeting:
          employeeName.length > 0
            ? i18n.formatMessage('exception_request_resolved_employee.greeting_named', {
                employeeName,
              })
            : i18n.formatMessage('exception_request_resolved_employee.greeting'),
        intro: i18n.formatMessage(`${raiz}.intro`, { daysCount }),
        // El color del estado lo decide la plantilla: aqui solo se dice cual es.
        isAccepted: aceptada,
        statusLabel: i18n.formatMessage(`${raiz}.status_label`),
        typeLabel: i18n.formatMessage('exception_request_resolved_employee.type_label'),
        exceptionTypeName,
        periodLabel: i18n.formatMessage('exception_request_resolved_employee.period_label'),
        periodValue: periodLabel,
        noteLabel: i18n.formatMessage(`${raiz}.note_label`),
        noteValue:
          resolutionNote.length > 0
            ? resolutionNote
            : i18n.formatMessage('exception_request_resolved_employee.note_empty'),
        partialNote: i18n.formatMessage('exception_request_resolved_employee.partial_note'),
        appNote: i18n.formatMessage('exception_request_resolved_employee.app_note'),
        footer: i18n.formatMessage('exception_request_resolved_employee.footer', { tradeName }),
      })
  }
}
