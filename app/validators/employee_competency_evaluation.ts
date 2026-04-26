import vine from '@vinejs/vine'

export const createEmployeeCompetencyEvaluationValidator = vine.compile(
  vine.object({
    employeeEvaluationId: vine.number().min(1),
    positionCompetencyId: vine.number().positive(),
    weightId: vine.number().min(1),
  })
)

export const updateEmployeeCompetencyEvaluationValidator = vine.compile(
  vine.object({
    weightId: vine.number().min(1),
  })
)
