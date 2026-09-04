import vine from '@vinejs/vine'

/**
 * Body para `POST /api/platform/alliances`.
 *
 * El rango de la comisión (0..100, máx. 2 decimales) y del plazo (entero ≥ 1
 * o null) lo afirma el servicio para emitir `PLT.ALL.COMMISSION_OUT_OF_RANGE`
 * y `PLT.ALL.TERM_PERIODS_INVALID` en vez de un `VAL_INPUT` genérico.
 */
export const createAllianceValidator = vine.compile(
  vine.object({
    allianceName: vine.string().trim().minLength(1).maxLength(160),
    allianceContactName: vine.string().trim().maxLength(160).optional().nullable(),
    allianceContactEmail: vine.string().trim().email().maxLength(191).optional().nullable(),
    allianceContactPhone: vine.string().trim().maxLength(30).optional().nullable(),
    allianceDefaultCommissionPercent: vine.number(),
    allianceDefaultTermPeriods: vine.number().withoutDecimals().optional().nullable(),
  })
)

/**
 * Body para `PATCH /api/platform/alliances/:allianceId`.
 * Todos los campos son opcionales. `allianceActive` no se acepta: el estado
 * se cambia por los endpoints dedicados de activar y desactivar.
 */
export const updateAllianceValidator = vine.compile(
  vine.object({
    allianceName: vine.string().trim().minLength(1).maxLength(160).optional(),
    allianceContactName: vine.string().trim().maxLength(160).optional().nullable(),
    allianceContactEmail: vine.string().trim().email().maxLength(191).optional().nullable(),
    allianceContactPhone: vine.string().trim().maxLength(30).optional().nullable(),
    allianceDefaultCommissionPercent: vine.number().optional(),
    allianceDefaultTermPeriods: vine.number().withoutDecimals().optional().nullable(),
  })
)

/** Query para `GET /api/platform/alliances`. */
export const listAlliancesValidator = vine.compile(
  vine.object({
    search: vine.string().trim().optional(),
    active: vine.number().min(0).max(1).withoutDecimals().optional(),
    page: vine.number().positive().withoutDecimals().optional(),
    limit: vine.number().positive().withoutDecimals().max(100).optional(),
  })
)
