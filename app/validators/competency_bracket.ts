import vine from '@vinejs/vine'

export const createCompetencyBracketValidator = vine.compile(
  vine.object({
    competencyDescriptorId: vine.number().min(1),
    competencyBracketDescription: vine.string().trim().minLength(1),
    competencyBracketRangeMin: vine.number().min(0),
    competencyBracketRangeMax: vine.number().min(0),
    competencyBracketPosition: vine.number().min(1),
  })
)

export const updateCompetencyBracketValidator = vine.compile(
  vine.object({
    competencyBracketDescription: vine.string().trim().minLength(1),
    competencyBracketRangeMin: vine.number().min(0),
    competencyBracketRangeMax: vine.number().min(0),
    competencyBracketPosition: vine.number().min(1),
  })
)
