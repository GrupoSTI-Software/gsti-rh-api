import type { HttpContext } from '@adonisjs/core/http'
import { errors } from '@adonisjs/limiter'
import { AUTH_INVITATION_ERRORS } from '#constants/user_invitation_error_codes'

const INVITATION_PATH_PATTERN =
  /\/api\/auth\/invitation\/(?:verify\/[^/?]+|set-password)(?:\?|$)/

export function isAuthInvitationPath(url: string): boolean {
  return INVITATION_PATH_PATTERN.test(url)
}

export function isAuthInvitationRateLimitError(
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

/** Respuesta `{ title, detail, key, code }` para rate limit del flujo de invitación. */
export function respondAuthInvitationRateLimit(
  ctx: Pick<HttpContext, 'response'>,
  error: InstanceType<typeof errors.E_TOO_MANY_REQUESTS>
) {
  const err = AUTH_INVITATION_ERRORS.RATE_LIMITED

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
