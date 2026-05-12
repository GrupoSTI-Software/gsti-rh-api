import vine from '@vinejs/vine'

export const createEmployeeCompetencyEvaluationValidator = vine.compile(
  vine.object({
    employeeEvaluationId: vine.number().min(1),
    positionBusinessUnitCompetencyLevelId: vine.number().positive(),
    businessUnitCompetencyLevelId: vine.number().positive(),
    competencyBracketId: vine.number().positive(),
  })
)

export const updateEmployeeCompetencyEvaluationValidator = vine.compile(
  vine.object({
    businessUnitCompetencyLevelId: vine.number().positive(),
    competencyBracketId: vine.number().positive(),
  })
)
