// app/Validators/RecordValidator.ts
import vine from '@vinejs/vine'

export const fetchRecordsValidator = vine.compile(
  vine.object({
    employeeId: vine.number().optional(),
    departmentId: vine.number().optional(),
    positionId: vine.number().optional(),
    startDate: vine.date(),
    endDate: vine.date(),
    page: vine.number().min(1).optional(),
    limit: vine.number().min(1).max(100).optional(),
  })
)
