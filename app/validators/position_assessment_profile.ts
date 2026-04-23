import vine from '@vinejs/vine'

export const createPositionAssessmentProfileValidator = vine.compile(
  vine.object({
    positionId: vine.number().positive(),
    assessmentTemplateDimensionId: vine.number().positive(),
    positionAssessmentProfileMinimumValue: vine.number().min(0),
    positionAssessmentProfileMaximumValue: vine.number().min(0),
  })
)

export const updatePositionAssessmentProfileValidator = vine.compile(
  vine.object({
    positionAssessmentProfileMinimumValue: vine.number().min(0),
    positionAssessmentProfileMaximumValue: vine.number().min(0),
  })
)
