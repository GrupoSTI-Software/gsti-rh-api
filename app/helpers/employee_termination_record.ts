export interface EmployeeTerminationRecord {
  employeeTerminatedDate: string | null
  employeeTerminationModality: string | null
  employeeTerminationType: string | null
}

/** Misma normalización de fecha que EmployeeController (update/delete). */
export function normalizeEmployeeTerminatedDate(value: unknown): string | null {
  if (!value) return null
  return (String(value).split('T')[0] + ' 00:000:00').replace('"', '')
}

function normalizeToken(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  return String(value)
}

export function isEmployeeTerminationRecordChanged(
  current: EmployeeTerminationRecord,
  next: EmployeeTerminationRecord
): boolean {
  const curDate = normalizeEmployeeTerminatedDate(current.employeeTerminatedDate)
  const nextDate = normalizeEmployeeTerminatedDate(next.employeeTerminatedDate)
  return (
    curDate !== nextDate ||
    normalizeToken(current.employeeTerminationModality) !==
      normalizeToken(next.employeeTerminationModality) ||
    normalizeToken(current.employeeTerminationType) !== normalizeToken(next.employeeTerminationType)
  )
}
