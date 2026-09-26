import { PLATFORM_SYSTEM_MODULE_ERROR_CODES } from '../constants/platform_system_module_error_codes.js'

export type ResolvedPlatformSystemModuleError = {
  title: string
  detail: string
  key: string
  code: string
  status: number
}

/**
 * Convierte excepciones de la vista de módulos de plataforma en la respuesta
 * HTTP estable `{ title, detail, key, code }` con prefijo PLT.MOD.*.
 *
 * Solo queda la rama de error no tipado: el listado no valida body ni lanza
 * errores de dominio. Las ramas de validación (422) y de módulo inexistente
 * (404) servían al interruptor `PUT /:systemModuleId/active`, retirado porque
 * 0062 sobrescribe la disponibilidad desde la constante.
 *
 * @param error - Error capturado en el controlador.
 * @param fallbackStatus - Status por defecto para errores no tipados.
 * @returns Cuerpo de error resuelto con su status HTTP.
 */
export function resolvePlatformSystemModuleApiError(
  error: unknown,
  fallbackStatus: number = 500
): ResolvedPlatformSystemModuleError {
  const err = error as { message?: string } | null

  return {
    title: 'Error del servidor',
    detail: typeof err?.message === 'string' ? err.message : 'Error inesperado en módulos.',
    key: PLATFORM_SYSTEM_MODULE_ERROR_CODES.SYS_UNHANDLED,
    code: PLATFORM_SYSTEM_MODULE_ERROR_CODES.SYS_UNHANDLED,
    status: fallbackStatus,
  }
}
