import type { HttpContext } from '@adonisjs/core/http'
import { errors } from '@adonisjs/limiter'
import { LEGAL_DOCUMENT_PUBLIC_RATE_LIMIT_ERROR } from '#constants/legal_document_public_error_codes'

export function isLegalDocumentPublicPath(url: string): boolean {
  return /\/api\/public\/legal-documents\/current(\?|$)/.test(url)
}

export function isLegalDocumentPublicRateLimitError(
  error: unknown
): error is InstanceType<typeof errors.E_TOO_MANY_REQUESTS> {
  if (error instanceof errors.E_TOO_MANY_REQUESTS) {
    return true
  }

  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'E_TOO_MANY_REQUESTS' &&
    'response' in error
  )
}

/**
 * Respuesta `{ type, title, detail, key, code, retryAfterSeconds }` para el límite
 * de consultas de la lectura pública de documentos legales.
 *
 * Sin esta rama el error llega al manejador por defecto de Adonis y el cliente
 * recibe un cuerpo fuera del contrato. A diferencia del límite de acceso, aquí se
 * agrega `code` y `Cache-Control: no-store`: la respuesta no debe quedar en caché
 * de un intermediario, o una persona seguiría viendo el 429 cuando ya puede consultar.
 */
export function respondLegalDocumentPublicRateLimit(
  ctx: Pick<HttpContext, 'response'>,
  error: InstanceType<typeof errors.E_TOO_MANY_REQUESTS>
): void {
  const err = LEGAL_DOCUMENT_PUBLIC_RATE_LIMIT_ERROR

  ctx.response
    .status(429)
    .header('Cache-Control', 'no-store')
    .header('X-RateLimit-Limit', error.response.limit)
    .header('X-RateLimit-Remaining', error.response.remaining)
    .header('Retry-After', error.response.availableIn)
    .header(
      'X-RateLimit-Reset',
      new Date(Date.now() + error.response.availableIn * 1000).toISOString()
    )
    .json({
      type: 'error',
      title: err.title,
      detail: err.detail,
      key: err.key,
      code: err.code,
      retryAfterSeconds: error.response.availableIn,
    })
}
