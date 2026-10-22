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

/** Qué llaves del trío de baja trajo el request (ausente ≠ `null` ni `''`). */
export interface TerminationRecordPresence {
  date: boolean
  modality: boolean
  type: boolean
}

export interface TerminationRecordUpdateInput {
  /** Estado del colaborador en la fila evaluada (`employee_deleted_at IS NOT NULL`). */
  employeeIsDeleted: boolean
  /** Registro guardado, con los tokens ya normalizados. */
  current: EmployeeTerminationRecord
  /**
   * Registro que resultaría de aplicar el request: llave ausente = valor
   * guardado; fecha vacía → modalidad y tipo `null`.
   */
  next: EmployeeTerminationRecord
  presence: TerminationRecordPresence
}

/**
 * Decisión del guardado de la ficha sobre el trío de baja. Unión discriminada:
 * el controller solo puede escribir el trío desde `correct-deleted`, así que
 * el typecheck impide escribirlo por otra rama.
 */
export type TerminationRecordUpdateDecision =
  | { action: 'keep' }
  | { action: 'reject-active' }
  | { action: 'reject-clear-deleted' }
  /** Quitar la baja antigua de un activo (VLRH-H1792361735984): el controller escribe el trío en `NULL`. */
  | { action: 'clear-legacy' }
  | { action: 'correct-deleted'; record: EmployeeTerminationRecord }

/**
 * Qué hace `PUT /api/employees/:employeeId` con fecha, modalidad y tipo de baja
 * (VLRH-H1792172889566). En orden: sin ninguna llave → `keep` (regla 3); igual
 * a lo guardado tras normalizar → `keep` (regla 2); activo con fecha guardada
 * que la vacía → `clear-legacy` (válvula de VLRH-H1792361735984: permiso de dar
 * de baja, cupo y sin expediente en curso los exige el controller); cualquier
 * otro cambio en un activo → `reject-active` (regla 1); dado de baja sin fecha →
 * `reject-clear-deleted` (regla 4); si no → `correct-deleted` con el registro
 * a escribir. Función pura: sin I/O; el llamador la evalúa sobre la fila leída
 * y otra vez sobre la fila bloqueada (regla 5).
 */
export function resolveTerminationRecordUpdate(
  input: TerminationRecordUpdateInput
): TerminationRecordUpdateDecision {
  const { presence } = input
  if (!presence.date && !presence.modality && !presence.type) return { action: 'keep' }
  if (!isEmployeeTerminationRecordChanged(input.current, input.next)) return { action: 'keep' }
  if (!input.employeeIsDeleted) {
    const clearsSavedDate =
      normalizeEmployeeTerminatedDate(input.next.employeeTerminatedDate) === null &&
      normalizeEmployeeTerminatedDate(input.current.employeeTerminatedDate) !== null
    return clearsSavedDate ? { action: 'clear-legacy' } : { action: 'reject-active' }
  }
  if (normalizeEmployeeTerminatedDate(input.next.employeeTerminatedDate) === null) {
    return { action: 'reject-clear-deleted' }
  }
  return { action: 'correct-deleted', record: input.next }
}
