import vine from '@vinejs/vine'

const competencyTypeEnum = vine.enum(['technical', 'transversal'] as const)

export const createCompetencyValidator = vine.compile(
  vine.object({
    competencyName: vine.string().trim().minLength(1).maxLength(255),
    competencyType: competencyTypeEnum,
  })
)

export const updateCompetencyValidator = vine.compile(
  vine.object({
    competencyName: vine.string().trim().minLength(1).maxLength(255),
    competencyType: competencyTypeEnum,
  })
)
