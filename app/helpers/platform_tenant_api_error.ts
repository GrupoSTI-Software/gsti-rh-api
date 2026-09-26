import { PLATFORM_TENANT_ERROR_CODES } from '../constants/platform_tenant_error_codes.js'
import { PlatformTenantServiceError } from '../exceptions/platform_tenant_service_error.js'

export type ResolvedPlatformTenantError = {
  title: string
  detail: string
  key: string
  code: string
  status: number
}

/**
 * Convierte excepciones del módulo de tenants en la respuesta HTTP estable
 * `{ title, detail, key, code }` con prefijo PLT.TEN.*.
 */
export function resolvePlatformTenantApiError(
  error: unknown,
  fallbackStatus: number = 500
): ResolvedPlatformTenantError {
  const err = error as { code?: string; messages?: Array<{ message?: string }>; message?: string }

  if (err?.code === 'E_VALIDATION_ERROR') {
    const detail = err.messages?.[0]?.message ?? 'Datos inválidos'
    return {
      title: 'Tenants de plataforma',
      detail,
      key: 'PLT.TEN.VAL_INPUT',
      code: PLATFORM_TENANT_ERROR_CODES.VAL_INPUT,
      status: 422,
    }
  }

  if (error instanceof PlatformTenantServiceError) {
    return {
      title: 'Tenants de plataforma',
      detail: error.detail ?? error.message,
      key: error.key ?? error.errorCode,
      code: error.errorCode,
      status: error.httpStatus,
    }
  }

  return {
    title: 'Error del servidor',
    detail: typeof err?.message === 'string' ? err.message : 'Error inesperado en tenants.',
    key: PLATFORM_TENANT_ERROR_CODES.SYS_UNHANDLED,
    code: PLATFORM_TENANT_ERROR_CODES.SYS_UNHANDLED,
    status: fallbackStatus,
  }
}
