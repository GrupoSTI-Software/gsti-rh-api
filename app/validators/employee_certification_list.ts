import vine from '@vinejs/vine'

export const employeeCertificationListValidator = vine.compile(
  vine.object({
    page: vine.number().positive().optional(),
    limit: vine.number().positive().max(500).optional(),
    employeeId: vine.number().positive().optional(),
    certificationId: vine.number().positive().optional(),
    categoryId: vine.number().positive().optional(),
  })
)
