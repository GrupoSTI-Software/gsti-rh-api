import vine from '@vinejs/vine'

export const createPositionBusinessUnitCompetencyLevelValidator = vine.compile(
  vine.object({
    positionId: vine.number().positive(),
    competencyId: vine.number().positive(),
    businessUnitCompetencyLevelId: vine.number().positive(),
  })
)

export const updatePositionBusinessUnitCompetencyLevelValidator = vine.compile(
  vine.object({
    businessUnitCompetencyLevelId: vine.number().positive(),
  })
)
