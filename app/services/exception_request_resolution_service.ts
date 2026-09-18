import { DateTime } from 'luxon'
import { HttpContext } from '@adonisjs/core/http'
import mail from '@adonisjs/mail/services/main'
import env from '#start/env'
import Employee from '#models/employee'
import ExceptionRequest from '#models/exception_request'
import ExceptionType from '#models/exception_type'
import ShiftException from '#models/shift_exception'
import User from '#models/user'
import EmployeeService from '#services/employee_service'
import NotificationEmailService from '#services/notification_email_service'
import ShiftExceptionService from '#services/shift_exception_service'
import SystemSettingService from '#services/system_setting_service'
import { SystemSettingResolutionError } from '#exceptions/system_setting_resolution_error'
import { resolveMailSender } from '#helpers/resolve_mail_sender'
import { resolveRequestBusinessUnitId } from '#helpers/resolve_request_business_unit_id'

/** Resolución que se puede aplicar a una solicitud pendiente. */
export type ExceptionRequestResolution = 'accepted' | 'refused'

/** La solicitud quedó resuelta. */
export interface ResolutionApplied {
  ok: true
  exceptionRequest: ExceptionRequest
}

/** La solicitud no se pudo resolver; el controlador traduce esto a HTTP. */
export interface ResolutionRejected {
  ok: false
  status: number
  body: Record<string, unknown>
}

export type ResolutionResult = ResolutionApplied | ResolutionRejected

/** Datos con los que se resuelve una solicitud. */
export interface ResolveExceptionRequestParams {
  /** Contexto de la petición: de ahí salen el idioma, el usuario y la empresa. */
  ctx: HttpContext
  /** Solicitud pendiente a resolver. */
  exceptionRequest: ExceptionRequest
  /** Resolución que se aplica. */
  status: ExceptionRequestResolution
  /** Nota de la resolución; cadena vacía si no hay. */
  resolutionNote: string
}

/**
 * Resolución de una solicitud de permiso.
 *
 * Existe porque resolver es mucho más que cambiar un estatus: notifica al
 * empleado, da de alta la excepción de turno y, cuando el tipo es vacaciones,
 * consume el periodo más antiguo disponible. Ese trabajo vivía dentro de
 * `ExceptionRequestsController.updateStatus`, así que resolver en lote lo
 * habría duplicado — y dos copias de esta lógica se desincronizan a la primera
 * corrección que alguien haga en una sola de ellas.
 *
 * El servicio NO valida pertenencia ni estatus previo: eso lo hace el
 * controlador, que es quien conoce el alcance de la petición.
 */
export default class ExceptionRequestResolutionService {
  /**
   * Aplica la resolución y sus efectos.
   *
   * @param params - Contexto, solicitud, resolución y nota.
   * @returns La solicitud resuelta, o el motivo por el que no se pudo.
   */
  async resolve(params: ResolveExceptionRequestParams): Promise<ResolutionResult> {
    const { ctx, exceptionRequest, status, resolutionNote } = params
    const { auth } = ctx

    // La nota es la voz de la empresa y se guarda aparte de la descripción del
    // empleado, que es lo que él pidió con sus palabras.
    exceptionRequest.exceptionRequestStatus = status
    exceptionRequest.exceptionRequestResolutionNote = resolutionNote.length ? resolutionNote : null
    exceptionRequest.resolvedByUserId = auth.user?.userId ?? null
    exceptionRequest.exceptionRequestResolvedAt = DateTime.now()
    await exceptionRequest.save()

    await this.notifyEmployee(params)

    if (status === 'accepted') {
      const applied = await this.applyAcceptedEffects(params)
      if (!applied.ok) return applied
    }

    return { ok: true, exceptionRequest }
  }

  /**
   * Avisa al empleado del resultado.
   *
   * Un fallo de correo no revierte la resolución: la decisión ya está tomada y
   * registrada, y dejarla a medias por el buzón sería peor.
   */
  private async notifyEmployee(params: ResolveExceptionRequestParams): Promise<void> {
    const { ctx, exceptionRequest, status, resolutionNote } = params

    if (!exceptionRequest.userId) return

    const user = await User.query()
      .where('user_id', exceptionRequest.userId)
      .whereNull('user_deleted_at')
      .preload('person')
      .first()

    if (!user?.userEmail) return

    const sender = resolveMailSender()
    if (!sender) return

    let tradeName = 'BO'
    let backgroundImageLogo = `${env.get('BACKGROUND_IMAGE_LOGO')}`

    // USRH1783712837584: la ruta tiene `auth()` pero no `businessScope()`, así
    // que la empresa se resuelve desde el header y se aplica fail-closed
    // silencioso: sin configuración propia se conserva el branding por defecto
    // en vez de filtrar el de otra empresa.
    const businessUnitId = await resolveRequestBusinessUnitId(ctx)

    if (businessUnitId) {
      try {
        const systemSettingActive = await new SystemSettingService().resolveByBusinessUnitId(
          businessUnitId
        )
        if (systemSettingActive.systemSettingLogo) {
          backgroundImageLogo = systemSettingActive.systemSettingLogo
        }
        if (systemSettingActive.systemSettingTradeName) {
          tradeName = systemSettingActive.systemSettingTradeName
        }
      } catch (error) {
        if (!(error instanceof SystemSettingResolutionError)) throw error
      }
    }

    const userName = user.person
      ? `${user.person.personFirstname} ${user.person.personLastname} ${user.person.personSecondLastname}`
      : 'User'

    await mail.send((message) => {
      message
        .to(user.userEmail)
        .from(sender, tradeName)
        .subject(
          `${tradeName}, Exception Request - ${`${exceptionRequest.exceptionRequestId}`.padStart(5, '0')}`
        )
        .htmlView('emails/update_status_mail', {
          newStatus: status,
          newDescription: resolutionNote,
          userName,
          backgroundImageLogo,
        })
    })
  }

  /**
   * Efectos de aceptar: alta de la excepción de turno y consumo de vacaciones.
   *
   * @returns `ok` cuando el alta quedó hecha, o el motivo del rechazo.
   */
  private async applyAcceptedEffects(
    params: ResolveExceptionRequestParams
  ): Promise<ResolutionResult> {
    const { ctx, exceptionRequest } = params
    const { auth, request, i18n } = ctx

    const exceptionType = await ExceptionType.query()
      .whereNull('exception_type_deleted_at')
      .where('exception_type_id', exceptionRequest.exceptionTypeId)
      .first()

    const isVacation = exceptionType?.exceptionTypeSlug === 'vacation'
    let vacationSettingId: number | null = null

    if (isVacation) {
      const employee = await Employee.query()
        .whereNull('employee_deleted_at')
        .where('employee_id', exceptionRequest.employeeId)
        .first()

      if (!employee) {
        return {
          ok: false,
          status: 400,
          body: {
            type: 'error',
            title: 'Empleado no encontrado',
            message: 'No se puede aprobar la solicitud de vacaciones: empleado no encontrado.',
            data: { exceptionRequestId: exceptionRequest.exceptionRequestId },
          },
        }
      }

      const requestedDate = exceptionRequest.requestedDate
        ? DateTime.fromJSDate(new Date(exceptionRequest.requestedDate.toString())).setZone('UTC-6')
        : null

      if (!requestedDate?.isValid) {
        return {
          ok: false,
          status: 400,
          body: {
            type: 'error',
            title: 'Fecha inválida',
            message: 'La fecha solicitada no es válida.',
            data: { exceptionRequestId: exceptionRequest.exceptionRequestId },
          },
        }
      }

      const oldestPeriod = await new EmployeeService(i18n).getOldestAvailableVacationPeriod(
        employee,
        requestedDate
      )

      if (!oldestPeriod) {
        return {
          ok: false,
          status: 400,
          body: {
            type: 'error',
            title: 'Sin días de vacaciones disponibles',
            message:
              'No hay periodos de vacaciones con días disponibles para asignar. El empleado no tiene días hábiles en ningún periodo según años trabajados.',
            errorCode: 'EXCPT.REQ.APPR.001',
            data: {
              exceptionRequestId: exceptionRequest.exceptionRequestId,
              employeeId: exceptionRequest.employeeId,
            },
          },
        }
      }

      vacationSettingId = oldestPeriod.vacationSettingId
    }

    const shiftExceptionService = new ShiftExceptionService(i18n)
    const shiftException = {
      shiftExceptionId: 0,
      employeeId: exceptionRequest.employeeId,
      shiftExceptionsDescription: exceptionRequest.exceptionRequestDescription,
      shiftExceptionsDate: exceptionRequest.requestedDate
        ? DateTime.fromJSDate(new Date(exceptionRequest.requestedDate.toString()))
            .setZone('UTC')
            .toJSDate()
        : null,
      exceptionTypeId: exceptionRequest.exceptionTypeId,
      vacationSettingId,
      shiftExceptionCheckInTime: exceptionRequest.exceptionRequestCheckInTime,
      shiftExceptionCheckOutTime: exceptionRequest.exceptionRequestCheckOutTime,
    } as ShiftException

    const verifyInfo = await shiftExceptionService.verifyInfo(shiftException)

    if (verifyInfo.status !== 200) {
      return {
        ok: false,
        status: verifyInfo.status,
        body: {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...shiftException },
        },
      }
    }

    const newShiftException = await shiftExceptionService.create(shiftException)

    if (newShiftException) {
      const userId = auth.user?.userId

      if (userId) {
        const logShiftException = await shiftExceptionService.createActionLog(
          request.request.rawHeaders,
          'store'
        )
        logShiftException.user_id = userId
        logShiftException.record_current = JSON.parse(JSON.stringify(newShiftException))

        const table = isVacation ? 'log_vacations' : 'log_shift_exceptions'
        await shiftExceptionService.saveActionOnLog(logShiftException, table)
      }

      try {
        const authToken = request.header('authorization')?.replace('Bearer ', '') || ''
        await new NotificationEmailService().sendExceptionRequestNotification(
          exceptionRequest,
          authToken
        )
      } catch (notificationError) {
        // El aviso a los responsables no puede tumbar un alta ya aplicada.
        console.error(
          'ExceptionRequestResolutionService: error al enviar la notificacion',
          notificationError
        )
      }
    }

    return { ok: true, exceptionRequest }
  }
}
