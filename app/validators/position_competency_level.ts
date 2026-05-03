import vine from '@vinejs/vine'

export const createPositionCompetencyLevelValidator = vine.compile(
  vine.object({
    positionId: vine.number().positive(),
    competencyId: vine.number().positive(),
    competencyLevelId: vine.number().positive(),
  })
)

export const updatePositionCompetencyLevelValidator = vine.compile(
  vine.object({
    competencyLevelId: vine.number().positive(),
  })
)
