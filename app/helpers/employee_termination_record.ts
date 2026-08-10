export interface EmployeeTerminationRecord {
  employeeTerminatedDate: string | null
  employeeTerminationModality: string | null
  employeeTerminationType: string | null
}

/** Misma normalización de fecha que EmployeeController (update/delete). */
export function normalizeEmployeeTerminatedDate(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }
  return String(value).replace('"', '').split(/[T\s]/)[0]
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
