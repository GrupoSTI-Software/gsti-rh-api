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
