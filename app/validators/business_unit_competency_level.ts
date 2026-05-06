import vine from '@vinejs/vine'

export const createBusinessUnitCompetencyLevelValidator = vine.compile(
  vine.object({
    businessUnitCompetencyLevelLabel: vine.string().trim().minLength(1).maxLength(50),
    businessUnitCompetencyLevelPosition: vine.number().positive(),
  })
)

export const updateBusinessUnitCompetencyLevelValidator = vine.compile(
  vine.object({
    businessUnitCompetencyLevelLabel: vine.string().trim().minLength(1).maxLength(50),
    businessUnitCompetencyLevelPosition: vine.number().positive(),
  })
)
