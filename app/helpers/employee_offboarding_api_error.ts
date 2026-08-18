import type { I18n } from '@adonisjs/i18n'
import {
  EMPLOYEE_OFFBOARDING_ERROR_CODES,
  type EmployeeOffboardingErrorCode,
} from '#constants/employee_offboarding_error_codes'
import EmployeeOffboardingServiceError from '#exceptions/employee_offboarding_service_error'

/**
 * Forma única del error hacia el cliente en el módulo de salidas de personal
 * (spec §6): el BO ramifica por `key`; `code` queda para trazabilidad.
 */
export type ResolvedEmployeeOffboardingApiError = {
  status: number
  title: string
  detail: string
  key: string
  code: EmployeeOffboardingErrorCode
}

/**
 * Convierte cualquier excepción del módulo de salidas de personal en la
 * respuesta estable `{ title, detail, key, code }` (molde
 * `resolvePositionLevelApiError`). Dictamen de códigos HTTP de la cadena:
 * 400 = VineJS · 422 = regla de negocio · 409 = conflicto · 404 = fuera de
 * alcance uniforme · 403 = sin permiso · 500 = no clasificado.
 */
export function resolveEmployeeOffboardingApiError(
  error: unknown,
  i18n: I18n
): ResolvedEmployeeOffboardingApiError {
  const err = error as {
    code?: string
    message?: string
    messages?: Array<{ message?: string }>
  }

  if (err?.code === 'E_VALIDATION_ERROR') {
    return {
      status: 400,
      title: i18n.formatMessage('employee_offboarding_val_input_title'),
      detail:
        err.messages?.[0]?.message ??
        i18n.formatMessage('employee_offboarding_val_input_message'),
      key: 'datos-invalidos',
      code: EMPLOYEE_OFFBOARDING_ERROR_CODES.VAL_INPUT,
    }
  }

  if (error instanceof EmployeeOffboardingServiceError) {
    return {
      status: error.httpStatus,
      title: error.title,
      detail: error.message,
      key: error.key,
      code: error.errorCode,
    }
  }

  return {
    status: 500,
    title: i18n.formatMessage('employee_offboarding_unexpected_title'),
    detail:
      typeof err?.message === 'string'
        ? err.message
        : i18n.formatMessage('employee_offboarding_unexpected_message'),
    key: 'error-inesperado',
    code: EMPLOYEE_OFFBOARDING_ERROR_CODES.SYS_UNHANDLED,
  }
}
