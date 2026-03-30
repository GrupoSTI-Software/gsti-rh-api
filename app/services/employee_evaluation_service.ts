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
}
