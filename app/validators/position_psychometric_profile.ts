import vine from '@vinejs/vine'

export const createPositionPsychometricProfileValidator = vine.compile(
  vine.object({
    positionId: vine.number().positive(),
    psychometricTestDimensionId: vine.number().positive(),
    positionPsychometricProfileMinimumValue: vine.number().min(0),
    positionPsychometricProfileMaximumValue: vine.number().min(0),
  })
)

export const updatePositionPsychometricProfileValidator = vine.compile(
  vine.object({
    positionPsychometricProfileMinimumValue: vine.number().min(0),
    positionPsychometricProfileMaximumValue: vine.number().min(0),
  })
)
