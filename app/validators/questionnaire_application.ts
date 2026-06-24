import vine from '@vinejs/vine'
import { QUESTIONNAIRE_APPLICATION_STATUSES } from '#constants/questionnaire_application'

export const createQuestionnaireApplicationValidator = vine.compile(
  vine.object({
    branchOfficeId: vine.number().positive(),
  })
)

export const listQuestionnaireApplicationsValidator = vine.compile(
  vine.object({
    branchOfficeId: vine.number().positive().optional(),
    status: vine.enum([...QUESTIONNAIRE_APPLICATION_STATUSES]).optional(),
    page: vine.number().positive().optional(),
    limit: vine.number().positive().max(100).optional(),
  })
)

export const showQuestionnaireApplicationValidator = vine.compile(
  vine.object({
    questionnaireApplicationId: vine.number().positive(),
  })
)

export const listQuestionnaireApplicationTargetsValidator = vine.compile(
  vine.object({
    status: vine.enum(['pendiente', 'respondido']).optional(),
    search: vine.string().trim().minLength(1).optional(),
  })
)
