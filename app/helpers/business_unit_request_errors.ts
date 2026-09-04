import type { HttpContext } from '@adonisjs/core/http'
import { errors } from '@adonisjs/limiter'
import { BUSINESS_UNIT_SIGNUP_ERRORS } from '../constants/business_unit_signup_error_codes.js'

/**
 * Coincide `POST /api/business-units` (el `GET` no tiene rate limiter
 * y nunca dispara `E_TOO_MANY_REQUESTS`).
 */
export function isAdditionalBusinessUnitCreatePath(url: string): boolean {
  return /^\/api\/business-units(\?|$)/.test(url)
}

export function isAdditionalBusinessUnitRateLimitError(
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
 * Respuesta 429 del alta de empresa adicional con headers RFC 6585 y código
 * `TNT.BU.RATE_LIMITED` del catálogo.
 */
export function respondAdditionalBusinessUnitRateLimit(
  ctx: Pick<HttpContext, 'response'>,
  error: InstanceType<typeof errors.E_TOO_MANY_REQUESTS>
) {
  const e = BUSINESS_UNIT_SIGNUP_ERRORS.RATE_LIMITED

  return ctx.response
    .status(e.status)
    .header('X-RateLimit-Limit', error.response.limit)
    .header('X-RateLimit-Remaining', error.response.remaining)
    .header('Retry-After', error.response.availableIn)
    .header(
      'X-RateLimit-Reset',
      new Date(Date.now() + error.response.availableIn * 1000).toISOString()
    )
    .json({
      title: e.title,
      detail: e.detail,
      key: e.key,
      code: e.code,
    })
}
