import vine from '@vinejs/vine'
import Employee from '#models/employee'

export const createEmployeeAnnotationValidator = vine.compile(
  vine.object({
    employeeId: vine.number().exists(async (_db, value) => {
      const employee = await Employee.query()
        .whereNull('employee_deleted_at')
        .where('employee_id', value)
        .first()
      return !!employee
    }),
    employeeAnnotationContent: vine.string().trim().minLength(1).maxLength(5000),
  })
)

export const updateEmployeeAnnotationValidator = vine.compile(
  vine.object({
    employeeAnnotationContent: vine.string().trim().minLength(1).maxLength(5000).optional(),
  })
)
