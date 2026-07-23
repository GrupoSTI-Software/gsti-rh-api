import vine from '@vinejs/vine'

/**
 * Validador del body de E6 — `POST /api/employee-badges/bulk` (USRH1784690015411).
 * Sin `maxLength` en `empleadoIds` (decisión de producto: sin tope).
 * Toda validación ocurre ANTES del primer byte del stream.
 */
export const bulkBadgesValidator = vine.compile(
  vine.object({
    empleadoIds: vine.array(vine.number().withoutDecimals().positive()).minLength(1),
    formato: vine.enum(['pdf', 'png']).optional(),
  })
)

export type BulkBadgesPayload = {
  empleadoIds: number[]
  formato?: 'pdf' | 'png'
}
