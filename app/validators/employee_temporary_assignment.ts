import vine from '@vinejs/vine'

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/
const MAX_TEMPORARY_ASSIGNMENT_DAYS = 365

export const createEmployeeTemporaryAssignmentValidator = vine.compile(
  vine.object({
    targetBranchId: vine.number().positive(),
    /** Si no se envía, el controlador usa la fecha de hoy (zona UTC-6). */
    startDate: vine.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    days: vine.number().min(1).max(MAX_TEMPORARY_ASSIGNMENT_DAYS),
    destinationShiftId: vine.number().positive().optional(),
    reason: vine.string().trim().in(['cobertura']).optional(),
    shiftOverride: vine
      .object({
        startTime: vine.string().regex(timeRegex),
        endTime: vine.string().regex(timeRegex),
      })
      .optional(),
  })
)

export const updateEmployeeTemporaryAssignmentValidator = vine.compile(
  vine.object({
    startDate: vine.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    days: vine.number().min(1).max(MAX_TEMPORARY_ASSIGNMENT_DAYS).optional(),
    destinationShiftId: vine.number().positive().optional(),
    reason: vine.string().trim().in(['cobertura']).nullable().optional(),
  })
)

export const cancelEmployeeTemporaryAssignmentValidator = vine.compile(
  vine.object({
    cancelDate: vine.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
)

export const listEmployeeTemporaryAssignmentValidator = vine.compile(
  vine.object({
    from: vine.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: vine.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
)
