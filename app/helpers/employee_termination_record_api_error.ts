import type { I18n } from '@adonisjs/i18n'
import {
  EMPLOYEE_TERMINATION_RECORD_ERROR_CODES,
  type EmployeeTerminationRecordErrorCode,
} from '../constants/employee_termination_record_error_codes.js'
import type { EmployeeTerminationRecordError } from '../exceptions/employee_termination_record_error.js'

export interface ResolvedEmployeeTerminationRecordApiError {
  status: number
  title: string
  message: string
  detail: string
  key: string
  errorCode: EmployeeTerminationRecordErrorCode
}

/** Código → base de las claves i18n `<base>_title` y `<base>_detail`. */
const ERROR_CODE_TO_I18N_BASE: Record<EmployeeTerminationRecordErrorCode, string> = {
  [EMPLOYEE_TERMINATION_RECORD_ERROR_CODES.ACTIVE_CHANGE_FORBIDDEN]:
    'employee_termination_active_change',
  [EMPLOYEE_TERMINATION_RECORD_ERROR_CODES.CLEAR_FORBIDDEN]: 'employee_termination_clear_forbidden',
  [EMPLOYEE_TERMINATION_RECORD_ERROR_CODES.OPEN_CASE]: 'employee_termination_open_case',
}

/** Títulos de respaldo por si falta la clave i18n; el `detail` de respaldo es el `message` del error. */
const FALLBACK_TITLE: Record<EmployeeTerminationRecordErrorCode, string> = {
  [EMPLOYEE_TERMINATION_RECORD_ERROR_CODES.ACTIVE_CHANGE_FORBIDDEN]:
    'Baja solo desde el expediente',
  [EMPLOYEE_TERMINATION_RECORD_ERROR_CODES.CLEAR_FORBIDDEN]:
    'La baja no se puede quitar desde la ficha',
  [EMPLOYEE_TERMINATION_RECORD_ERROR_CODES.OPEN_CASE]: 'Baja programada en el expediente',
}

function translate(i18n: I18n | undefined, key: string, fallback: string): string {
  if (!i18n) return fallback
  return i18n.t(key, undefined, fallback)
}

/**
 * Convierte el error del registro de baja en la respuesta HTTP estable del
 * guardado de la ficha (VLRH-H1792172889566): `{ status, title, message,
 * detail, key, errorCode }`, con `message` = `detail`, texto fijo traducido y
 * la `key` siempre en español. Sin `data`: nunca ecoa el payload.
 */
export function resolveEmployeeTerminationRecordApiError(
  error: EmployeeTerminationRecordError,
  i18n?: I18n
): ResolvedEmployeeTerminationRecordApiError {
  const base = ERROR_CODE_TO_I18N_BASE[error.errorCode]
  const detail = translate(i18n, `${base}_detail`, error.message)
  return {
    status: error.httpStatus,
    title: translate(i18n, `${base}_title`, FALLBACK_TITLE[error.errorCode]),
    message: detail,
    detail,
    key: error.key,
    errorCode: error.errorCode,
  }
}
