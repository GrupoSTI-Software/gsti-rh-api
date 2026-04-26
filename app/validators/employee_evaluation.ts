import vine from '@vinejs/vine'

export const createEmployeeEvaluationValidator = vine.compile(
  vine.object({
    employeeId: vine.number().min(1),
    employeeEvaluationDate: vine.string().trim().minLength(1),
    employeeEvaluationType: vine.string().trim().minLength(1),
    employeeEvaluationScore: vine.number().min(0).optional(),
    employeeEvaluationPotential: vine.number().min(0).optional(),
  })
)

export const updateEmployeeEvaluationValidator = vine.compile(
  vine.object({
    employeeEvaluationDate: vine.string().trim().minLength(1),
    employeeEvaluationType: vine.string().trim().minLength(1),
    employeeEvaluationScore: vine.number().min(0).optional(),
    employeeEvaluationPotential: vine.number().min(0).optional(),
  })
)
