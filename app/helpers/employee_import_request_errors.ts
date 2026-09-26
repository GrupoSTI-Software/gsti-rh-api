import type { HttpContext } from '@adonisjs/core/http'
import type { Response } from '@adonisjs/core/http'
import {
  resolveEmployeeImportValFileError,
  type EmployeeImportValFileReason,
} from './employee_import_api_error.js'

/** Respuesta GSTI estándar para errores de archivo del import de empleados. */
export function respondEmployeeImportValFileError(
  ctx: Pick<HttpContext, 'i18n'>,
  response: Response,
  reason: EmployeeImportValFileReason
) {
  const resolved = resolveEmployeeImportValFileError(ctx.i18n, { reason })
  return response.status(resolved.status).json({
    type: 'error',
    title: resolved.title,
    message: resolved.message,
    detail: resolved.detail,
    key: resolved.key,
    code: resolved.errorCode,
    data: resolved.data ?? null,
  })
}

export function isRequestEntityTooLarge(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as { status?: number; message?: string }
  if (err.status === 413) return true
  const message = typeof err.message === 'string' ? err.message.toLowerCase() : ''
  return message.includes('request entity too large') || message.includes('entity too large')
}
