import vine from '@vinejs/vine'

export const createPositionSpecificFunctionValidator = vine.compile(
  vine.object({
    positionId: vine.number().min(1),
    positionSpecificFunctionName: vine.string().minLength(1),
    positionSpecificFunctionFrequency: vine.string().minLength(1),
  })
)
