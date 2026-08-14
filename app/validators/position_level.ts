import vine from '@vinejs/vine'

/**
 * Validadores del catálogo de niveles de puesto (USRH1785273891312).
 * `businessUnitId` lo inyecta `middleware.businessScope()` cuando no viene
 * en la petición, por eso puede exigirse aquí sin que el BO lo mande.
 */
export const listPositionLevelsValidator = vine.compile(
  vine.object({
    businessUnitId: vine.number().min(1),
    active: vine.boolean().optional(),
    search: vine.string().trim().maxLength(100).optional(),
  })
)

export const createPositionLevelValidator = vine.compile(
  vine.object({
    businessUnitId: vine.number().min(1),
    positionLevelName: vine.string().trim().minLength(1).maxLength(100),
    // Opcional en alta: el servicio asigna max(rank)+1 cuando no viene (spec §10)
    positionLevelRank: vine.number().withoutDecimals().min(1).optional(),
  })
)

export const updatePositionLevelValidator = vine.compile(
  vine.object({
    positionLevelName: vine.string().trim().minLength(1).maxLength(100),
    // Obligatorio en edición (regla 8)
    positionLevelRank: vine.number().withoutDecimals().min(1),
  })
)

export const setPositionLevelActiveValidator = vine.compile(
  vine.object({
    positionLevelActive: vine.boolean(),
  })
)

export const reorderPositionLevelsValidator = vine.compile(
  vine.object({
    businessUnitId: vine.number().min(1),
    orderedPositionLevelIds: vine.array(vine.number().withoutDecimals().min(1)).minLength(1),
  })
)
