import vine from '@vinejs/vine'
import type { FieldContext } from '@vinejs/vine/types'
import { DateTime } from 'luxon'

/** Zona explícita al final del ISO: `Z` o `±HH:mm` / `±HHmm`. */
const EXPLICIT_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i

/**
 * Exige fecha y hora ISO 8601 con zona explícita. Sin zona, Luxon la leería en la
 * zona del servidor y la marca quedaría corrida respecto del navegador.
 */
const isoDateTimeWithOffsetRule = vine.createRule(
  (value: unknown, _: undefined, field: FieldContext) => {
    if (typeof value !== 'string') {
      return
    }

    if (!EXPLICIT_OFFSET.test(value) || !DateTime.fromISO(value, { setZone: true }).isValid) {
      field.report(
        'El campo {{ field }} debe ser una fecha y hora ISO 8601 con zona horaria.',
        'isoDateTimeWithOffset',
        field
      )
    }
  }
)

/**
 * Body de PUT /api/announcements/me. El `userId` nunca viaja en el body: sale de
 * la sesión (anti-IDOR). La regla de "no más de 5 minutos en el futuro" es de
 * dominio y vive en el service.
 */
export const updateLastSeenValidator = vine.compile(
  vine.object({
    lastSeenAt: vine
      .string()
      .trim()
      .maxLength(40)
      .use(isoDateTimeWithOffsetRule())
      .transform((value) => DateTime.fromISO(value, { setZone: true })),
  })
)
