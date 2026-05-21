import vine from '@vinejs/vine'

export const createEmployeeCompetencyEvaluationValidator = vine.compile(
  vine.object({
    employeeEvaluationId: vine.number().min(1),
    positionBusinessUnitCompetencyLevelId: vine.number().positive(),
    businessUnitCompetencyLevelId: vine.number().positive(),
    competencyBracketId: vine.number().positive().optional(),
    employeeCompetencyEvaluationBracketDescription: vine.string().trim().minLength(1).optional(),
    employeeCompetencyEvaluationBracketRangeMin: vine.number().min(0).optional(),
    employeeCompetencyEvaluationBracketRangeMax: vine.number().min(0).optional(),
    employeeCompetencyEvaluationScore: vine.number().min(0),
  })
)

export const updateEmployeeCompetencyEvaluationValidator = vine.compile(
  vine.object({
    businessUnitCompetencyLevelId: vine.number().positive(),
    competencyBracketId: vine.number().positive().optional(),
    employeeCompetencyEvaluationBracketDescription: vine.string().trim().minLength(1).optional(),
    employeeCompetencyEvaluationBracketRangeMin: vine.number().min(0).optional(),
    employeeCompetencyEvaluationBracketRangeMax: vine.number().min(0).optional(),
    employeeCompetencyEvaluationScore: vine.number().min(0),
  })
)
