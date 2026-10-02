import vine from '@vinejs/vine'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Query para `GET /api/platform/alliances/:allianceId/commissions`.
 *
 * `from`/`to` solo validan la forma (regex); la fecha de calendario real
 * y `from ≤ to` los afirma el servicio (mismo criterio que
 * `assertStartsAtCalendarDate` en `alliance_attribution_service.ts`).
 * `limit` se topa en 100; el servicio usa 20 por omisión.
 */
export const listAllianceCommissionsValidator = vine.compile(
  vine.object({
    from: vine.string().trim().regex(ISO_DATE).optional(),
    to: vine.string().trim().regex(ISO_DATE).optional(),
    /** Acota solo el detalle (regla 13); ausente = todas. */
    status: vine.enum(['pending', 'paid'] as const).optional(),
    page: vine.number().min(1).withoutDecimals().optional(),
    limit: vine.number().min(1).withoutDecimals().max(100).optional(),
  })
)
