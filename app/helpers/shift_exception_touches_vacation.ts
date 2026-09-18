import ExceptionType from '#models/exception_type'
import ExceptionRequest from '#models/exception_request'

export const VACATION_EXCEPTION_TYPE_SLUG = 'vacation' as const

export function isVacationExceptionTypeSlug(slug: string | null | undefined): boolean {
  return slug === VACATION_EXCEPTION_TYPE_SLUG
}

export async function exceptionTypeIdIsVacation(
  exceptionTypeId: number | null | undefined
): Promise<boolean> {
  if (!exceptionTypeId) {
    return false
  }

  const exceptionType = await ExceptionType.query()
    .whereNull('exception_type_deleted_at')
    .where('exception_type_id', exceptionTypeId)
    .first()

  return isVacationExceptionTypeSlug(exceptionType?.exceptionTypeSlug)
}

export async function shiftExceptionTouchesVacation(opts: {
  currentExceptionTypeId?: number | null
  nextExceptionTypeId?: number | null
}): Promise<boolean> {
  const ids = [opts.currentExceptionTypeId, opts.nextExceptionTypeId].filter(
    (id): id is number => typeof id === 'number' && id > 0
  )

  for (const id of ids) {
    if (await exceptionTypeIdIsVacation(id)) {
      return true
    }
  }

  return false
}

export async function exceptionRequestAcceptTouchesVacation(
  exceptionRequestId: number,
  status: string
): Promise<boolean> {
  if (status !== 'accepted' || !exceptionRequestId) {
    return false
  }

  const request = await ExceptionRequest.query()
    .whereNull('exception_request_deleted_at')
    .where('exception_request_id', exceptionRequestId)
    .first()

  if (!request) {
    return false
  }

  return exceptionTypeIdIsVacation(request.exceptionTypeId)
}

/**
 * Indica si un lote de solicitudes toca vacaciones al aceptarse.
 *
 * Es la versión de conjunto de `exceptionRequestAcceptTouchesVacation`: basta
 * una solicitud de vacaciones en el lote para que la operación completa exija el
 * permiso de vacaciones, porque una sola aceptación ya consume días.
 *
 * @param exceptionRequestIds - Ids del lote.
 * @param status - Resolución que se pretende aplicar.
 * @returns `true` cuando al menos una del lote es de vacaciones y se va a aceptar.
 */
export async function exceptionRequestsBatchTouchesVacation(
  exceptionRequestIds: number[],
  status: string
): Promise<boolean> {
  if (status !== 'accepted' || exceptionRequestIds.length === 0) {
    return false
  }

  const requests = await ExceptionRequest.query()
    .whereNull('exception_request_deleted_at')
    .whereIn('exception_request_id', exceptionRequestIds)

  for (const request of requests) {
    if (await exceptionTypeIdIsVacation(request.exceptionTypeId)) {
      return true
    }
  }

  return false
}
