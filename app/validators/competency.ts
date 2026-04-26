import vine from '@vinejs/vine'

const competencyTypeEnum = vine.enum(['technical', 'transversal'] as const)

const levelDescriptionsSchema = vine
  .array(
    vine.object({
      competencyLevelId: vine.number().positive(),
      competencyLevelDescription: vine.string().trim().minLength(1).maxLength(5000),
    })
  )
  .optional()

export const createCompetencyValidator = vine.compile(
  vine.object({
    competencyName: vine.string().trim().minLength(1).maxLength(255),
    competencyType: competencyTypeEnum,
    levelDescriptions: levelDescriptionsSchema,
  })
)

export const updateCompetencyValidator = vine.compile(
  vine.object({
    competencyName: vine.string().trim().minLength(1).maxLength(255),
    competencyType: competencyTypeEnum,
    levelDescriptions: levelDescriptionsSchema,
  })
)
