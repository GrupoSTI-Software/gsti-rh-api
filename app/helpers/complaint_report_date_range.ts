import { DateTime } from 'luxon'
import { ComplaintServiceError } from '#exceptions/complaint_service_error'
import { COMPLAINT_ERROR_CODES } from '#constants/complaint_error_codes'

export type ParsedComplaintReportDateRange = {
  from: DateTime
  to: DateTime
  fromIso: string
  toIso: string
}

/** Normaliza y valida el rango [from, to] inclusive por día UTC. */
export function parseComplaintReportDateRange(from: string, to: string): ParsedComplaintReportDateRange {
  const fromDt = DateTime.fromISO(from, { zone: 'utc' }).startOf('day')
  const toDt = DateTime.fromISO(to, { zone: 'utc' }).endOf('day')

  if (!fromDt.isValid || !toDt.isValid) {
    throw ComplaintServiceError.withMessageKey(
      'complaint_val_input',
      COMPLAINT_ERROR_CODES.VAL_INPUT,
      400,
      'AUTH.COMPLAINT.VAL_INPUT'
    )
  }

  if (fromDt.toMillis() > toDt.toMillis()) {
    throw ComplaintServiceError.withMessageKey(
      'complaint_report_invalid_date_range',
      COMPLAINT_ERROR_CODES.DATE_RANGE_INVALID,
      422,
      'invalid-date-range'
    )
  }

  return {
    from: fromDt,
    to: toDt,
    fromIso: fromDt.toFormat('yyyy-MM-dd'),
    toIso: toDt.toFormat('yyyy-MM-dd'),
  }
}
