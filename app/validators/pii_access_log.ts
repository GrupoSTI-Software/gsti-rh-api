import vine from '@vinejs/vine'

export const piiAccessLogsListValidator = vine.compile(
  vine.object({
    page: vine.number().min(1).optional(),
    limit: vine.number().min(1).max(200).optional(),
    model: vine.string().trim().maxLength(100).optional(),
    column: vine.string().trim().maxLength(100).optional(),
    recordId: vine.number().min(1).optional(),
    accessorUserId: vine.number().min(1).optional(),
    dateFrom: vine.date({ formats: ['YYYY-MM-DD'] }).optional(),
    dateTo: vine.date({ formats: ['YYYY-MM-DD'] }).optional(),
  })
)
