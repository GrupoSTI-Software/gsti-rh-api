import EmployeePsychometricEvaluationResult from '#models/employee_psychometric_evaluation_result'
import { EmployeePsychometricEvaluationResultFilterSearchInterface } from '../interfaces/employee_psychometric_evaluation_result_filter_search_interface.js'

export default class EmployeePsychometricEvaluationResultService {
  async index(filters: EmployeePsychometricEvaluationResultFilterSearchInterface) {
    const items = await EmployeePsychometricEvaluationResult.query()
      .whereNull('employee_psychometric_evaluation_result_deleted_at')
      .if(filters.employeePsychometricEvaluationId, (query) => {
        query.where(
          'employee_psychometric_evaluation_id',
          filters.employeePsychometricEvaluationId!
        )
      })
      .if(filters.psychometricTestDimensionId, (query) => {
        query.where('psychometric_test_dimension_id', filters.psychometricTestDimensionId!)
      })
      .preload('psychometricTestDimension')
      .orderBy('employee_psychometric_evaluation_result_created_at', 'desc')
      .paginate(filters.page, filters.limit)

    return items
  }

  async show(resultId: number) {
    const result = await EmployeePsychometricEvaluationResult.query()
      .whereNull('employee_psychometric_evaluation_result_deleted_at')
      .where('employee_psychometric_evaluation_result_id', resultId)
      .preload('psychometricTestDimension')
      .first()
    return result ?? null
  }

  async delete(currentResult: EmployeePsychometricEvaluationResult) {
    await currentResult.delete()
    return currentResult
  }
}
