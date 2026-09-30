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
 * Devuelve `value` si es un número utilizable; si no, el valor por defecto.
 * El error del limitador puede cruzar un borde de serialización y llegar sin
 * los contadores, y el 429 debe salir igual con sus cuatro cabeceras en vez de
 * romper con `RangeError`.
 */
function resolveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * Builder privado de la respuesta 429, compartido por los DOS emisores del
 * sondeo de correo personal. Existe por seguridad, no por DRY: mientras el
 * cuerpo y las cabeceras se mantuvieran como dos copias literales, cambiar una
 * sola rompería la garantía de indistinguibilidad entre contadores SIN que
 * fallara ninguna prueba. El emisor solo aporta sus cuatro valores propios
 * (limit, remaining, retry-after y el instante de reset); el resto —status,
 * nombres de cabecera, catálogo i18n y orden de las llaves— vive aquí una sola
 * vez, así que las dos respuestas son idénticas por construcción.
 */
function emitPersonRateLimit(
  ctx: Pick<HttpContext, 'response' | 'i18n'>,
  values: { limit: number; remaining: number; retryAfter: number; reset: string }
) {
  const definition = PERSON_IDENTITY_ERRORS.EMAIL_PROBE_RATE_LIMITED

  return ctx.response
    .status(definition.status)
    .header('X-RateLimit-Limit', values.limit)
    .header('X-RateLimit-Remaining', values.remaining)
    .header('Retry-After', values.retryAfter)
    .header('X-RateLimit-Reset', values.reset)
    .json({
      title: ctx.i18n.t('person_email_probe_rate_limited_title'),
      detail: ctx.i18n.t('person_email_probe_rate_limited_detail'),
      key: definition.key,
      code: definition.code,
    })
}

/**
 * Respuesta 429 del sondeo de correo personal (USRH1789762889970).
 *
 * El 429 es deliberadamente **indistinguible entre contadores**: no expone cuál
 * de los límites se topó, ni la identidad sondeada, ni el contador consumido. Por
 * eso `title` y `detail` salen de un catálogo i18n que no interpola nada, y las
 * cabeceras RFC 6585 (limit, remaining, retry-after, reset) describen solo el
 * límite que disparó la respuesta.
 *
 * El predicado `isPersonWriteRateLimitError` acepta también el objeto con forma
 * de error (`{ code, response }`), que puede llegar con `response` vacío: en ese
 * caso cada cabecera cae a un valor por defecto sensato (limit/remaining 0 y
 * `Retry-After` 0, con `X-RateLimit-Reset` en el instante actual) para que el
 * 429 siempre se emita con las cuatro cabeceras.
 */
export function respondPersonWriteRateLimit(
  ctx: Pick<HttpContext, 'response' | 'i18n'>,
  error: InstanceType<typeof errors.E_TOO_MANY_REQUESTS>
) {
  const rawResponse = (error as unknown as { response?: Record<string, unknown> }).response
  const limit = resolveNumber(rawResponse?.limit, 0)
  const remaining = resolveNumber(rawResponse?.remaining, 0)
  const availableIn = resolveNumber(rawResponse?.availableIn, 0)

  return emitPersonRateLimit(ctx, {
    limit,
    remaining,
    retryAfter: availableIn,
    reset: new Date(Date.now() + availableIn * 1000).toISOString(),
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
  return emitPersonRateLimit(ctx, {
    limit,
    remaining: 0,
    retryAfter: retryAfterSeconds,
    reset: new Date(Date.now() + retryAfterSeconds * 1000).toISOString(),
  })
}
