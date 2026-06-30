import vine from '@vinejs/vine'
import { ATTENTION_PROGRAM_STATUSES_FOR_UPDATE, ATTENTION_PROGRAM_STATUSES_FOR_FILTER } from '#constants/attention_program'

export const listAttentionProgramsValidator = vine.compile(
  vine.object({
    status: vine.enum([...ATTENTION_PROGRAM_STATUSES_FOR_FILTER]).optional(),
    page: vine.number().positive().optional(),
    limit: vine.number().positive().max(100).optional(),
  })
)

export const createAttentionProgramValidator = vine.compile(
  vine.object({
    year: vine.number().min(2000).max(2100),
    period: vine.string().trim().maxLength(100).optional(),
    questionnaireApplicationId: vine.number().positive().optional(),
  })
)

export const updateAttentionProgramValidator = vine.compile(
  vine.object({
    period: vine.string().trim().maxLength(100).optional(),
    status: vine.enum([...ATTENTION_PROGRAM_STATUSES_FOR_UPDATE]).optional(),
  })
)
