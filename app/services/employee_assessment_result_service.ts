import EmployeeAssessmentResult from '#models/employee_assessment_result'
import { EmployeeAssessmentResultFilterSearchInterface } from '../interfaces/employee_assessment_result_filter_search_interface.js'

export default class EmployeeAssessmentResultService {
  async index(filters: EmployeeAssessmentResultFilterSearchInterface) {
    const items = await EmployeeAssessmentResult.query()
      .whereNull('employee_assessment_result_deleted_at')
      .if(filters.employeeAssessmentId, (query) => {
        query.where('employee_assessment_id', filters.employeeAssessmentId!)
      })
      .if(filters.assessmentTemplateDimensionId, (query) => {
        query.where('assessment_template_dimension_id', filters.assessmentTemplateDimensionId!)
      })
      .preload('assessmentTemplateDimension')
      .orderBy('employee_assessment_result_created_at', 'desc')
      .paginate(filters.page, filters.limit)

    return items
  }

  async show(resultId: number) {
    const result = await EmployeeAssessmentResult.query()
      .whereNull('employee_assessment_result_deleted_at')
      .where('employee_assessment_result_id', resultId)
      .preload('assessmentTemplateDimension')
      .first()
    return result ?? null
  }

  async delete(currentResult: EmployeeAssessmentResult) {
    await currentResult.delete()
    return currentResult
  }
}
