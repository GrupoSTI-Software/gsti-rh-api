import type { I18n } from '@adonisjs/i18n'
import { EMPLOYEE_REACTIVATION_ERROR_CODES } from '../constants/employee_reactivation_error_codes.js'
import type {
  EmployeeReactivationErrorCode,
  EmployeeReactivationExitConcludedReason,
} from '../constants/employee_reactivation_error_codes.js'
import { EmployeeReactivationError } from '../exceptions/employee_reactivation_error.js'

export type ResolvedEmployeeReactivationApiError = {
  title: string
  message: string
  detail: string
  status: number
  errorCode: EmployeeReactivationErrorCode
  key?: string
  data?: Record<string, string | number>
}

/** Código → base de las claves i18n `<base>_title`, `<base>_message`, `<base>_detail`. */
const ERROR_CODE_TO_I18N_BASE: Record<EmployeeReactivationErrorCode, string> = {
  [EMPLOYEE_REACTIVATION_ERROR_CODES.CODE_TAKEN]: 'employee_reactivation_code_taken',
  [EMPLOYEE_REACTIVATION_ERROR_CODES.EXIT_CONCLUDED]: 'employee_reactivation_exit_concluded',
}

function translate(
  i18n: I18n | undefined,
  key: string,
  fallback: string,
  data?: Record<string, string | number>
): string {
  if (!i18n) return fallback
  return i18n.t(key, data, fallback)
}

/**
 * El código original del colaborador ya lo usa otro colaborador vivo de la
 * misma empresa (VLRH-H1790812613829, regla 4). Dice qué código está ocupado
 * y nunca quién lo tiene: `employeeCode` es el del colaborador que se reactiva.
 */
export function employeeReactivationCodeTakenError(
  employeeCode: string
): EmployeeReactivationError {
  return new EmployeeReactivationError(
    `El código ${employeeCode} ya lo tiene otro colaborador activo de la empresa.`,
    EMPLOYEE_REACTIVATION_ERROR_CODES.CODE_TAKEN,
    409,
    'codigo-de-colaborador-ocupado',
    'Cambia el código del otro colaborador o corrige el de este antes de reactivar.',
    { employeeCode },
    { employeeCode }
  )
}

/**
 * La salida del colaborador ya se concretó (VLRH-H1791055794596, reglas 1 y
 * 2): deshacer la baja ya no procede y, si regresa, corresponde reincorporar.
 * Solo dice el motivo (`reason`); ningún dato del expediente ni del documento.
 */
export function employeeReactivationExitConcludedError(
  reason: EmployeeReactivationExitConcludedReason
): EmployeeReactivationError {
  return new EmployeeReactivationError(
    'No se puede deshacer esta baja porque la salida del colaborador ya se concretó. Si regresa a trabajar, corresponde una reincorporación.',
    EMPLOYEE_REACTIVATION_ERROR_CODES.EXIT_CONCLUDED,
    409,
    'la-salida-ya-se-concreto',
    'El expediente de salida ya se dio por terminado, o ya se emitió la constancia de separación o el convenio de terminación.',
    undefined,
    { reason }
  )
}

/**
 * Convierte la excepción de reactivación en la respuesta HTTP estable del
 * módulo: `{ title, message, detail, status, errorCode, key, data }`.
 */
export function resolveEmployeeReactivationApiError(
  error: EmployeeReactivationError,
  i18n?: I18n
): ResolvedEmployeeReactivationApiError {
  const base = ERROR_CODE_TO_I18N_BASE[error.errorCode]
  return {
    title: translate(i18n, `${base}_title`, error.message, error.i18nData),
    message: translate(i18n, `${base}_message`, error.message, error.i18nData),
    detail: translate(i18n, `${base}_detail`, error.detail ?? error.message, error.i18nData),
    status: error.httpStatus,
    errorCode: error.errorCode,
    key: error.key,
    data: error.data,
  }
}
