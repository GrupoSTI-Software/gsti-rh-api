import { DateTime } from 'luxon'

export interface EmployeeTerminationRecord {
  employeeTerminatedDate: string | Date | null
  employeeTerminationModality: string | null
  employeeTerminationType: string | null
}

/**
 * Resultado de interpretar la fecha de baja capturada (VLRH-H1790812613821).
 * Tres casos y no dos: vacía y no interpretable son cosas distintas (regla 4).
 * Vacía conserva la conducta vigente de cada acción; no interpretable se
 * rechaza y nunca quita el registro de baja.
 */
export type EmployeeTerminatedDateParseResult =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  | { kind: 'valid'; calendarDate: string; sqlValue: string }

const CALENDAR_DATE_FORMAT = 'yyyy-MM-dd'
const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * Fuente única de la fecha de baja (VLRH-H1790812613821): la baja, la edición
 * de la ficha, el gate del registro de baja y el servicio la interpretan aquí.
 * `empty` solo para `null`, `undefined` o texto vacío tras `trim`; cualquier
 * otro valor que no sea un día real del calendario es `invalid` (un número,
 * `0` o `false` no borran la baja). La hora o la zona que acompañen la fecha
 * no la recorren de día (regla 2): se toma la parte de fecha tal como llegó.
 */
export function parseEmployeeTerminatedDate(value: unknown): EmployeeTerminatedDateParseResult {
  if (value === null || value === undefined) return { kind: 'empty' }
  if (typeof value === 'string' && value.trim() === '') return { kind: 'empty' }
  const datePart = extractDatePart(value)
  if (datePart === null || !CALENDAR_DATE_PATTERN.test(datePart)) return { kind: 'invalid' }
  // El formato estricto descarta semanas y ordinales; el ida y vuelta, los días que no existen
  const parsed = DateTime.fromFormat(datePart, CALENDAR_DATE_FORMAT, { zone: 'utc' })
  if (!parsed.isValid || parsed.toFormat(CALENDAR_DATE_FORMAT) !== datePart) {
    return { kind: 'invalid' }
  }
  return { kind: 'valid', calendarDate: datePart, sqlValue: `${datePart} 00:00:00` }
}

/**
 * `Date`: su día en UTC (mysql2 entrega los `timestamp` con la conexión fijada
 * a UTC). Texto: sin comillas, hasta la `T` o el primer espacio. Otro tipo: `null`.
 */
function extractDatePart(value: unknown): string | null {
  if (value instanceof Date) {
    const fromDate = DateTime.fromJSDate(value, { zone: 'utc' })
    return fromDate.isValid ? fromDate.toFormat(CALENDAR_DATE_FORMAT) : null
  }
  if (typeof value !== 'string') return null
  return value.replace(/"/g, '').trim().split(/[T\s]/)[0]
}

/** Proyección para comparar y guardar (`yyyy-MM-dd 00:00:00`); `null` si está vacía o no es interpretable. */
export function normalizeEmployeeTerminatedDate(value: unknown): string | null {
  const result = parseEmployeeTerminatedDate(value)
  return result.kind === 'valid' ? result.sqlValue : null
}

export function normalizeToken(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  return String(value)
}

export function isEmployeeTerminationRecordChanged(
  current: EmployeeTerminationRecord,
  next: EmployeeTerminationRecord
): boolean {
  // Fail-closed: una fecha no interpretable en cualquiera de los dos lados
  // cuenta como cambio y exige el permiso; nunca se compara como "sin fecha".
  if (
    parseEmployeeTerminatedDate(current.employeeTerminatedDate).kind === 'invalid' ||
    parseEmployeeTerminatedDate(next.employeeTerminatedDate).kind === 'invalid'
  ) {
    return true
  }
  const curDate = normalizeEmployeeTerminatedDate(current.employeeTerminatedDate)
  const nextDate = normalizeEmployeeTerminatedDate(next.employeeTerminatedDate)
  return (
    curDate !== nextDate ||
    normalizeToken(current.employeeTerminationModality) !==
      normalizeToken(next.employeeTerminationModality) ||
    normalizeToken(current.employeeTerminationType) !== normalizeToken(next.employeeTerminationType)
  )
}
