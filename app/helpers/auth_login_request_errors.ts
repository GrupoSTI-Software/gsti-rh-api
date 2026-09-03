import type { HttpContext } from '@adonisjs/core/http'
import { errors } from '@adonisjs/limiter'
import { AUTH_LOGIN_ERRORS } from '#constants/auth_login_error_codes'

export function isAuthLoginPath(url: string): boolean {
  return /\/api\/auth\/login(\?|$)/.test(url)
}

export function isAuthLoginRateLimitError(
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
 * Respuesta estándar `{ title, detail, key }` para el límite de intentos de acceso.
 *
 * Sin esta rama el error llega al manejador por defecto de Adonis y el cliente
 * recibe un cuerpo que no es el contrato: la app del empleado se quedaba con el
 * texto que Dio arma para un 4xx y lo pintaba en el formulario de acceso.
 *
 * `Retry-After` es lo que permite decir cuánto falta en vez de "unos minutos".
 */
export function respondAuthLoginRateLimit(
  ctx: Pick<HttpContext, 'response'>,
  error: InstanceType<typeof errors.E_TOO_MANY_REQUESTS>
) {
  const err = AUTH_LOGIN_ERRORS.RATE_LIMITED

  return ctx.response
    .status(429)
    .header('X-RateLimit-Limit', error.response.limit)
    .header('X-RateLimit-Remaining', error.response.remaining)
    .header('Retry-After', error.response.availableIn)
    .header(
      'X-RateLimit-Reset',
      new Date(Date.now() + error.response.availableIn * 1000).toISOString()
    )
    .json({
      title: err.title,
      detail: err.detail,
      key: err.key,
      retryAfterSeconds: error.response.availableIn,
    })
}
