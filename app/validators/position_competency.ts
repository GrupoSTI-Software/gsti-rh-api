import vine from '@vinejs/vine'

export const createPositionCompetencyValidator = vine.compile(
  vine.object({
    positionId: vine.number().min(1),
    weightId: vine.number().min(1),
    competencyId: vine.number().min(1),
    positionCompetencyName: vine.string().minLength(1),
    positionCompetencyType: vine.string().minLength(1),
  })
)
