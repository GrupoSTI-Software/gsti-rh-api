import vine from '@vinejs/vine'

export const createCompanyCompetencyLevelValidator = vine.compile(
  vine.object({
    businessUnitId: vine.number().positive(),
    companyCompetencyLevelLabel: vine.string().trim().minLength(1).maxLength(50),
    companyCompetencyLevelPosition: vine.number().positive(),
  })
)

export const updateCompanyCompetencyLevelValidator = vine.compile(
  vine.object({
    companyCompetencyLevelLabel: vine.string().trim().minLength(1).maxLength(50),
    companyCompetencyLevelPosition: vine.number().positive(),
  })
)
