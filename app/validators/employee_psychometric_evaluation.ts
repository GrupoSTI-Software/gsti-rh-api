import vine from '@vinejs/vine'

export const createEmployeePsychometricEvaluationValidator = vine.compile(
  vine.object({
    employeeId: vine.number().positive(),
    psychometricTestId: vine.number().positive(),
    employeePsychometricEvaluationDate: vine.string().trim().minLength(1),
    results: vine
      .array(
        vine.object({
          psychometricTestDimensionId: vine.number().positive(),
          employeePsychometricEvaluationResultValue: vine
            .string()
            .trim()
            .maxLength(255)
            .nullable()
            .optional(),
        })
      )
      .optional(),
  })
)

export const updateEmployeePsychometricEvaluationValidator = vine.compile(
  vine.object({
    employeePsychometricEvaluationDate: vine.string().trim().minLength(1).optional(),
    results: vine
      .array(
        vine.object({
          psychometricTestDimensionId: vine.number().positive(),
          employeePsychometricEvaluationResultValue: vine
            .string()
            .trim()
            .maxLength(255)
            .nullable()
            .optional(),
        })
      )
      .optional(),
  })
)
