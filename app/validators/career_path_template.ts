import vine from '@vinejs/vine'

export const createCareerPathTemplateValidator = vine.compile(
  vine.object({
    companyId: vine.number().min(1).optional(),
    originPositionId: vine.number().min(1),
    targetPositionId: vine.number().min(1),
  })
)

export const updateCareerPathTemplateValidator = vine.compile(
  vine.object({
    companyId: vine.number().min(1).optional(),
    originPositionId: vine.number().min(1),
    targetPositionId: vine.number().min(1),
  })
)
