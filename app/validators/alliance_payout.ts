import vine from '@vinejs/vine'

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
