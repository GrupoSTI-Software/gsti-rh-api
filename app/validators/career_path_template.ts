import vine from '@vinejs/vine'

export const createCareerPathTemplateValidator = vine.compile(
  vine.object({
    originPositionId: vine.number().min(1),
    targetPositionId: vine.number().min(1),
  })
)

export const updateCareerPathTemplateValidator = vine.compile(
  vine.object({
    originPositionId: vine.number().min(1),
    targetPositionId: vine.number().min(1),
  })
)
