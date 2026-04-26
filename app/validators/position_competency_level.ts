import vine from '@vinejs/vine'

export const createPositionCompetencyLevelValidator = vine.compile(
  vine.object({
    positionId: vine.number().positive(),
    competencyId: vine.number().positive(),
    positionCompetencyLevelInDevelopmentDescription: vine
      .string()
      .trim()
      .maxLength(5000)
      .nullable()
      .optional(),
    positionCompetencyLevelCapableDescription: vine
      .string()
      .trim()
      .maxLength(5000)
      .nullable()
      .optional(),
    positionCompetencyLevelExpertDescription: vine
      .string()
      .trim()
      .maxLength(5000)
      .nullable()
      .optional(),
  })
)

export const updatePositionCompetencyLevelValidator = vine.compile(
  vine.object({
    positionCompetencyLevelInDevelopmentDescription: vine
      .string()
      .trim()
      .maxLength(5000)
      .nullable()
      .optional(),
    positionCompetencyLevelCapableDescription: vine
      .string()
      .trim()
      .maxLength(5000)
      .nullable()
      .optional(),
    positionCompetencyLevelExpertDescription: vine
      .string()
      .trim()
      .maxLength(5000)
      .nullable()
      .optional(),
  })
)
