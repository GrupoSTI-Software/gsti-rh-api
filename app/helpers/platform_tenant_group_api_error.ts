import { PLATFORM_TENANT_GROUP_ERROR_CODES } from '../constants/platform_tenant_group_error_codes.js'
import { PlatformTenantGroupServiceError } from '../exceptions/platform_tenant_group_service_error.js'

export type ResolvedTenantGroupError = {
  title: string
  detail: string
  key: string
  code: string
  status: number
}

/**
 * Convierte excepciones del módulo de grupos en la respuesta HTTP estable
 * `{ title, detail, key, code }` con prefijo PLT.GRP.*.
 * El `key` es el slug del título en kebab español, el `code` es el identificador punteado.
 */
export function resolveTenantGroupApiError(
  error: unknown,
  fallbackStatus: number = 500
): ResolvedTenantGroupError {
  const err = error as { code?: string; messages?: Array<{ message?: string }>; message?: string }

  if (err?.code === 'E_VALIDATION_ERROR') {
    const detail = err.messages?.[0]?.message ?? 'Datos inválidos'
    return {
      title: 'Grupos de tenants de plataforma',
      detail,
      key: 'datos-invalidos',
      code: PLATFORM_TENANT_GROUP_ERROR_CODES.VAL_INPUT,
      status: 422,
    }
  }

  if (error instanceof PlatformTenantGroupServiceError) {
    return {
      title: 'Grupos de tenants de plataforma',
      detail: error.detail ?? error.message,
      key: error.key ?? error.errorCode,
      code: error.errorCode,
      status: error.httpStatus,
    }
  }

  return {
    title: 'Error del servidor',
    detail: typeof err?.message === 'string' ? err.message : 'Error inesperado en grupos.',
    key: 'error-inesperado',
    code: PLATFORM_TENANT_GROUP_ERROR_CODES.SYS_UNHANDLED,
    status: fallbackStatus,
  }
}
