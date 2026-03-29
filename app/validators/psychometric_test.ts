import vine from '@vinejs/vine'

export const createPsychometricTestValidator = vine.compile(
  vine.object({
    psychometricTestName: vine.string().trim().minLength(1).maxLength(200),
    psychometricTestDescription: vine.string().trim().maxLength(2000).optional(),
    dimensions: vine
      .array(
        vine.object({
          psychometricTestDimensionName: vine.string().trim().minLength(1).maxLength(200),
          psychometricTestDimensionAcronym: vine.string().trim().minLength(1).maxLength(20),
        })
      )
      .optional(),
  })
)

export const updatePsychometricTestValidator = vine.compile(
  vine.object({
    psychometricTestName: vine.string().trim().minLength(1).maxLength(200),
    psychometricTestDescription: vine.string().trim().maxLength(2000).optional(),
    dimensions: vine
      .array(
        vine.object({
          psychometricTestDimensionId: vine.number().positive().optional(),
          psychometricTestDimensionName: vine.string().trim().minLength(1).maxLength(200),
          psychometricTestDimensionAcronym: vine.string().trim().minLength(1).maxLength(20),
        })
      )
      .optional(),
  })
)
