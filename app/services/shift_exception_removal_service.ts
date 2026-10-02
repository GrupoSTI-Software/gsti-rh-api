import { DateTime } from 'luxon'
import type { I18n } from '@adonisjs/i18n'
import ExceptionRequest from '#models/exception_request'
import ExceptionType from '#models/exception_type'
import type ShiftException from '#models/shift_exception'
import VacationAuthorizationSignature from '#models/vacation_authorization_signature'
import ShiftExceptionService from '#services/shift_exception_service'

export interface RemoveShiftExceptionInput {
  shiftException: ShiftException
  actorUserId: number | null
  /** Cabeceras crudas de la peticion, para la bitacora. */
  rawHeaders: string[]
  /** Motivo de la cancelacion; `null` cuando se borra sin motivo (flujo viejo). */
  reason: string | null
  i18n: I18n
  now?: DateTime
}

/**
 * Retira un dia de excepcion ya registrado.
 *
 * Es lo que hacia `DELETE /shift-exception/:id`, sacado a un servicio para que
 * la cancelacion de vacaciones desde la ficha del empleado haga exactamente lo
 * mismo: baja logica del dia, baja de la solicitud aceptada de la que salio,
 * recalculo de asistencia y bitacora. Lo unico nuevo es que el dia guarda quien
 * lo cancelo, cuando y por que, para poder mostrarlo como cancelado en vez de
 * desaparecerlo.
 *
 * No valida permisos ni alcance: eso lo hace quien llama.
 */
export default class ShiftExceptionRemovalService {
  async remove(input: RemoveShiftExceptionInput): Promise<ShiftException> {
    const { shiftException } = input
    const now = input.now ?? DateTime.now()

    await this.retireAcceptedRequest(shiftException)

    shiftException.shiftExceptionCancelledByUserId = input.actorUserId
    shiftException.shiftExceptionCancelledAt = now
    shiftException.shiftExceptionCancelReason = input.reason
    await shiftException.save()
    await shiftException.delete()

    const shiftExceptionService = new ShiftExceptionService(input.i18n)
    const exceptionDate = shiftException.shiftExceptionsDate
    const date = typeof exceptionDate === 'string' ? new Date(exceptionDate) : exceptionDate
    await shiftExceptionService.updateAssistCalendar(shiftException.employeeId, date)

    if (input.actorUserId) {
      const log = await shiftExceptionService.createActionLog(input.rawHeaders, 'delete')
      log.user_id = input.actorUserId
      log.record_current = JSON.parse(JSON.stringify(shiftException))
      const table = (await this.isVacation(shiftException)) ? 'log_vacations' : 'log_shift_exceptions'
      await shiftExceptionService.saveActionOnLog(log, table)
    }

    return shiftException
  }

  /**
   * La solicitud aceptada de la que salio el dia deja de estar vigente.
   *
   * Se busca por el vinculo directo y, para los dias anteriores a el, por la
   * firma, que era el unico puente.
   */
  private async retireAcceptedRequest(shiftException: ShiftException): Promise<void> {
    let requestId = shiftException.exceptionRequestId
    if (!requestId) {
      const signature = await VacationAuthorizationSignature.findBy(
        'shift_exception_id',
        shiftException.shiftExceptionId
      )
      requestId = signature?.exceptionRequestId ?? null
    }
    if (!requestId) return

    const accepted = await ExceptionRequest.query()
      .where('exception_request_id', requestId)
      .where('exception_type_id', shiftException.exceptionTypeId)
      .where('exception_request_status', 'accepted')
      .whereNull('exception_request_deleted_at')
      .first()
    if (accepted) await accepted.delete()
  }

  private async isVacation(shiftException: ShiftException): Promise<boolean> {
    const vacation = await ExceptionType.query()
      .whereNull('exception_type_deleted_at')
      .where('exception_type_slug', 'vacation')
      .first()
    return vacation?.exceptionTypeId === shiftException.exceptionTypeId
  }
}
