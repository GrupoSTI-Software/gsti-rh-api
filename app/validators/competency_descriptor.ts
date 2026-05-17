import vine from '@vinejs/vine'

export const createCompetencyDescriptorValidator = vine.compile(
  vine.object({
    competencyId: vine.number().min(1),
    businessUnitCompetencyLevelId: vine.number().min(1),
    competencyDescriptorDescription: vine.string().trim().minLength(1),
  })
)

export const updateCompetencyDescriptorValidator = vine.compile(
  vine.object({
    competencyId: vine.number().min(1),
    businessUnitCompetencyLevelId: vine.number().min(1),
    competencyDescriptorDescription: vine.string().trim().minLength(1),
  })
)
