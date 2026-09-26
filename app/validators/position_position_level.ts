import vine from '@vinejs/vine'

/**
 * Validadores de la configuración de niveles por puesto (USRH1785273891313).
 * Vine solo valida tipos y forma (→ 400 `datos-invalidos`); el XOR de la
 * regla 5, los duplicados, el catálogo vigente y las reglas de default se
 * validan en el servicio con sus keys específicas (spec §6).
 */
export const listPositionPositionLevelsValidator = vine.compile(
  vine.object({
    active: vine.boolean().optional(),
  })
)

export const replacePositionPositionLevelsValidator = vine.compile(
  vine.object({
    // Sin minLength: un bloque vacío es válido y deja el puesto sin niveles (regla 1)
    levels: vine.array(
      vine.object({
        positionPositionLevelId: vine.number().withoutDecimals().min(1).nullable().optional(),
        positionLevelId: vine.number().withoutDecimals().min(1).nullable().optional(),
        // Sin minLength: el nombre vacío debe llegar al servicio para responder
        // 422 `nivel-propio-sin-nombre`, no 400 (spec §6)
        positionPositionLevelAdHocName: vine.string().trim().maxLength(100).nullable().optional(),
        positionPositionLevelRank: vine.number().withoutDecimals().min(1),
        positionPositionLevelIsDefault: vine.boolean(),
        positionPositionLevelActive: vine.boolean(),
      })
    ),
  })
)
