import type { I18n } from '@adonisjs/i18n'
import { isFileIntakeError, resolveFileIntakeApiError } from './file_intake_api_error.js'
import type { FileIntakeErrorCode } from '../constants/file_intake_error_codes.js'
import {
  EMPLOYEE_OFFBOARDING_ERROR_CODES,
  type EmployeeOffboardingErrorCode,
} from '#constants/employee_offboarding_error_codes'
import EmployeeOffboardingServiceError from '#exceptions/employee_offboarding_service_error'

/**
 * Forma única del error hacía el cliente en el módulo de salidas de personal
 * (spec §6): el BO ramifica por `key`; `code` queda para trazabilidad.
 */
export type ResolvedEmployeeOffboardingApiError = {
  status: number
  title: string
  detail: string
  key: string
  /**
   * Código estable del error. Admite también el catalogo `FILE.*` porque el
   * rechazo de un archivo conserva su propio código: al cliente le sirve para
   * distinguir "extensión bloqueada" de "contenido no corresponde".
   */
  code: EmployeeOffboardingErrorCode | FileIntakeErrorCode
  /** Carga adicional opcional (`rejectedFiles[]` del envío de evidencias, D-3). */
  data?: Record<string, unknown>
}

/**
 * Códigos y `key` de los ramos genéricos (VineJS y no clasificado), que
 * varían por slice del módulo: `concepts/` usa `OFFB.CONCEPT.*` (default) y
 * `offboardings/` pasa los suyos `OFFB.CASE.*` (USRH1786568279587).
 */
export type EmployeeOffboardingErrorFallbacks = {
  valInputCode?: EmployeeOffboardingErrorCode
  unexpectedCode?: EmployeeOffboardingErrorCode
  unexpectedKey?: string
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
  i18n: I18n,
  fallbacks: EmployeeOffboardingErrorFallbacks = {}
): ResolvedEmployeeOffboardingApiError {
  // Rechazo de un archivo: se devuelve tal cual, con su 422 y su triplete. Sin
  // esta rama el resolver lo trata como error no clasificado y responde 500,
  // ocultando al usuario que su archivo fue rechazado y por que.
  if (isFileIntakeError(error)) {
    const rechazo = resolveFileIntakeApiError(error)
    return {
      status: rechazo.status,
      title: rechazo.title,
      detail: rechazo.detail,
      key: rechazo.key,
      code: rechazo.code as FileIntakeErrorCode,
    }
  }

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
      code: fallbacks.valInputCode ?? EMPLOYEE_OFFBOARDING_ERROR_CODES.VAL_INPUT,
    }
  }

  if (error instanceof EmployeeOffboardingServiceError) {
    return {
      status: error.httpStatus,
      title: error.title,
      detail: error.message,
      key: error.key,
      code: error.errorCode,
      ...(error.data !== undefined ? { data: error.data } : {}),
    }
  }

  return {
    status: 500,
    title: i18n.formatMessage('employee_offboarding_unexpected_title'),
    detail:
      typeof err?.message === 'string'
        ? err.message
        : i18n.formatMessage('employee_offboarding_unexpected_message'),
    key: fallbacks.unexpectedKey ?? 'error-inesperado',
    code: fallbacks.unexpectedCode ?? EMPLOYEE_OFFBOARDING_ERROR_CODES.SYS_UNHANDLED,
  }
}
