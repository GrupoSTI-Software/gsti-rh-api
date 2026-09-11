import vine from '@vinejs/vine'

/**
 * Body para `POST /api/platform/alliance-attributions`.
 *
 * El rango de la comisión (0..100, máx. 2 decimales) y del plazo (entero ≥ 1
 * o null) lo afirma el servicio para emitir `PLT.ALL.COMMISSION_OUT_OF_RANGE`
 * y `PLT.ALL.TERM_PERIODS_INVALID` en vez de un `VAL_INPUT` genérico.
 *
 * `allianceAttributionTermPeriods` tiene tres estados: ausente hereda,
 * `null` deja indeterminado, número fija la condición propia.
 */
export const createAllianceAttributionValidator = vine.compile(
  vine.object({
    allianceId: vine.number().positive().withoutDecimals(),
    businessUnitPublicId: vine.string().trim().uuid(),
    allianceAttributionStartsAt: vine.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
    allianceAttributionCommissionPercent: vine.number().optional(),
    allianceAttributionTermPeriods: vine.number().withoutDecimals().optional().nullable(),
  })
)
