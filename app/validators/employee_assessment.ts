import vine from '@vinejs/vine'

export const createEmployeeAssessmentValidator = vine.compile(
  vine.object({
    employeeId: vine.number().positive(),
    assessmentTemplateId: vine.number().positive(),
    employeeAssessmentDate: vine.string().trim().minLength(1),
    results: vine
      .array(
        vine.object({
          assessmentTemplateDimensionId: vine.number().positive(),
          employeeAssessmentResultValue: vine
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

export const updateEmployeeAssessmentValidator = vine.compile(
  vine.object({
    employeeAssessmentDate: vine.string().trim().minLength(1).optional(),
    results: vine
      .array(
        vine.object({
          assessmentTemplateDimensionId: vine.number().positive(),
          employeeAssessmentResultValue: vine
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
