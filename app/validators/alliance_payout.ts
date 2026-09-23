import vine from '@vinejs/vine'
import type { FieldContext } from '@vinejs/vine/types'

/** Máximo de comisiones que puede agrupar una sola liquidación (regla 2). */
export const ALLIANCE_PAYOUT_MAX_COMMISSIONS = 200

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
/** Una sola línea: sin caracteres de control Unicode (`\n`, `\r`, etc.). */
const SINGLE_LINE = /^[^\p{Cc}]*$/u

/**
 * Body de `POST /api/platform/alliances/:allianceId/payouts`.
 *
 * Sin `allianceId` ni campos de actor: la alianza la da la ruta y el
 * actor lo toma el controlador de la sesión (regla 3). La fecha de
 * calendario real, `paidOn ≤ hoy` y `paidOn ≥` la comisión más reciente
 * del conjunto los afirma el servicio (regla 4).
 */
/**
 * Query de `GET /api/platform/alliances/:allianceId/payouts`.
 * `page` y `limit` son opcionales (el servicio aplica los valores por omisión).
 */
export const listAlliancePayoutsValidator = vine.compile(
  vine.object({
    page: vine.number().positive().withoutDecimals().optional(),
    limit: vine.number().positive().withoutDecimals().max(100).optional(),
  })
)

/**
 * Valida que el motivo de anulación no contenga caracteres de control,
 * salvo tabulador (U+0009), LF (U+000A) y CR (U+000D). Los rechazados son
 * los rangos U+0000-U+0008, U+000B, U+000C, U+000E-U+001F y U+007F-U+009F.
 * Se usa `\p{Cc}` (Unicode clase de categoría "Other, Control") filtrando
 * los tres permitidos; así eslint no aplica `no-control-regex`.
 */
const isAnnulmentReasonAllowed = (reason: string): boolean => {
  for (const char of reason) {
    const cp = char.codePointAt(0) ?? 0
    // Permitidos explícitamente: TAB (9), LF (10), CR (13)
    if (cp === 9 || cp === 10 || cp === 13) continue
    // Bloques de control rechazados
    if ((cp >= 0 && cp <= 8) || cp === 11 || cp === 12 || (cp >= 14 && cp <= 31) || (cp >= 127 && cp <= 159)) {
      return false
    }
  }
  return true
}

/** Máximo de caracteres del motivo de anulación (regla 5). */
export const ALLIANCE_PAYOUT_ANNULMENT_REASON_MAX_LENGTH = 500

/**
 * Regla VineJS que rechaza caracteres de control en el motivo de anulación,
 * salvo tabulador, LF y CR (regla 5 de USRH1787719056821).
 */
const annulmentReasonRule = vine.createRule((value: unknown, _: undefined, field: FieldContext) => {
  if (typeof value !== 'string') return
  if (!isAnnulmentReasonAllowed(value)) {
    field.report(
      'El campo {{ field }} contiene caracteres de control no permitidos.',
      'annulmentReasonControl',
      field
    )
  }
})

/**
 * Body de `POST /api/platform/alliance-payouts/:alliancePayoutId/annul`.
 * Sin campos de actor ni de fecha: el actor sale del token y la fecha la
 * pone el servidor (regla 6).
 */
export const annulAlliancePayoutValidator = vine.compile(
  vine.object({
    reason: vine
      .string()
      .trim()
      .minLength(1)
      .maxLength(ALLIANCE_PAYOUT_ANNULMENT_REASON_MAX_LENGTH)
      .use(annulmentReasonRule()),
  })
)

export const createAlliancePayoutValidator = vine.compile(
  vine.object({
    commissionIds: vine
      .array(vine.number().positive().withoutDecimals())
      .minLength(1)
      .maxLength(ALLIANCE_PAYOUT_MAX_COMMISSIONS)
      .distinct(),
    paidOn: vine.string().trim().regex(ISO_DATE),
    reference: vine.string().trim().minLength(1).maxLength(160).regex(SINGLE_LINE),
  })
)
