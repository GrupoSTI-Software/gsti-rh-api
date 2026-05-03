import vine from '@vinejs/vine'

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/

export const createEmployeeTemporaryAssignmentValidator = vine.compile(
  vine.object({
    targetBranchId: vine.number().positive(),
    /** Si no se envía, el controlador usa la fecha de hoy (zona UTC-6). */
    startDate: vine.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    days: vine.number().min(1),
    shiftOverride: vine
      .object({
        startTime: vine.string().regex(timeRegex),
        endTime: vine.string().regex(timeRegex),
      })
      .optional(),
  })
)
