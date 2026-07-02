import vine from '@vinejs/vine'

const ACTION_STATUSES = ['pendiente', 'en-curso', 'cumplida'] as const

export const createAttentionProgramActionValidator = vine.compile(
  vine.object({
    psychosocialDimensionId: vine.number().positive().optional(),
    attentionActionLevelId: vine.number().positive().optional(),
    target: vine.string().trim().minLength(1).maxLength(4000).optional(),
    description: vine.string().trim().minLength(1).maxLength(4000).optional(),
    startDate: vine.date({ formats: ['YYYY-MM-DD'] }).optional(),
    endDate: vine.date({ formats: ['YYYY-MM-DD'] }).optional(),
    progress: vine.string().trim().minLength(1).maxLength(4000).optional(),
    evaluation: vine.string().trim().minLength(1).maxLength(4000).optional(),
    responsible: vine.string().trim().minLength(1).maxLength(150).optional(),
    status: vine.enum([...ACTION_STATUSES]).optional(),
  })
)

export const updateAttentionProgramActionValidator = vine.compile(
  vine.object({
    psychosocialDimensionId: vine.number().positive().optional(),
    attentionActionLevelId: vine.number().positive().optional(),
    target: vine.string().trim().minLength(1).maxLength(4000).optional(),
    description: vine.string().trim().minLength(1).maxLength(4000).optional(),
    startDate: vine.date({ formats: ['YYYY-MM-DD'] }).optional(),
    endDate: vine.date({ formats: ['YYYY-MM-DD'] }).optional(),
    progress: vine.string().trim().minLength(1).maxLength(4000).optional(),
    evaluation: vine.string().trim().minLength(1).maxLength(4000).optional(),
    responsible: vine.string().trim().minLength(1).maxLength(150).optional(),
    status: vine.enum([...ACTION_STATUSES]).optional(),
  })
)
