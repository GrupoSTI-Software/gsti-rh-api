import Employee from '#models/employee'
import EmployeeEvaluation from '#models/employee_evaluation'
import { I18n } from '@adonisjs/i18n'

export default class EmployeeEvaluationService {
  private t: (key: string,params?: { [key: string]: string | number }) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
  }
  async create(employeeEvaluation: EmployeeEvaluation) {
    const newEmployeeEvaluation = new EmployeeEvaluation()
    newEmployeeEvaluation.employeeId = employeeEvaluation.employeeId
    newEmployeeEvaluation.employeeEvaluationDate = employeeEvaluation.employeeEvaluationDate
    newEmployeeEvaluation.employeeEvaluationType = employeeEvaluation.employeeEvaluationType
    newEmployeeEvaluation.employeeEvaluationScore = employeeEvaluation.employeeEvaluationScore
    await newEmployeeEvaluation.save()
    return newEmployeeEvaluation
  }

  async update(currentEmployeeEvaluation: EmployeeEvaluation, employeeEvaluation: EmployeeEvaluation) {
    currentEmployeeEvaluation.employeeEvaluationDate = employeeEvaluation.employeeEvaluationDate
    currentEmployeeEvaluation.employeeEvaluationType = employeeEvaluation.employeeEvaluationType
    currentEmployeeEvaluation.employeeEvaluationScore = employeeEvaluation.employeeEvaluationScore
    await currentEmployeeEvaluation.save()
    return currentEmployeeEvaluation
  }

  async delete(currentEmployeeEvaluation: EmployeeEvaluation) {
    await currentEmployeeEvaluation.delete()
    return currentEmployeeEvaluation
  }

  async show(employeeEvaluationId: number) {
    const employeeEvaluation = await EmployeeEvaluation.query()
      .whereNull('employee_evaluation_deleted_at')
      .where('employee_evaluation_id', employeeEvaluationId)
      .preload('employeeCompetencyEvaluations')
      .preload('employeeKpiEvaluations')
      .first()
    return employeeEvaluation ? employeeEvaluation : null
  }

  async verifyInfoExist(employeeEvaluation: EmployeeEvaluation) {
    const existEmployee = await Employee.query()
      .whereNull('employee_deleted_at')
      .where('employee_id', employeeEvaluation.employeeId)
      .first()

    if (!existEmployee && employeeEvaluation.employeeId) {
      const entity = this.t('employee')
      return {
        status: 400,
        type: 'warning',
        title: this.t('entity_was_not_found', { entity }),
        message: this.t('entity_was_not_found_with_entered_id', { entity }),
        data: { ...employeeEvaluation },
      }
    }

    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...employeeEvaluation },
    }
  }

  async verifyInfoDateExist(employeeEvaluation: EmployeeEvaluation) {
    const existEmployeeEvaluation = await EmployeeEvaluation.query()
      .whereNull('employee_evaluation_deleted_at')
      .where('employee_id', employeeEvaluation.employeeId)
      .where('employee_evaluation_date', employeeEvaluation.employeeEvaluationDate)
      .where('employee_evaluation_type', employeeEvaluation.employeeEvaluationType)
      .first()
    if (existEmployeeEvaluation) {
      return {
        status: 400,
        type: 'warning',
        title: this.t('employee_evaluation_already_exists'),
        message: this.t('employee_evaluation_already_exists_with_entered_date'),
        data: { ...employeeEvaluation },
      }
    }

    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...employeeEvaluation },
    }
  }

  async getByEmployee(employeeId: number) {
    const employeeEvaluations = await EmployeeEvaluation.query()
      .whereNull('employee_evaluation_deleted_at')
      .where('employee_id', employeeId)
      .preload('employeeCompetencyEvaluations', (query) => {
        query.preload('businessUnitCompetencyLevel')
      })
      .orderBy('employee_evaluation_type', 'asc')
      .orderBy('employee_evaluation_date', 'desc')
      .limit(3)
    return employeeEvaluations ? employeeEvaluations : []
  }

  async updatePotential(currentEmployeeEvaluation: EmployeeEvaluation, employeeEvaluation: EmployeeEvaluation) {
    currentEmployeeEvaluation.employeeEvaluationPotential = employeeEvaluation.employeeEvaluationPotential
    await currentEmployeeEvaluation.save()
    return currentEmployeeEvaluation
  }
}
