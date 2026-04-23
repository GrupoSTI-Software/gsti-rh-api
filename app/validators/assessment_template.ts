import vine from '@vinejs/vine'

export const createAssessmentTemplateValidator = vine.compile(
  vine.object({
    assessmentTemplateName: vine.string().trim().minLength(1).maxLength(200),
    assessmentTemplateDescription: vine.string().trim().maxLength(2000).optional(),
    dimensions: vine
      .array(
        vine.object({
          assessmentTemplateDimensionName: vine.string().trim().minLength(1).maxLength(200),
          assessmentTemplateDimensionAcronym: vine.string().trim().minLength(1).maxLength(20),
        })
      )
      .optional(),
  })
)

export const updateAssessmentTemplateValidator = vine.compile(
  vine.object({
    assessmentTemplateName: vine.string().trim().minLength(1).maxLength(200),
    assessmentTemplateDescription: vine.string().trim().maxLength(2000).optional(),
    dimensions: vine
      .array(
        vine.object({
          assessmentTemplateDimensionId: vine.number().positive().optional(),
          assessmentTemplateDimensionName: vine.string().trim().minLength(1).maxLength(200),
          assessmentTemplateDimensionAcronym: vine.string().trim().minLength(1).maxLength(20),
        })
      )
      .optional(),
  })
)
