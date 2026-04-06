import EmployeePsychometricEvaluation from '#models/employee_psychometric_evaluation'
import EmployeePsychometricEvaluationResult from '#models/employee_psychometric_evaluation_result'
import PsychometricTest from '#models/psychometric_test'
import PositionPsychometricProfile from '#models/position_psychometric_profile'
import { EmployeePsychometricEvaluationFilterSearchInterface } from '../interfaces/employee_psychometric_evaluation_filter_search_interface.js'

export default class EmployeePsychometricEvaluationService {
  async index(filters: EmployeePsychometricEvaluationFilterSearchInterface) {
    const items = await EmployeePsychometricEvaluation.query()
      .whereNull('employee_psychometric_evaluation_deleted_at')
      .if(filters.employeeId, (query) => {
        query.where('employee_id', filters.employeeId!)
      })
      .if(filters.psychometricTestId, (query) => {
        query.where('psychometric_test_id', filters.psychometricTestId!)
      })
      .if(filters.status, (query) => {
        query.where('employee_psychometric_evaluation_status', filters.status!)
      })
      .preload('psychometricTest', (testQuery) => {
        testQuery.preload('dimensions', (dimQuery) => {
          dimQuery.whereNull('psychometric_test_dimension_deleted_at')
        })
      })
      .preload('results', (resultQuery) => {
        resultQuery
          .whereNull('employee_psychometric_evaluation_result_deleted_at')
          .preload('psychometricTestDimension')
      })
      .orderBy('employee_psychometric_evaluation_date', 'desc')
      .paginate(filters.page, filters.limit)

    return items
  }

  async getByEmployee(employeeId: number) {
    const items = await EmployeePsychometricEvaluation.query()
      .whereNull('employee_psychometric_evaluation_deleted_at')
      .where('employee_id', employeeId)
      .preload('psychometricTest', (testQuery) => {
        testQuery.preload('dimensions', (dimQuery) => {
          dimQuery.whereNull('psychometric_test_dimension_deleted_at')
        })
      })
      .preload('results', (resultQuery) => {
        resultQuery
          .whereNull('employee_psychometric_evaluation_result_deleted_at')
          .preload('psychometricTestDimension')
      })
      .orderBy('employee_psychometric_evaluation_date', 'desc')

    return items
  }

  /**
   * Obtiene las pruebas psicométricas distintas asignadas a un puesto a través
   * del JOIN: position_psychometric_profiles → psychometric_test_dimensions → psychometric_tests
   */
  async getTestsByPosition(positionId: number) {
    const profiles = await PositionPsychometricProfile.query()
      .whereNull('position_psychometric_profile_deleted_at')
      .where('position_id', positionId)
      .preload('psychometricTestDimension', (dimQuery) => {
        dimQuery.whereNull('psychometric_test_dimension_deleted_at')
      })

    const testIdSet = new Set<number>()
    for (const profile of profiles) {
      if (profile.psychometricTestDimension) {
        testIdSet.add(profile.psychometricTestDimension.psychometricTestId)
      }
    }

    if (testIdSet.size === 0) return []

    const tests = await PsychometricTest.query()
      .whereNull('psychometric_test_deleted_at')
      .whereIn('psychometric_test_id', Array.from(testIdSet))
      .preload('dimensions', (dimQuery) => {
        dimQuery.whereNull('psychometric_test_dimension_deleted_at')
      })
      .orderBy('psychometric_test_name', 'asc')

    return tests
  }

  async create(
    data: {
      employeeId: number
      psychometricTestId: number
      employeePsychometricEvaluationDate: string
    },
    positionId: number,
    results?: {
      psychometricTestDimensionId: number
      employeePsychometricEvaluationResultValue?: string | null
    }[]
  ) {
    const positionProfiles = await this.getPositionProfiles(positionId, data.psychometricTestId)

    const newEval = new EmployeePsychometricEvaluation()
    newEval.employeeId = data.employeeId
    newEval.psychometricTestId = data.psychometricTestId
    newEval.employeePsychometricEvaluationDate =
      data.employeePsychometricEvaluationDate as unknown as import('luxon').DateTime
    newEval.employeePsychometricEvaluationStatus = 'pending'
    await newEval.save()

    if (results && results.length > 0) {
      for (const r of results) {
        const resultStatus = this.calculateDimensionStatus(
          r.employeePsychometricEvaluationResultValue ?? null,
          positionProfiles,
          r.psychometricTestDimensionId
        )
        const newResult = new EmployeePsychometricEvaluationResult()
        newResult.employeePsychometricEvaluationId = newEval.employeePsychometricEvaluationId
        newResult.psychometricTestDimensionId = r.psychometricTestDimensionId
        newResult.employeePsychometricEvaluationResultValue =
          r.employeePsychometricEvaluationResultValue ?? null
        newResult.employeePsychometricEvaluationResultStatus = resultStatus
        await newResult.save()
      }
    }

    const evaluationStatus = await this.calculateEvaluationStatus(
      newEval.employeePsychometricEvaluationId,
      data.psychometricTestId,
      positionProfiles
    )
    newEval.employeePsychometricEvaluationStatus = evaluationStatus
    await newEval.save()

    return this.show(newEval.employeePsychometricEvaluationId)
  }

  async update(
    currentEval: EmployeePsychometricEvaluation,
    data: {
      employeePsychometricEvaluationDate?: string
    },
    positionId: number,
    results?: {
      psychometricTestDimensionId: number
      employeePsychometricEvaluationResultValue?: string | null
    }[]
  ) {
    if (data.employeePsychometricEvaluationDate) {
      currentEval.employeePsychometricEvaluationDate =
        data.employeePsychometricEvaluationDate as unknown as import('luxon').DateTime
    }
    await currentEval.save()

    const positionProfiles = await this.getPositionProfiles(
      positionId,
      currentEval.psychometricTestId
    )

    if (results && results.length > 0) {
      for (const r of results) {
        const resultStatus = this.calculateDimensionStatus(
          r.employeePsychometricEvaluationResultValue ?? null,
          positionProfiles,
          r.psychometricTestDimensionId
        )

        const existingResult = await EmployeePsychometricEvaluationResult.query()
          .where(
            'employee_psychometric_evaluation_id',
            currentEval.employeePsychometricEvaluationId
          )
          .where('psychometric_test_dimension_id', r.psychometricTestDimensionId)
          .whereNull('employee_psychometric_evaluation_result_deleted_at')
          .first()

        if (existingResult) {
          existingResult.employeePsychometricEvaluationResultValue =
            r.employeePsychometricEvaluationResultValue ?? null
          existingResult.employeePsychometricEvaluationResultStatus = resultStatus
          await existingResult.save()
        } else {
          const newResult = new EmployeePsychometricEvaluationResult()
          newResult.employeePsychometricEvaluationId =
            currentEval.employeePsychometricEvaluationId
          newResult.psychometricTestDimensionId = r.psychometricTestDimensionId
          newResult.employeePsychometricEvaluationResultValue =
            r.employeePsychometricEvaluationResultValue ?? null
          newResult.employeePsychometricEvaluationResultStatus = resultStatus
          await newResult.save()
        }
      }
    }

    const evaluationStatus = await this.calculateEvaluationStatus(
      currentEval.employeePsychometricEvaluationId,
      currentEval.psychometricTestId,
      positionProfiles
    )
    currentEval.employeePsychometricEvaluationStatus = evaluationStatus
    await currentEval.save()

    return this.show(currentEval.employeePsychometricEvaluationId)
  }

  async delete(currentEval: EmployeePsychometricEvaluation) {
    const results = await EmployeePsychometricEvaluationResult.query()
      .where(
        'employee_psychometric_evaluation_id',
        currentEval.employeePsychometricEvaluationId
      )
      .whereNull('employee_psychometric_evaluation_result_deleted_at')

    for (const result of results) {
      await result.delete()
    }

    await currentEval.delete()
    return currentEval
  }

  async show(evaluationId: number) {
    const evaluation = await EmployeePsychometricEvaluation.query()
      .whereNull('employee_psychometric_evaluation_deleted_at')
      .where('employee_psychometric_evaluation_id', evaluationId)
      .preload('psychometricTest', (testQuery) => {
        testQuery.preload('dimensions', (dimQuery) => {
          dimQuery.whereNull('psychometric_test_dimension_deleted_at')
        })
      })
      .preload('results', (resultQuery) => {
        resultQuery
          .whereNull('employee_psychometric_evaluation_result_deleted_at')
          .preload('psychometricTestDimension')
      })
      .preload('employee')
      .first()

    return evaluation ?? null
  }

  /**
   * Verifica si ya existe una evaluación con la misma combinación de empleado, prueba y fecha.
   */
  async existsDuplicate(
    employeeId: number,
    psychometricTestId: number,
    evaluationDate: string,
    excludeId?: number
  ) {
    const query = EmployeePsychometricEvaluation.query()
      .whereNull('employee_psychometric_evaluation_deleted_at')
      .where('employee_id', employeeId)
      .where('psychometric_test_id', psychometricTestId)
      .where('employee_psychometric_evaluation_date', evaluationDate)

    if (excludeId) {
      query.whereNot('employee_psychometric_evaluation_id', excludeId)
    }

    const existing = await query.first()
    return !!existing
  }

  /**
   * Obtiene los perfiles psicométricos del puesto para una prueba específica.
   */
  private async getPositionProfiles(positionId: number, psychometricTestId: number) {
    const profiles = await PositionPsychometricProfile.query()
      .whereNull('position_psychometric_profile_deleted_at')
      .where('position_id', positionId)
      .preload('psychometricTestDimension', (dimQuery) => {
        dimQuery
          .whereNull('psychometric_test_dimension_deleted_at')
          .where('psychometric_test_id', psychometricTestId)
      })

    return profiles.filter((p) => p.psychometricTestDimension !== null)
  }

  /**
   * Calcula el estado de un resultado individual comparando el valor contra los rangos del perfil.
   */
  private calculateDimensionStatus(
    value: string | null,
    positionProfiles: PositionPsychometricProfile[],
    dimensionId: number
  ): string | null {
    if (!value || value.trim() === '') return null

    const numericValue = Number.parseFloat(value)
    if (Number.isNaN(numericValue)) return null

    const profile = positionProfiles.find(
      (p) => p.psychometricTestDimensionId === dimensionId
    )
    if (!profile) return null

    const minVal = Number(profile.positionPsychometricProfileMinimumValue)
    const maxVal = Number(profile.positionPsychometricProfileMaximumValue)

    if (numericValue < minVal) return 'insufficient'
    if (numericValue > maxVal) return 'excellent'
    return 'approved'
  }

  /**
   * Calcula el estado general de la evaluación basado en los resultados de sus dimensiones.
   */
  private async calculateEvaluationStatus(
    evaluationId: number,
    psychometricTestId: number,
    positionProfiles: PositionPsychometricProfile[]
  ): Promise<string> {
    const test = await PsychometricTest.query()
      .where('psychometric_test_id', psychometricTestId)
      .preload('dimensions', (dimQuery) => {
        dimQuery.whereNull('psychometric_test_dimension_deleted_at')
      })
      .first()

    if (!test) return 'pending'

    const totalDimensions = test.dimensions.length
    if (totalDimensions === 0) return 'approved'

    const results = await EmployeePsychometricEvaluationResult.query()
      .where('employee_psychometric_evaluation_id', evaluationId)
      .whereNull('employee_psychometric_evaluation_result_deleted_at')

    const dimensionIdsWithProfile = new Set(
      positionProfiles.map((p) => p.psychometricTestDimensionId)
    )

    const resultsWithValue = results.filter(
      (r) =>
        r.employeePsychometricEvaluationResultValue &&
        r.employeePsychometricEvaluationResultValue.trim() !== ''
    )

    if (resultsWithValue.length < totalDimensions) return 'pending'

    const hasInsufficient = results.some(
      (r) =>
        dimensionIdsWithProfile.has(r.psychometricTestDimensionId) &&
        r.employeePsychometricEvaluationResultStatus === 'insufficient'
    )

    if (hasInsufficient) return 'failed'

    return 'approved'
  }
}
