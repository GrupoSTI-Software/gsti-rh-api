import Employee from '#models/employee'
import EmployeeCompetencyEvaluation from '#models/employee_competency_evaluation'
import PositionCompetency from '#models/position_competency'
import { I18n } from '@adonisjs/i18n'

export default class EmployeeCompetencyEvaluationService {
  private t: (key: string,params?: { [key: string]: string | number }) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
  }
  async create(employeeCompetencyEvaluation: EmployeeCompetencyEvaluation) {
    const newEmployeeCompetencyEvaluation = new EmployeeCompetencyEvaluation()
    newEmployeeCompetencyEvaluation.employeeEvaluationId = employeeCompetencyEvaluation.employeeEvaluationId
    newEmployeeCompetencyEvaluation.positionCompetencyId = employeeCompetencyEvaluation.positionCompetencyId
    newEmployeeCompetencyEvaluation.weightId = employeeCompetencyEvaluation.weightId
    await newEmployeeCompetencyEvaluation.save()
    return newEmployeeCompetencyEvaluation
  }

  async update(currentEmployeeCompetencyEvaluation: EmployeeCompetencyEvaluation, employeeCompetencyEvaluation: EmployeeCompetencyEvaluation) {
    currentEmployeeCompetencyEvaluation.weightId = employeeCompetencyEvaluation.weightId
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

    const existPositionCompetency = await PositionCompetency.query()
      .whereNull('position_competency_deleted_at')
      .where('position_competency_id', employeeCompetencyEvaluation.positionCompetencyId)
      .first()

    if (!existPositionCompetency && employeeCompetencyEvaluation.positionCompetencyId) {
      const entity = this.t('position_competency')
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
