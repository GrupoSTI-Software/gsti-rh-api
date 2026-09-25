import type { HttpContext } from '@adonisjs/core/http'
import { errors } from '@adonisjs/limiter'
import { PERSON_IDENTITY_ERRORS } from '#constants/person_identity_error_codes'

/**
 * Verdadero para las rutas de escritura de personas: `POST /api/persons` y
 * `PUT /api/persons/:personId`. La regex exige que tras `persons` venga el fin
 * de la ruta, un `/` con el id numérico, o el inicio del query, para no capturar
 * rutas hermanas del mismo prefijo (`/api/persons-get-places-of-birth`,
 * `/api/person-get-employee/:id`).
 */
export function isPersonWritePath(url: string): boolean {
  return /^\/api\/persons(\/\d+)?(\?|$)/.test(url)
}

/**
 * Normaliza el `E_TOO_MANY_REQUESTS` del limitador: acepta la instancia real y
 * también el objeto con forma de error (`{ code, response }`) que llega cuando
 * el error cruzó un borde de serialización.
 */
export function isPersonWriteRateLimitError(
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
 * Respuesta 429 del sondeo de correo personal (USRH1789762889970).
 *
 * El 429 es deliberadamente **indistinguible entre contadores**: no expone cuál
 * de los límites se topó, ni la identidad sondeada, ni el contador consumido. Por
 * eso `title` y `detail` salen de un catálogo i18n que no interpola nada, y las
 * cabeceras RFC 6585 (limit, remaining, retry-after, reset) describen solo el
 * límite que disparó la respuesta.
 */
export function respondPersonWriteRateLimit(
  ctx: Pick<HttpContext, 'response' | 'i18n'>,
  error: InstanceType<typeof errors.E_TOO_MANY_REQUESTS>
) {
  const definition = PERSON_IDENTITY_ERRORS.EMAIL_PROBE_RATE_LIMITED

  return ctx.response
    .status(definition.status)
    .header('X-RateLimit-Limit', error.response.limit)
    .header('X-RateLimit-Remaining', error.response.remaining)
    .header('Retry-After', error.response.availableIn)
    .header(
      'X-RateLimit-Reset',
      new Date(Date.now() + error.response.availableIn * 1000).toISOString()
    )
    .json({
      title: ctx.i18n.t('person_email_probe_rate_limited_title'),
      detail: ctx.i18n.t('person_email_probe_rate_limited_detail'),
      key: definition.key,
      code: definition.code,
    })
}

/**
 * Respuesta 429 del sondeo de correo personal cuando el contador se calculó fuera
 * del limitador. `limit` va por parámetro —y no desde el módulo del contador— para
 * no crear una dependencia circular entre el helper y el servicio que lo emite.
 * El cuerpo y las cabeceras mantienen la misma forma que
 * `respondPersonWriteRateLimit`; `X-RateLimit-Remaining` es siempre 0 porque el
 * límite ya se superó.
 */
export function respondPersonEmailProbeRateLimit(
  ctx: Pick<HttpContext, 'response' | 'i18n'>,
  retryAfterSeconds: number,
  limit: number
) {
  const definition = PERSON_IDENTITY_ERRORS.EMAIL_PROBE_RATE_LIMITED

  return ctx.response
    .status(definition.status)
    .header('X-RateLimit-Limit', limit)
    .header('X-RateLimit-Remaining', 0)
    .header('Retry-After', retryAfterSeconds)
    .header(
      'X-RateLimit-Reset',
      new Date(Date.now() + retryAfterSeconds * 1000).toISOString()
    )
    .json({
      title: ctx.i18n.t('person_email_probe_rate_limited_title'),
      detail: ctx.i18n.t('person_email_probe_rate_limited_detail'),
      key: definition.key,
      code: definition.code,
    })
}
