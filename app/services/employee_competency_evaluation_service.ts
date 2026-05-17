import Employee from '#models/employee'
import EmployeeCompetencyEvaluation from '#models/employee_competency_evaluation'
import PositionBusinessUnitCompetencyLevel from '#models/position_business_unit_competency_level'
import { I18n } from '@adonisjs/i18n'

export default class EmployeeCompetencyEvaluationService {
  private t: (key: string,params?: { [key: string]: string | number }) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
  }
  async create(employeeCompetencyEvaluation: EmployeeCompetencyEvaluation) {
    const newEmployeeCompetencyEvaluation = new EmployeeCompetencyEvaluation()
    newEmployeeCompetencyEvaluation.employeeEvaluationId = employeeCompetencyEvaluation.employeeEvaluationId
    newEmployeeCompetencyEvaluation.positionBusinessUnitCompetencyLevelId = employeeCompetencyEvaluation.positionBusinessUnitCompetencyLevelId
    newEmployeeCompetencyEvaluation.businessUnitCompetencyLevelId = employeeCompetencyEvaluation.businessUnitCompetencyLevelId
    newEmployeeCompetencyEvaluation.competencyBracketId = employeeCompetencyEvaluation.competencyBracketId
    newEmployeeCompetencyEvaluation.employeeCompetencyEvaluationBracketDescription = employeeCompetencyEvaluation.employeeCompetencyEvaluationBracketDescription
    newEmployeeCompetencyEvaluation.employeeCompetencyEvaluationBracketRangeMin = employeeCompetencyEvaluation.employeeCompetencyEvaluationBracketRangeMin
    newEmployeeCompetencyEvaluation.employeeCompetencyEvaluationBracketRangeMax = employeeCompetencyEvaluation.employeeCompetencyEvaluationBracketRangeMax
    newEmployeeCompetencyEvaluation.employeeCompetencyEvaluationScore = employeeCompetencyEvaluation.employeeCompetencyEvaluationScore
    await newEmployeeCompetencyEvaluation.save()
    return newEmployeeCompetencyEvaluation
  }

  async update(currentEmployeeCompetencyEvaluation: EmployeeCompetencyEvaluation, employeeCompetencyEvaluation: EmployeeCompetencyEvaluation) {
    currentEmployeeCompetencyEvaluation.businessUnitCompetencyLevelId = employeeCompetencyEvaluation.businessUnitCompetencyLevelId
    currentEmployeeCompetencyEvaluation.competencyBracketId = employeeCompetencyEvaluation.competencyBracketId
    currentEmployeeCompetencyEvaluation.employeeCompetencyEvaluationScore = employeeCompetencyEvaluation.employeeCompetencyEvaluationScore
    currentEmployeeCompetencyEvaluation.employeeCompetencyEvaluationBracketDescription = employeeCompetencyEvaluation.employeeCompetencyEvaluationBracketDescription
    currentEmployeeCompetencyEvaluation.employeeCompetencyEvaluationBracketRangeMin = employeeCompetencyEvaluation.employeeCompetencyEvaluationBracketRangeMin
    currentEmployeeCompetencyEvaluation.employeeCompetencyEvaluationBracketRangeMax = employeeCompetencyEvaluation.employeeCompetencyEvaluationBracketRangeMax
    await currentEmployeeCompetencyEvaluation.save()
    return currentEmployeeCompetencyEvaluation
  }

  async delete(currentEmployeeCompetencyEvaluation: EmployeeCompetencyEvaluation) {
    await currentEmployeeCompetencyEvaluation.delete()
    return currentEmployeeCompetencyEvaluation
  }

  async show(employeeCompetencyEvaluationId: number) {
    const employeeCompetencyEvaluation = await EmployeeCompetencyEvaluation.query()
      .whereNull('employee_competency_evaluation_deleted_at')
      .where('employee_competency_evaluation_id', employeeCompetencyEvaluationId)
      .preload('businessUnitCompetencyLevel')
      .first()
    return employeeCompetencyEvaluation ? employeeCompetencyEvaluation : null
  }

  async verifyInfoExist(employeeCompetencyEvaluation: EmployeeCompetencyEvaluation) {
    const existEmployee = await Employee.query()
      .whereNull('employee_deleted_at')
      .where('employee_id', employeeCompetencyEvaluation.employeeEvaluationId)
      .first()

    if (!existEmployee && employeeCompetencyEvaluation.employeeEvaluationId) {
      const entity = this.t('employee')
      return {
        status: 400,
        type: 'warning',
        title: this.t('entity_was_not_found', { entity }),
        message: this.t('entity_was_not_found_with_entered_id', { entity }),
        data: { ...employeeCompetencyEvaluation },
      }
    }

    const existPositionBusinessUnitCompetencyLevel = await PositionBusinessUnitCompetencyLevel.query()
      .whereNull('position_business_unit_competency_level_deleted_at')
      .where('position_business_unit_competency_level_id', employeeCompetencyEvaluation.positionBusinessUnitCompetencyLevelId)
      .first()

    if (!existPositionBusinessUnitCompetencyLevel && employeeCompetencyEvaluation.positionBusinessUnitCompetencyLevelId) {
      const entity = this.t('position_business_unit_competency_level')
      return {
        status: 400,
        type: 'warning',
        title: this.t('entity_was_not_found', { entity }),
        message: this.t('entity_was_not_found_with_entered_id', { entity }),
        data: { ...employeeCompetencyEvaluation },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...employeeCompetencyEvaluation },
    }
  }
}
