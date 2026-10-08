import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import mail from '@adonisjs/mail/services/main'
import env from '#start/env'
import { resolveMailSender } from '#helpers/resolve_mail_sender'
import { fetchTenantUsersWithModulePermission } from '#helpers/tenant_users_with_module_permission'
import { MAIL_BRAND_LOGO_URL, MAIL_BRAND_TRADE_NAME } from '#constants/mail_branding'
import {
  TRAUMATIC_EVENT_REPORT_BOARD_MODULE_PATH,
  TRAUMATIC_EVENT_REPORT_NOTIFICATION_CHANNEL,
  TRAUMATIC_EVENT_REPORT_NOTIFICATION_STATUS,
  TRAUMATIC_EVENT_REPORT_NOTIFY_MODULE_SLUG,
  TRAUMATIC_EVENT_REPORT_NOTIFY_PERMISSION,
} from '#constants/traumatic_event_report_notification'
import TraumaticEventReportNewHrMail from '#mails/traumatic_event_report_new_hr_mail'
import TraumaticEventReport from '#models/traumatic_event_report'
import TraumaticEventReportNotificationLog from '#models/traumatic_event_report_notification_log'
import TraumaticEventType from '#models/traumatic_event_type'
import Employee from '#models/employee'
import BusinessUnit from '#models/business_unit'
import SystemSettingService from '#services/system_setting_service'
import { SystemSettingResolutionError } from '../exceptions/system_setting_resolution_error.js'
import { TenantContext } from '#utils/tenant_context'

/**
 * Lista de desarrollo: fuera de producción solo estos correos salen de verdad.
 * Espejo del gate que bloquea en la política de teletrabajo. El repo duplica
 * la lista por servicio.
 */
const DEVELOPMENT_EMAIL_LIST = ['jsoto@siler-mx.com', 'wramirez@siler-mx.com', 'wilvardo@gmail.com']

/** Decide si el correo puede salir. En pruebas se sustituye por el constructor. */
export type TraumaticEventReportMailDeliveryGate = (email: string) => boolean

/** Persona a la que se intenta avisar. El helper ya la deduplicó. */
export interface TraumaticEventReportHrRecipient {
  userId: number
  email: string
}

const LOG_DISPATCH_FAILED = '[traumatic-event-report] Fallo al procesar el aviso a RH'
const LOG_SEND_FAILED = '[traumatic-event-report] Fallo al enviar el aviso a RH'
const LOG_APPEND_FAILED = '[traumatic-event-report] Fallo al registrar el aviso'

function defaultDeliveryGate(email: string): boolean {
  if (env.get('NODE_ENV') === 'production') return true
  const normalized = email.trim().toLowerCase()
  return DEVELOPMENT_EMAIL_LIST.some((allowed) => allowed.toLowerCase() === normalized)
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0
}

/** Deja el dominio y oculta el buzón. Sin arroba no hay dominio que mostrar. */
function redactEmail(value: string): string {
  if (!value.includes('@')) return '***'
  const domain = value.split('@')[1] ?? ''
  return domain === '' ? '***' : `***@${domain}`
}

function formatOccurredAt(value: DateTime): string {
  const iso = value.toISODate()
  if (!iso) return ''
  const parsed = DateTime.fromISO(iso)
  return parsed.isValid ? parsed.toFormat('dd/MM/yyyy') : ''
}

function workerDisplayName(employee: Employee): string {
  return [employee.employeeFirstName, employee.employeeLastName, employee.employeeSecondLastName]
    .map((part) => (part ?? '').trim())
    .filter((part) => part !== '')
    .join(' ')
}

function boardUrl(): string {
  const base = String(env.get('BACKOFFICE_URL') ?? '').replace(/\/$/, '')
  return `${base}${TRAUMATIC_EVENT_REPORT_BOARD_MODULE_PATH}`
}

/**
 * Avisa por correo a quien tiene "Editar eventos traumáticos" en la empresa
 * del reporte, cuando el origen es el trabajador. Nunca lanza: un fallo del
 * correo no revierte el reporte.
 */
export default class TraumaticEventReportNotificationService {
  constructor(
    private readonly isDeliveryAllowed: TraumaticEventReportMailDeliveryGate = defaultDeliveryGate
  ) {}

  /**
   * Procesa el aviso de un reporte ya guardado. Ids inválidos, empresa ajena
   * y origen distinto de empleado terminan sin correo y sin constancia.
   *
   * @param reportId Identificador del reporte recién guardado.
   * @param businessUnitId Empresa con la que se invocó el aviso.
   */
  async notifyOnNewEmployeeReport(reportId: number, businessUnitId: number): Promise<void> {
    if (!isPositiveInteger(reportId) || !isPositiveInteger(businessUnitId)) {
      logger.warn(
        {
          traumaticEventReportId: reportId,
          businessUnitId,
          reason: 'identificador-invalido',
        },
        '[traumatic-event-report] Aviso omitido por identificador inválido'
      )
      return
    }

    try {
      await TenantContext.run([businessUnitId], () => this.dispatch(reportId, businessUnitId))
    } catch (err: unknown) {
      logger.error(
        { err, traumaticEventReportId: reportId, businessUnitId },
        LOG_DISPATCH_FAILED
      )
    }
  }

  private async dispatch(reportId: number, businessUnitId: number): Promise<void> {
    const report = await TraumaticEventReport.query()
      .select(
        'traumatic_event_report_id',
        'employee_id',
        'business_unit_id',
        'traumatic_event_type_id',
        'traumatic_event_report_occurred_at',
        'traumatic_event_report_origin'
      )
      .where('traumatic_event_report_id', reportId)
      .where('traumatic_event_report_origin', 'employee')
      .first()

    if (!report || report.businessUnitId !== businessUnitId) {
      logger.warn(
        {
          traumaticEventReportId: reportId,
          businessUnitId,
          reason: 'reporte-ajeno-o-inexistente',
        },
        '[traumatic-event-report] Aviso omitido: el reporte no pertenece a la empresa'
      )
      return
    }

    const companyId = report.businessUnitId
    const employee = await Employee.query()
      .select('employee_id', 'employee_first_name', 'employee_last_name', 'employee_second_last_name')
      .where('employee_id', report.employeeId)
      .first()
    const eventType = await TraumaticEventType.query()
      .select('traumatic_event_type_id', 'traumatic_event_type_name')
      .where('traumatic_event_type_id', report.traumaticEventTypeId)
      .first()

    if (!employee || !eventType) {
      logger.warn(
        {
          traumaticEventReportId: report.traumaticEventReportId,
          businessUnitId: companyId,
          reason: 'reporte-incompleto',
        },
        '[traumatic-event-report] Aviso omitido: faltan el trabajador o el tipo de evento'
      )
      return
    }

    const recipients = await fetchTenantUsersWithModulePermission({
      businessUnitId: companyId,
      moduleSlug: TRAUMATIC_EVENT_REPORT_NOTIFY_MODULE_SLUG,
      permissionSlug: TRAUMATIC_EVENT_REPORT_NOTIFY_PERMISSION,
    })

    if (recipients.length === 0) {
      logger.info(
        {
          traumaticEventReportId: report.traumaticEventReportId,
          businessUnitId: companyId,
        },
        '[traumatic-event-report] No hay usuarios con permiso para avisar'
      )
      return
    }

    const alreadySent = await TraumaticEventReportNotificationLog.query()
      .where('traumatic_event_report_id', report.traumaticEventReportId)
      .where(
        'traumatic_event_report_notification_log_status',
        TRAUMATIC_EVENT_REPORT_NOTIFICATION_STATUS.SENT
      )
      .select('recipient_user_id')

    const sentUserIds = new Set(alreadySent.map((row) => row.recipientUserId))
    const pending = recipients.filter((recipient) => !sentUserIds.has(recipient.userId))
    if (pending.length === 0) return

    const companyName = await this.resolveCompanyName(companyId)
    const from = resolveMailSender()
    const occurredAt = formatOccurredAt(report.traumaticEventReportOccurredAt)
    const url = boardUrl()

    for (const recipient of pending) {
      await this.deliverOne({
        reportId: report.traumaticEventReportId,
        businessUnitId: companyId,
        recipient,
        from,
        companyName,
        workerName: workerDisplayName(employee),
        eventTypeName: eventType.traumaticEventTypeName,
        occurredAt,
        boardUrl: url,
      })
    }
  }

  private async deliverOne(input: {
    reportId: number
    businessUnitId: number
    recipient: TraumaticEventReportHrRecipient
    from: string
    companyName: string
    workerName: string
    eventTypeName: string
    occurredAt: string
    boardUrl: string
  }): Promise<void> {
    const { reportId, businessUnitId, recipient } = input
    try {
      if (!this.isDeliveryAllowed(recipient.email)) {
        logger.info(
          {
            traumaticEventReportId: reportId,
            businessUnitId,
            recipientUserId: recipient.userId,
            status: TRAUMATIC_EVENT_REPORT_NOTIFICATION_STATUS.SENT,
          },
          `[traumatic-event-report] Entrega simulada a ${redactEmail(recipient.email)}`
        )
        await this.appendLog(reportId, businessUnitId, recipient.userId, 'sent')
        return
      }

      await mail.send(
        new TraumaticEventReportNewHrMail({
          to: recipient.email,
          from: input.from,
          language: 'es',
          branding: {
            tradeName: MAIL_BRAND_TRADE_NAME,
            backgroundImageLogo: MAIL_BRAND_LOGO_URL,
          },
          companyName: input.companyName,
          workerName: input.workerName,
          eventTypeName: input.eventTypeName,
          occurredAt: input.occurredAt,
          boardUrl: input.boardUrl,
        })
      )
      await this.appendLog(reportId, businessUnitId, recipient.userId, 'sent')
    } catch (err: unknown) {
      logger.error(
        { err, traumaticEventReportId: reportId, recipientUserId: recipient.userId },
        LOG_SEND_FAILED
      )
      try {
        await this.appendLog(reportId, businessUnitId, recipient.userId, 'failed')
      } catch (logErr: unknown) {
        logger.error(
          { err: logErr, traumaticEventReportId: reportId, recipientUserId: recipient.userId },
          LOG_APPEND_FAILED
        )
      }
    }
  }

  private async appendLog(
    reportId: number,
    businessUnitId: number,
    recipientUserId: number,
    status: 'sent' | 'failed'
  ): Promise<void> {
    await TraumaticEventReportNotificationLog.create({
      traumaticEventReportId: reportId,
      businessUnitId,
      recipientUserId,
      traumaticEventReportNotificationLogChannel: TRAUMATIC_EVENT_REPORT_NOTIFICATION_CHANNEL.EMAIL,
      traumaticEventReportNotificationLogStatus: status,
    })
  }

  /**
   * Nombre comercial del ajuste de la empresa. Si no hay ajuste o el nombre
   * viene vacío, usa el nombre de la unidad de negocio. No lee el logotipo.
   */
  private async resolveCompanyName(businessUnitId: number): Promise<string> {
    try {
      const setting = await new SystemSettingService().resolveByBusinessUnitId(businessUnitId)
      const tradeName = setting.systemSettingTradeName?.trim() ?? ''
      if (tradeName !== '') return tradeName
    } catch (err: unknown) {
      if (!(err instanceof SystemSettingResolutionError)) throw err
    }

    const unit = await BusinessUnit.query()
      .where('business_unit_id', businessUnitId)
      .select('business_unit_id', 'business_unit_name')
      .first()
    return unit?.businessUnitName?.trim() || ''
  }
}
