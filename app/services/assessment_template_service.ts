import AssessmentTemplate from '#models/assessment_template'
import AssessmentTemplateDimension from '#models/assessment_template_dimension'
import { AssessmentTemplateFilterSearchInterface } from '../interfaces/assessment_template_filter_search_interface.js'

export default class AssessmentTemplateService {
  async index(filters: AssessmentTemplateFilterSearchInterface) {
    const selectedColumns = [
      'assessment_template_id',
      'assessment_template_name',
      'assessment_template_description',
      'assessment_template_created_at',
    ]
    const items = await AssessmentTemplate.query()
      .whereNull('assessment_template_deleted_at')
      .if(filters.search, (query) => {
        query.whereRaw('UPPER(assessment_template_name) LIKE ?', [
          `%${filters.search!.toUpperCase()}%`,
        ])
      })
      .preload('dimensions', (dimQuery) => {
        dimQuery.whereNull('assessment_template_dimension_deleted_at')
      })
      .select(selectedColumns)
      .orderBy('assessment_template_created_at', 'desc')
      .paginate(filters.page, filters.limit)

    return items
  }

  async create(
    data: { assessmentTemplateName: string; assessmentTemplateDescription?: string | null },
    dimensions?: {
      assessmentTemplateDimensionName: string
      assessmentTemplateDimensionAcronym: string
    }[]
  ) {
    const newTemplate = new AssessmentTemplate()
    newTemplate.assessmentTemplateName = data.assessmentTemplateName
    newTemplate.assessmentTemplateDescription = data.assessmentTemplateDescription ?? null
    await newTemplate.save()

    if (dimensions && dimensions.length > 0) {
      for (const dim of dimensions) {
        const newDim = new AssessmentTemplateDimension()
        newDim.assessmentTemplateId = newTemplate.assessmentTemplateId
        newDim.assessmentTemplateDimensionName = dim.assessmentTemplateDimensionName
        newDim.assessmentTemplateDimensionAcronym = dim.assessmentTemplateDimensionAcronym
        await newDim.save()
      }
    }

    await newTemplate.load('dimensions', (dimQuery) => {
      dimQuery.whereNull('assessment_template_dimension_deleted_at')
    })

    return newTemplate
  }

  async update(
    currentTemplate: AssessmentTemplate,
    data: { assessmentTemplateName: string; assessmentTemplateDescription?: string | null },
    dimensions?: {
      assessmentTemplateDimensionId?: number
      assessmentTemplateDimensionName: string
      assessmentTemplateDimensionAcronym: string
    }[]
  ) {
    currentTemplate.assessmentTemplateName = data.assessmentTemplateName
    currentTemplate.assessmentTemplateDescription = data.assessmentTemplateDescription ?? null
    await currentTemplate.save()

    if (dimensions) {
      await this.syncDimensions(currentTemplate.assessmentTemplateId, dimensions)
    }

    await currentTemplate.load('dimensions', (dimQuery) => {
      dimQuery.whereNull('assessment_template_dimension_deleted_at')
    })

    return currentTemplate
  }

  /**
   * Sincroniza las dimensiones de una plantilla: crea nuevas, actualiza existentes y elimina las ausentes.
   */
  private async syncDimensions(
    assessmentTemplateId: number,
    dimensions: {
      assessmentTemplateDimensionId?: number
      assessmentTemplateDimensionName: string
      assessmentTemplateDimensionAcronym: string
    }[]
  ) {
    const existingDimensions = await AssessmentTemplateDimension.query()
      .where('assessment_template_id', assessmentTemplateId)
      .whereNull('assessment_template_dimension_deleted_at')

    const incomingIds = dimensions
      .filter((d) => d.assessmentTemplateDimensionId)
      .map((d) => d.assessmentTemplateDimensionId!)

    // Soft-delete de las dimensiones que ya no están en el array
    for (const existing of existingDimensions) {
      if (!incomingIds.includes(existing.assessmentTemplateDimensionId)) {
        await existing.delete()
      }
    }

    for (const dim of dimensions) {
      if (dim.assessmentTemplateDimensionId) {
        // Actualizar existente
        const existing = existingDimensions.find(
          (e) => e.assessmentTemplateDimensionId === dim.assessmentTemplateDimensionId
        )
        if (existing) {
          existing.assessmentTemplateDimensionName = dim.assessmentTemplateDimensionName
          existing.assessmentTemplateDimensionAcronym = dim.assessmentTemplateDimensionAcronym
          await existing.save()
        }
      } else {
        // Crear nueva
        const newDim = new AssessmentTemplateDimension()
        newDim.assessmentTemplateId = assessmentTemplateId
        newDim.assessmentTemplateDimensionName = dim.assessmentTemplateDimensionName
        newDim.assessmentTemplateDimensionAcronym = dim.assessmentTemplateDimensionAcronym
        await newDim.save()
      }
    }
  }

  async delete(currentTemplate: AssessmentTemplate) {
    const dimensions = await AssessmentTemplateDimension.query()
      .where('assessment_template_id', currentTemplate.assessmentTemplateId)
      .whereNull('assessment_template_dimension_deleted_at')

    for (const dim of dimensions) {
      await dim.delete()
    }

    await currentTemplate.delete()
    return currentTemplate
  }

  async show(assessmentTemplateId: number) {
    const template = await AssessmentTemplate.query()
      .whereNull('assessment_template_deleted_at')
      .where('assessment_template_id', assessmentTemplateId)
      .preload('dimensions', (dimQuery) => {
        dimQuery.whereNull('assessment_template_dimension_deleted_at')
      })
      .first()
    return template ?? null
  }
}
