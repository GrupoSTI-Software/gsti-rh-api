import type { HttpContext } from '@adonisjs/core/http'
import { errors } from '@adonisjs/limiter'
import { USER_INVITATION_RESEND_ERRORS } from '#constants/user_invitation_error_codes'

export function isResendAccessPath(url: string): boolean {
  return /\/api\/users\/\d+\/resend-access(\?|$)/.test(url)
}

export function isResendAccessRateLimitError(
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

/** Respuesta estándar `{ title, detail, key, code }` para rate limit del reenvío de acceso. */
export function respondResendAccessRateLimit(
  ctx: Pick<HttpContext, 'response'>,
  error: InstanceType<typeof errors.E_TOO_MANY_REQUESTS>
) {
  const err = USER_INVITATION_RESEND_ERRORS.RATE_LIMITED

  return ctx.response
    .status(err.status)
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
      code: err.code,
    })
}
