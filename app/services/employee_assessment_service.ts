import EmployeeAssessment from '#models/employee_assessment'
import EmployeeAssessmentResult from '#models/employee_assessment_result'
import AssessmentTemplate from '#models/assessment_template'
import PositionAssessmentProfile from '#models/position_assessment_profile'
import { EmployeeAssessmentFilterSearchInterface } from '../interfaces/employee_assessment_filter_search_interface.js'

export default class EmployeeAssessmentService {
  async index(filters: EmployeeAssessmentFilterSearchInterface) {
    const items = await EmployeeAssessment.query()
      .whereNull('employee_assessment_deleted_at')
      .if(filters.employeeId, (query) => {
        query.where('employee_id', filters.employeeId!)
      })
      .if(filters.assessmentTemplateId, (query) => {
        query.where('assessment_template_id', filters.assessmentTemplateId!)
      })
      .if(filters.status, (query) => {
        query.where('employee_assessment_status', filters.status!)
      })
      .preload('assessmentTemplate', (templateQuery) => {
        templateQuery.preload('dimensions', (dimQuery) => {
          dimQuery.whereNull('assessment_template_dimension_deleted_at')
        })
      })
      .preload('results', (resultQuery) => {
        resultQuery
          .whereNull('employee_assessment_result_deleted_at')
          .preload('assessmentTemplateDimension')
      })
      .orderBy('employee_assessment_date', 'desc')
      .paginate(filters.page, filters.limit)

    return items
  }

  async getByEmployee(employeeId: number) {
    const items = await EmployeeAssessment.query()
      .whereNull('employee_assessment_deleted_at')
      .where('employee_id', employeeId)
      .preload('assessmentTemplate', (templateQuery) => {
        templateQuery.preload('dimensions', (dimQuery) => {
          dimQuery.whereNull('assessment_template_dimension_deleted_at')
        })
      })
      .preload('results', (resultQuery) => {
        resultQuery
          .whereNull('employee_assessment_result_deleted_at')
          .preload('assessmentTemplateDimension')
      })
      .orderBy('employee_assessment_date', 'desc')

    return items
  }

  /**
   * Obtiene las plantillas de evaluación distintas asignadas a un puesto a través
   * del JOIN: position_assessment_profiles → assessment_template_dimensions → assessment_templates
   */
  async getTemplatesByPosition(positionId: number) {
    const profiles = await PositionAssessmentProfile.query()
      .whereNull('position_assessment_profile_deleted_at')
      .where('position_id', positionId)
      .preload('assessmentTemplateDimension', (dimQuery) => {
        dimQuery.whereNull('assessment_template_dimension_deleted_at')
      })

    const templateIdSet = new Set<number>()
    for (const profile of profiles) {
      if (profile.assessmentTemplateDimension) {
        templateIdSet.add(profile.assessmentTemplateDimension.assessmentTemplateId)
      }
    }

    if (templateIdSet.size === 0) return []

    const templates = await AssessmentTemplate.query()
      .whereNull('assessment_template_deleted_at')
      .whereIn('assessment_template_id', Array.from(templateIdSet))
      .preload('dimensions', (dimQuery) => {
        dimQuery.whereNull('assessment_template_dimension_deleted_at')
      })
      .orderBy('assessment_template_name', 'asc')

    return templates
  }

  async create(
    data: {
      employeeId: number
      assessmentTemplateId: number
      employeeAssessmentDate: string
    },
    positionId: number,
    results?: {
      assessmentTemplateDimensionId: number
      employeeAssessmentResultValue?: string | null
    }[]
  ) {
    const positionProfiles = await this.getPositionProfiles(positionId, data.assessmentTemplateId)

    const newAssessment = new EmployeeAssessment()
    newAssessment.employeeId = data.employeeId
    newAssessment.assessmentTemplateId = data.assessmentTemplateId
    newAssessment.employeeAssessmentDate =
      data.employeeAssessmentDate as unknown as import('luxon').DateTime
    newAssessment.employeeAssessmentStatus = 'pending'
    await newAssessment.save()

    if (results && results.length > 0) {
      for (const r of results) {
        const resultStatus = this.calculateDimensionStatus(
          r.employeeAssessmentResultValue ?? null,
          positionProfiles,
          r.assessmentTemplateDimensionId
        )
        const newResult = new EmployeeAssessmentResult()
        newResult.employeeAssessmentId = newAssessment.employeeAssessmentId
        newResult.assessmentTemplateDimensionId = r.assessmentTemplateDimensionId
        newResult.employeeAssessmentResultValue = r.employeeAssessmentResultValue ?? null
        newResult.employeeAssessmentResultStatus = resultStatus
        await newResult.save()
      }
    }

    const assessmentStatus = await this.calculateAssessmentStatus(
      newAssessment.employeeAssessmentId,
      data.assessmentTemplateId,
      positionProfiles
    )
    newAssessment.employeeAssessmentStatus = assessmentStatus
    await newAssessment.save()

    return this.show(newAssessment.employeeAssessmentId)
  }

  async update(
    currentAssessment: EmployeeAssessment,
    data: {
      employeeAssessmentDate?: string
    },
    positionId: number,
    results?: {
      assessmentTemplateDimensionId: number
      employeeAssessmentResultValue?: string | null
    }[]
  ) {
    if (data.employeeAssessmentDate) {
      currentAssessment.employeeAssessmentDate =
        data.employeeAssessmentDate as unknown as import('luxon').DateTime
    }
    await currentAssessment.save()

    const positionProfiles = await this.getPositionProfiles(
      positionId,
      currentAssessment.assessmentTemplateId
    )

    if (results && results.length > 0) {
      for (const r of results) {
        const resultStatus = this.calculateDimensionStatus(
          r.employeeAssessmentResultValue ?? null,
          positionProfiles,
          r.assessmentTemplateDimensionId
        )

        const existingResult = await EmployeeAssessmentResult.query()
          .where('employee_assessment_id', currentAssessment.employeeAssessmentId)
          .where('assessment_template_dimension_id', r.assessmentTemplateDimensionId)
          .whereNull('employee_assessment_result_deleted_at')
          .first()

        if (existingResult) {
          existingResult.employeeAssessmentResultValue = r.employeeAssessmentResultValue ?? null
          existingResult.employeeAssessmentResultStatus = resultStatus
          await existingResult.save()
        } else {
          const newResult = new EmployeeAssessmentResult()
          newResult.employeeAssessmentId = currentAssessment.employeeAssessmentId
          newResult.assessmentTemplateDimensionId = r.assessmentTemplateDimensionId
          newResult.employeeAssessmentResultValue = r.employeeAssessmentResultValue ?? null
          newResult.employeeAssessmentResultStatus = resultStatus
          await newResult.save()
        }
      }
    }

    const assessmentStatus = await this.calculateAssessmentStatus(
      currentAssessment.employeeAssessmentId,
      currentAssessment.assessmentTemplateId,
      positionProfiles
    )
    currentAssessment.employeeAssessmentStatus = assessmentStatus
    await currentAssessment.save()

    return this.show(currentAssessment.employeeAssessmentId)
  }

  async delete(currentAssessment: EmployeeAssessment) {
    const results = await EmployeeAssessmentResult.query()
      .where('employee_assessment_id', currentAssessment.employeeAssessmentId)
      .whereNull('employee_assessment_result_deleted_at')

    for (const result of results) {
      await result.delete()
    }

    await currentAssessment.delete()
    return currentAssessment
  }

  async show(assessmentId: number) {
    const assessment = await EmployeeAssessment.query()
      .whereNull('employee_assessment_deleted_at')
      .where('employee_assessment_id', assessmentId)
      .preload('assessmentTemplate', (templateQuery) => {
        templateQuery.preload('dimensions', (dimQuery) => {
          dimQuery.whereNull('assessment_template_dimension_deleted_at')
        })
      })
      .preload('results', (resultQuery) => {
        resultQuery
          .whereNull('employee_assessment_result_deleted_at')
          .preload('assessmentTemplateDimension')
      })
      .preload('employee')
      .first()

    return assessment ?? null
  }

  /**
   * Verifica si ya existe una evaluación con la misma combinación de empleado, plantilla y fecha.
   */
  async existsDuplicate(
    employeeId: number,
    assessmentTemplateId: number,
    assessmentDate: string,
    excludeId?: number
  ) {
    const query = EmployeeAssessment.query()
      .whereNull('employee_assessment_deleted_at')
      .where('employee_id', employeeId)
      .where('assessment_template_id', assessmentTemplateId)
      .where('employee_assessment_date', assessmentDate)

    if (excludeId) {
      query.whereNot('employee_assessment_id', excludeId)
    }

    const existing = await query.first()
    return !!existing
  }

  /**
   * Obtiene los perfiles de evaluación del puesto para una plantilla específica.
   */
  private async getPositionProfiles(positionId: number, assessmentTemplateId: number) {
    const profiles = await PositionAssessmentProfile.query()
      .whereNull('position_assessment_profile_deleted_at')
      .where('position_id', positionId)
      .preload('assessmentTemplateDimension', (dimQuery) => {
        dimQuery
          .whereNull('assessment_template_dimension_deleted_at')
          .where('assessment_template_id', assessmentTemplateId)
      })

    return profiles.filter((p) => p.assessmentTemplateDimension !== null)
  }

  /**
   * Calcula el estado de un resultado individual comparando el valor contra los rangos del perfil.
   */
  private calculateDimensionStatus(
    value: string | null,
    positionProfiles: PositionAssessmentProfile[],
    dimensionId: number
  ): string | null {
    if (!value || value.trim() === '') return null

    const numericValue = Number.parseFloat(value)
    if (Number.isNaN(numericValue)) return null

    const profile = positionProfiles.find(
      (p) => p.assessmentTemplateDimensionId === dimensionId
    )
    if (!profile) return null

    const minVal = Number(profile.positionAssessmentProfileMinimumValue)
    const maxVal = Number(profile.positionAssessmentProfileMaximumValue)

    if (numericValue < minVal) return 'insufficient'
    if (numericValue > maxVal) return 'excellent'
    return 'approved'
  }

  /**
   * Calcula el estado general de la evaluación basado en los resultados de sus dimensiones.
   */
  private async calculateAssessmentStatus(
    assessmentId: number,
    assessmentTemplateId: number,
    positionProfiles: PositionAssessmentProfile[]
  ): Promise<string> {
    const template = await AssessmentTemplate.query()
      .where('assessment_template_id', assessmentTemplateId)
      .preload('dimensions', (dimQuery) => {
        dimQuery.whereNull('assessment_template_dimension_deleted_at')
      })
      .first()

    if (!template) return 'pending'

    const totalDimensions = template.dimensions.length
    if (totalDimensions === 0) return 'approved'

    const results = await EmployeeAssessmentResult.query()
      .where('employee_assessment_id', assessmentId)
      .whereNull('employee_assessment_result_deleted_at')

    const dimensionIdsWithProfile = new Set(
      positionProfiles.map((p) => p.assessmentTemplateDimensionId)
    )

    const resultsWithValue = results.filter(
      (r) =>
        r.employeeAssessmentResultValue && r.employeeAssessmentResultValue.trim() !== ''
    )

    if (resultsWithValue.length < totalDimensions) return 'pending'

    const hasInsufficient = results.some(
      (r) =>
        dimensionIdsWithProfile.has(r.assessmentTemplateDimensionId) &&
        r.employeeAssessmentResultStatus === 'insufficient'
    )

    if (hasInsufficient) return 'failed'

    return 'approved'
  }
}
