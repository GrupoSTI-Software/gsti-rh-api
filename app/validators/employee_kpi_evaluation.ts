import vine from '@vinejs/vine'

export const createEmployeeKpiEvaluationValidator = vine.compile(
  vine.object({
    employeeEvaluationId: vine.number().min(1),
    positionKpiId: vine.number().positive(),
    employeeKpiEvaluationScore: vine.number().min(0),
  })
)

export const updateEmployeeKpiEvaluationValidator = vine.compile(
  vine.object({
    employeeKpiEvaluationScore: vine.number().min(0),
  })
)
