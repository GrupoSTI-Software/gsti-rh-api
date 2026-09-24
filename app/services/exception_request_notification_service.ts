import logger from '@adonisjs/core/services/logger'
import mail from '@adonisjs/mail/services/main'
import env from '#start/env'
import Employee from '#models/employee'
import ExceptionRequest from '#models/exception_request'
import ExceptionRequestAttachment from '#models/exception_request_attachment'
import SystemSetting from '#models/system_setting'
import User from '#models/user'
import ExceptionRequestApproverResolverService from '#services/exception_request_approver_resolver_service'
import ExceptionRequestNewApproverMail, {
  type ExceptionRequestMailBranding,
} from '#mails/exception_request_new_approver_mail'
import ExceptionRequestResolvedEmployeeMail, {
  type ExceptionRequestResolvedStatus,
} from '#mails/exception_request_resolved_employee_mail'
import { EXCEPTION_REQUEST_BOARD_MODULE_PATH } from '#constants/exception_request_notification'
import { formatRequestedPeriodEs } from '#helpers/format_requested_period_es'
import { resolveMailSender } from '#helpers/resolve_mail_sender'

/** Backoffice por omisión cuando el entorno no declara el suyo. */
const DEFAULT_BACKOFFICE_URL = 'http://127.0.0.1:3000'

/** Logotipo de la plataforma para las empresas que no configuraron el suyo. */
const DEFAULT_MAIL_LOGO =
  'https://gsti-assets.sfo3.cdn.digitaloceanspaces.com/valanserh/logos/logotipo-min.png'

/** Datos de una resolución que hay que comunicarle al colaborador. */
export interface NotifyResolutionParams {
  /** Solicitudes resueltas en ESTA operación, todas con la misma resolución. */
  exceptionRequests: ExceptionRequest[]
  /** Resolución aplicada. */
  status: ExceptionRequestResolvedStatus
  /** Nota con la que la empresa resolvió; cadena vacía si no hay. */
  resolutionNote: string
}

/**
 * Correos del ciclo de una solicitud de permiso.
 *
 * Son dos avisos y ninguno decide nada: uno le dice al aprobador que hay algo
 * que atender, el otro le dice al colaborador qué se resolvió. Un fallo de
 * correo nunca revierte el alta ni la resolución — la decisión ya está tomada y
 * registrada, y dejarla a medias por el buzón sería peor.
 */
export default class ExceptionRequestNotificationService {
  private readonly approverResolver = new ExceptionRequestApproverResolverService()

  /**
   * Avisa del permiso recién pedido a quien le toca atenderlo.
   *
   * Sale UN correo por petición, no uno por día: el lote es justamente lo que
   * permite saber que esas filas son la misma petición.
   *
   * @param batchId - Lote creado por el alta.
   */
  async notifyBatchCreated(batchId: string): Promise<void> {
    try {
      const solicitudes = await ExceptionRequest.query()
        .where('exception_request_batch_id', batchId)
        .preload('exceptionType')
        .orderBy('requested_date', 'asc')

      if (solicitudes.length === 0) {
        return
      }

      const empleado = await Employee.query()
        .where('employee_id', solicitudes[0].employeeId)
        .whereNull('employee_deleted_at')
        .preload('person')
        .first()

      if (!empleado) {
        return
      }

      const audiencia = await this.approverResolver.resolveForEmployee(empleado)

      if (!audiencia) {
        // Sin nadie a quien avisarle, la solicitud queda registrada igual: se
        // atiende desde el backoffice. Se deja rastro porque es un hueco de
        // configuración del cliente, no un error del sistema.
        logger.warn('[exception-request-notification] Sin destinatarios en la cadena de aviso', {
          batchId,
          employeeId: empleado.employeeId,
        })
        return
      }

      const remitente = resolveMailSender()

      if (!remitente) {
        return
      }

      const branding = await this.resolveBranding(empleado.businessUnitId)
      const periodo = formatRequestedPeriodEs(
        solicitudes.map((solicitud) => solicitud.requestedDate)
      )
      const nombreEmpleado = this.employeeNameOf(empleado)
      const tieneAdjunto = await this.hasAttachments(
        solicitudes.map((solicitud) => solicitud.exceptionRequestId)
      )

      for (const destinatario of audiencia.recipients) {
        try {
          await mail.send(
            new ExceptionRequestNewApproverMail({
              to: destinatario.email,
              from: remitente,
              language: 'es',
              branding,
              approverName: destinatario.fullName,
              employeeName: nombreEmpleado,
              exceptionTypeName: solicitudes[0].exceptionType?.exceptionTypeTypeName ?? '',
              periodLabel: periodo,
              daysCount: solicitudes.length,
              reason: `${solicitudes[0].exceptionRequestDescription ?? ''}`.trim(),
              hasAttachment: tieneAdjunto,
              boardUrl: this.buildBoardUrl(),
            })
          )
        } catch (error: unknown) {
          logger.error('[exception-request-notification] No se pudo avisar al aprobador', {
            batchId,
            link: audiencia.link,
            emailKind: destinatario.emailKind,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    } catch (error: unknown) {
      logger.error('[exception-request-notification] Error inesperado al avisar del alta', {
        batchId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Le comunica a cada colaborador lo que se resolvió en esta operación.
   *
   * El correo cubre solo los días de ESTA decisión. Una petición de tres días
   * con dos autorizados y uno rechazado produce dos correos, cada uno con sus
   * días: decirle que "su permiso fue autorizado" sería falso.
   *
   * Se agrupa por colaborador porque la resolución en lote del backoffice es
   * una selección libre de solicitudes y nada impide que sean de dos personas.
   *
   * @param params - Solicitudes resueltas, resolución y nota.
   */
  async notifyResolution(params: NotifyResolutionParams): Promise<void> {
    const { exceptionRequests, status, resolutionNote } = params

    try {
      if (exceptionRequests.length === 0) {
        return
      }

      const solicitudes = await ExceptionRequest.query()
        .whereIn(
          'exception_request_id',
          exceptionRequests.map((solicitud) => solicitud.exceptionRequestId)
        )
        .preload('exceptionType')
        .orderBy('requested_date', 'asc')

      const porColaborador = new Map<number, ExceptionRequest[]>()

      for (const solicitud of solicitudes) {
        const grupo = porColaborador.get(solicitud.employeeId) ?? []
        grupo.push(solicitud)
        porColaborador.set(solicitud.employeeId, grupo)
      }

      for (const [employeeId, grupo] of porColaborador) {
        await this.sendResolutionTo({
          employeeId,
          exceptionRequests: grupo,
          status,
          resolutionNote: resolutionNote.trim(),
        })
      }
    } catch (error: unknown) {
      logger.error('[exception-request-notification] Error inesperado al avisar la resolución', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /** Manda a un colaborador el aviso de sus días resueltos en esta operación. */
  private async sendResolutionTo(params: {
    employeeId: number
    exceptionRequests: ExceptionRequest[]
    status: ExceptionRequestResolvedStatus
    resolutionNote: string
  }): Promise<void> {
    const { employeeId, exceptionRequests, status, resolutionNote } = params

    try {
      const empleado = await Employee.query()
        .where('employee_id', employeeId)
        .whereNull('employee_deleted_at')
        .preload('person')
        .first()

      if (!empleado) {
        return
      }

      const autor = await User.query()
        .where('user_id', exceptionRequests[0].userId)
        .whereNull('user_deleted_at')
        .first()

      const destinatario = await this.approverResolver.resolveEmployeeRecipient(empleado, autor)

      if (!destinatario) {
        logger.warn('[exception-request-notification] El colaborador no tiene correo capturado', {
          employeeId,
        })
        return
      }

      const remitente = resolveMailSender()

      if (!remitente) {
        return
      }

      await mail.send(
        new ExceptionRequestResolvedEmployeeMail({
          to: destinatario.email,
          from: remitente,
          language: 'es',
          branding: await this.resolveBranding(empleado.businessUnitId),
          employeeName: this.employeeNameOf(empleado),
          status,
          exceptionTypeName: exceptionRequests[0].exceptionType?.exceptionTypeTypeName ?? '',
          periodLabel: formatRequestedPeriodEs(
            exceptionRequests.map((solicitud) => solicitud.requestedDate)
          ),
          daysCount: exceptionRequests.length,
          resolutionNote,
        })
      )
    } catch (error: unknown) {
      logger.error('[exception-request-notification] No se pudo avisar la resolución', {
        employeeId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /** Verdadero si alguna de las solicitudes trae comprobante vivo. */
  private async hasAttachments(exceptionRequestIds: number[]): Promise<boolean> {
    if (exceptionRequestIds.length === 0) {
      return false
    }

    const adjunto = await ExceptionRequestAttachment.query()
      .whereIn('exception_request_id', exceptionRequestIds)
      .whereNull('exception_request_attachment_deleted_at')
      .first()

    return adjunto !== null
  }

  /** Nombre completo del colaborador para el saludo y el cuerpo del correo. */
  private employeeNameOf(empleado: Employee): string {
    const persona = empleado.person

    if (!persona) {
      return ''
    }

    return [persona.personFirstname, persona.personLastname, persona.personSecondLastname]
      .map((parte) => `${parte ?? ''}`.trim())
      .filter((parte) => parte.length > 0)
      .join(' ')
  }

  /** Marca con la que sale el correo: la de la empresa del colaborador. */
  private async resolveBranding(businessUnitId: number): Promise<ExceptionRequestMailBranding> {
    const configuracion = await SystemSetting.query()
      .whereNull('system_setting_deleted_at')
      .where('system_setting_active', 1)
      .where('business_unit_id', businessUnitId)
      .first()

    if (configuracion) {
      return {
        tradeName: configuracion.systemSettingTradeName || 'Valanserh',
        backgroundImageLogo: configuracion.systemSettingLogo || DEFAULT_MAIL_LOGO,
      }
    }

    // Sin configuración propia, la marca base de la plataforma: nunca la de otra
    // empresa.
    const base = await SystemSetting.query()
      .whereNull('system_setting_deleted_at')
      .where('system_setting_active', 1)
      .whereNull('business_unit_id')
      .first()

    return {
      tradeName: base?.systemSettingTradeName || 'Valanserh',
      backgroundImageLogo: base?.systemSettingLogo || DEFAULT_MAIL_LOGO,
    }
  }

  /** Enlace al módulo de solicitudes del backoffice. */
  private buildBoardUrl(): string {
    const base = (env.get('BACKOFFICE_URL') ?? DEFAULT_BACKOFFICE_URL).replace(/\/$/, '')

    return `${base}${EXCEPTION_REQUEST_BOARD_MODULE_PATH}`
  }
}
