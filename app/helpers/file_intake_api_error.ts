import type { HttpContext } from '@adonisjs/core/http'
import { FILE_INTAKE_ERROR_CODES } from '#constants/file_intake_error_codes'
import { FileIntakeError } from '#exceptions/file_intake_error'

/** Cuerpo de error con el triplete del estandar mas el codigo estable. */
export interface ResolvedFileIntakeError {
  readonly title: string
  readonly detail: string
  readonly key: string
  readonly code: string
  readonly status: number
}

/**
 * Traduce un rechazo de la entrada de archivos al contrato de error del
 * estandar. Cualquier otra excepcion sale como fallo no clasificado, nunca
 * con el mensaje crudo de la libreria: el detalle de un `sharp` o un `pdf-lib`
 * roto no es accionable para el usuario y puede filtrar rutas del servidor.
 */
export function resolveFileIntakeApiError(error: unknown): ResolvedFileIntakeError {
  if (error instanceof FileIntakeError) {
    return {
      title: error.title,
      detail: error.detail,
      key: error.key,
      code: error.errorCode,
      status: error.httpStatus,
    }
  }

  return {
    title: 'Archivo no aceptado',
    detail: 'No fue posible procesar el archivo recibido.',
    key: 'archivo-no-procesable',
    code: FILE_INTAKE_ERROR_CODES.SYS_UNHANDLED,
    status: 500,
  }
}

/** Verdadero si la excepcion proviene de la entrada de archivos. */
export function isFileIntakeError(error: unknown): error is FileIntakeError {
  return error instanceof FileIntakeError
}

/** Escribe la respuesta de rechazo directamente sobre el `response` del contexto. */
export function respondFileIntakeError(
  response: HttpContext['response'],
  error: unknown
): ReturnType<HttpContext['response']['json']> {
  const resolved = resolveFileIntakeApiError(error)

  return response.status(resolved.status).json({
    type: 'error',
    title: resolved.title,
    detail: resolved.detail,
    key: resolved.key,
    code: resolved.code,
  })
}
