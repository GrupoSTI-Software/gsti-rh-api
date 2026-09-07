import { ALLIANCE_ERROR_CODES } from '../constants/alliance_error_codes.js'
import { AllianceServiceError } from '../exceptions/alliance_service_error.js'

export type ResolvedAllianceError = {
  title: string
  detail: string
  key: string
  code: string
  status: number
}

/**
 * Convierte excepciones del dominio de alianzas en la respuesta HTTP estable
 * `{ title, detail, key, code }` con prefijo PLT.ALL.*.
 *
 * `key` es siempre un slug kebab en español y `code` es siempre el
 * `PLT.ALL.*` punteado — nunca se mezclan.
 *
 * Este helper es genérico: lee `errorCode`, `key`, `httpStatus` y `detail`
 * de la excepción. Agregar un `code` nuevo no lo toca.
 */
export function resolveAllianceApiError(
  error: unknown,
  fallbackStatus: number = 500
): ResolvedAllianceError {
  const err = error as { code?: string; messages?: Array<{ message?: string }>; message?: string }

  if (err?.code === 'E_VALIDATION_ERROR') {
    const detail = err.messages?.[0]?.message ?? 'Datos inválidos'
    return {
      title: 'Alianzas',
      detail,
      key: 'datos-invalidos',
      code: ALLIANCE_ERROR_CODES.VAL_INPUT,
      status: 422,
    }
  }

  if (error instanceof AllianceServiceError) {
    return {
      title: 'Alianzas',
      detail: error.detail,
      key: error.key,
      code: error.errorCode,
      status: error.httpStatus,
    }
  }

  return {
    title: 'Error del servidor',
    detail: typeof err?.message === 'string' ? err.message : 'Error inesperado en alianzas comerciales.',
    key: 'error-inesperado',
    code: ALLIANCE_ERROR_CODES.SYS_UNHANDLED,
    status: fallbackStatus,
  }
}
