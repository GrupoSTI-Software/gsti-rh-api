import vine from '@vinejs/vine'

export const createPsychometricTestDimensionValidator = vine.compile(
  vine.object({
    psychometricTestId: vine.number().positive(),
    psychometricTestDimensionName: vine.string().trim().minLength(1).maxLength(200),
    psychometricTestDimensionAcronym: vine.string().trim().minLength(1).maxLength(20),
  })
)

export const updatePsychometricTestDimensionValidator = vine.compile(
  vine.object({
    psychometricTestDimensionName: vine.string().trim().minLength(1).maxLength(200),
    psychometricTestDimensionAcronym: vine.string().trim().minLength(1).maxLength(20),
  })
)
