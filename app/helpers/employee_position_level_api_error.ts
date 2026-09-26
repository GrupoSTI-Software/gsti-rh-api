import type { I18n } from '@adonisjs/i18n'
import { EMPLOYEE_POSITION_LEVEL_ERROR_CODES } from '../constants/employee_position_level_error_codes.js'
import type { EmployeePositionLevelErrorCode } from '../constants/employee_position_level_error_codes.js'
import { EmployeePositionLevelError } from '../exceptions/employee_position_level_error.js'

export type ResolvedEmployeePositionLevelApiError = {
  /** Mensaje localizado según `Accept-Language` (o literal si no hay i18n). */
  message: string
  /** Título localizado del error. */
  title: string
  /** Detalle localizado; el contrato `{ title, detail, key, code }` lo exige. */
  detail: string
  status: number
  errorCode: EmployeePositionLevelErrorCode
  key?: string
}

/**
 * Mapa `errorCode` → claves base de i18n. El resolver concatena `_title` y
 * `_message` para resolver el título y el mensaje localizados. Mismo patrón
 * que `employee_badge_api_error.ts`, con el `detail` extra del contrato
 * (como `resolveEmployeeQuotaApiError`).
 */
const ERROR_CODE_TO_I18N_BASE: Record<EmployeePositionLevelErrorCode, string> = {
  [EMPLOYEE_POSITION_LEVEL_ERROR_CODES.VAL_INPUT]: 'employee_position_level_val_input',
  [EMPLOYEE_POSITION_LEVEL_ERROR_CODES.NOT_IN_POSITION]: 'employee_position_level_not_in_position',
  [EMPLOYEE_POSITION_LEVEL_ERROR_CODES.INACTIVE_NOT_ASSIGNABLE]:
    'employee_position_level_inactive',
}

function resolveMessageKey(errorCode: EmployeePositionLevelErrorCode): string | undefined {
  const base = ERROR_CODE_TO_I18N_BASE[errorCode]
  return base ? `${base}_message` : undefined
}

function resolveTitleKey(errorCode: EmployeePositionLevelErrorCode): string | undefined {
  const base = ERROR_CODE_TO_I18N_BASE[errorCode]
  return base ? `${base}_title` : undefined
}

/** Traduce una clave si `i18n` está disponible; si no, devuelve el fallback. */
function translate(i18n: I18n | undefined, key: string | undefined, fallback: string): string {
  if (!i18n || !key) return fallback
  return i18n.t(key, undefined, fallback)
}

/** El nivel no pertenece al puesto efectivo (otro puesto/tenant o eliminado). */
export function employeePositionLevelNotInPositionError(): EmployeePositionLevelError {
  return new EmployeePositionLevelError(
    'El nivel indicado no pertenece a los niveles configurados del puesto del empleado.',
    EMPLOYEE_POSITION_LEVEL_ERROR_CODES.NOT_IN_POSITION,
    422,
    'nivel-no-pertenece-al-puesto'
  )
}

/** Nivel del puesto pero inactivo, en asignación nueva (regla 6). */
export function employeePositionLevelInactiveError(): EmployeePositionLevelError {
  return new EmployeePositionLevelError(
    'El nivel indicado está inactivo y no puede asignarse; el empleado que ya lo tenía lo conserva.',
    EMPLOYEE_POSITION_LEVEL_ERROR_CODES.INACTIVE_NOT_ASSIGNABLE,
    422,
    'nivel-inactivo-no-asignable'
  )
}

/** Check defensivo: `positionLevelConfigId` no es un entero positivo. */
export function employeePositionLevelInvalidInputError(): EmployeePositionLevelError {
  return new EmployeePositionLevelError(
    'El identificador del nivel de puesto es inválido.',
    EMPLOYEE_POSITION_LEVEL_ERROR_CODES.VAL_INPUT,
    422,
    'nivel-invalido'
  )
}

/**
 * Convierte excepciones del nivel de puesto del empleado en una respuesta
 * HTTP estable (`{ title, detail, key, code }` + message legacy).
 */
export function resolveEmployeePositionLevelApiError(
  error: EmployeePositionLevelError,
  fallbackStatus: number,
  i18n?: I18n
): ResolvedEmployeePositionLevelApiError {
  const message = translate(i18n, resolveMessageKey(error.errorCode), error.message)
  return {
    message,
    title: translate(i18n, resolveTitleKey(error.errorCode), 'Error'),
    detail: message,
    status: error.httpStatus || fallbackStatus,
    errorCode: error.errorCode,
    key: error.key,
  }
}
