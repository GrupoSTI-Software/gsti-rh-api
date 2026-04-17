import Employee from '#models/employee'
import EmployeeKpiEvaluation from '#models/employee_kpi_evaluation'
import PositionKpi from '#models/position_kpi'
import { I18n } from '@adonisjs/i18n'

export default class EmployeeKpiEvaluationService {
  private t: (key: string,params?: { [key: string]: string | number }) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
  }
  async create(employeeKpiEvaluation: EmployeeKpiEvaluation) {
    const newEmployeeKpiEvaluation = new EmployeeKpiEvaluation()
    newEmployeeKpiEvaluation.employeeEvaluationId = employeeKpiEvaluation.employeeEvaluationId
    newEmployeeKpiEvaluation.positionKpiId = employeeKpiEvaluation.positionKpiId
    newEmployeeKpiEvaluation.employeeKpiEvaluationScore = employeeKpiEvaluation.employeeKpiEvaluationScore
    await newEmployeeKpiEvaluation.save()
    return newEmployeeKpiEvaluation
  }

  async update(currentEmployeeKpiEvaluation: EmployeeKpiEvaluation, employeeKpiEvaluation: EmployeeKpiEvaluation) {
    currentEmployeeKpiEvaluation.employeeKpiEvaluationScore = employeeKpiEvaluation.employeeKpiEvaluationScore
    await currentEmployeeKpiEvaluation.save()
    return currentEmployeeKpiEvaluation
  }

  async delete(currentEmployeeKpiEvaluation: EmployeeKpiEvaluation) {
    await currentEmployeeKpiEvaluation.delete()
    return currentEmployeeKpiEvaluation
  }

  async show(employeeKpiEvaluationId: number) {
    const employeeKpiEvaluation = await EmployeeKpiEvaluation.query()
      .whereNull('employee_kpi_evaluation_deleted_at')
      .where('employee_kpi_evaluation_id', employeeKpiEvaluationId)
      .first()
    return employeeKpiEvaluation ? employeeKpiEvaluation : null
  }

  async verifyInfoExist(employeeKpiEvaluation: EmployeeKpiEvaluation) {
    const existEmployee = await Employee.query()
      .whereNull('employee_deleted_at')
      .where('employee_id', employeeKpiEvaluation.employeeEvaluationId)
      .first()

    if (!existEmployee && employeeKpiEvaluation.employeeEvaluationId) {
      const entity = this.t('employee')
      return {
        status: 400,
        type: 'warning',
        title: this.t('entity_was_not_found', { entity }),
        message: this.t('entity_was_not_found_with_entered_id', { entity }),
        data: { ...employeeKpiEvaluation },
      }
    }

    const existPositionKpi = await PositionKpi.query()
      .whereNull('position_kpi_deleted_at')
      .where('position_kpi_id', employeeKpiEvaluation.positionKpiId)
      .first()

    if (!existPositionKpi && employeeKpiEvaluation.positionKpiId) {
      const entity = this.t('position_kpi')
      return {
        status: 400,
        type: 'warning',
        title: this.t('entity_was_not_found', { entity }),
        message: this.t('entity_was_not_found_with_entered_id', { entity }),
        data: { ...employeeKpiEvaluation },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...employeeKpiEvaluation },
    }
  }
}
