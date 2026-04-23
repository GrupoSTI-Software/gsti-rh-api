import vine from '@vinejs/vine'

export const createAssessmentTemplateDimensionValidator = vine.compile(
  vine.object({
    assessmentTemplateId: vine.number().positive(),
    assessmentTemplateDimensionName: vine.string().trim().minLength(1).maxLength(200),
    assessmentTemplateDimensionAcronym: vine.string().trim().minLength(1).maxLength(20),
  })
)

export const updateAssessmentTemplateDimensionValidator = vine.compile(
  vine.object({
    assessmentTemplateDimensionName: vine.string().trim().minLength(1).maxLength(200),
    assessmentTemplateDimensionAcronym: vine.string().trim().minLength(1).maxLength(20),
  })
)
