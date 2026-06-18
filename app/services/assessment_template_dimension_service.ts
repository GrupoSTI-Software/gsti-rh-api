import AssessmentTemplateDimension from '#models/assessment_template_dimension'
import { AssessmentTemplateDimensionFilterSearchInterface } from '../interfaces/assessment_template_dimension_filter_search_interface.js'

export default class AssessmentTemplateDimensionService {
  async index(filters: AssessmentTemplateDimensionFilterSearchInterface) {
    const selectedColumns = [
      'assessment_template_dimension_id',
      'assessment_template_id',
      'assessment_template_dimension_name',
      'assessment_template_dimension_acronym',
      'assessment_template_dimension_data_type',
      'assessment_template_dimension_created_at',
    ]
    const items = await AssessmentTemplateDimension.query()
      .whereNull('assessment_template_dimension_deleted_at')
      .where('assessment_template_id', filters.assessmentTemplateId)
      .if(filters.search, (query) => {
        query.whereRaw('UPPER(assessment_template_dimension_name) LIKE ?', [
          `%${filters.search!.toUpperCase()}%`,
        ])
      })
      .select(selectedColumns)
      .orderBy('assessment_template_dimension_created_at', 'asc')
      .paginate(filters.page, filters.limit)

    return items
  }

  async create(dimension: AssessmentTemplateDimension) {
    const newDimension = new AssessmentTemplateDimension()
    newDimension.assessmentTemplateId = dimension.assessmentTemplateId
    newDimension.assessmentTemplateDimensionName = dimension.assessmentTemplateDimensionName
    newDimension.assessmentTemplateDimensionAcronym = dimension.assessmentTemplateDimensionAcronym
    if (dimension.assessmentTemplateDimensionDataType) {
      newDimension.assessmentTemplateDimensionDataType =
        dimension.assessmentTemplateDimensionDataType
    }
    await newDimension.save()
    return newDimension
  }

  async update(
    currentDimension: AssessmentTemplateDimension,
    dimension: AssessmentTemplateDimension
  ) {
    currentDimension.assessmentTemplateDimensionName = dimension.assessmentTemplateDimensionName
    currentDimension.assessmentTemplateDimensionAcronym =
      dimension.assessmentTemplateDimensionAcronym
    if (dimension.assessmentTemplateDimensionDataType) {
      currentDimension.assessmentTemplateDimensionDataType =
        dimension.assessmentTemplateDimensionDataType
    }
    await currentDimension.save()
    return currentDimension
  }

  async delete(currentDimension: AssessmentTemplateDimension) {
    await currentDimension.delete()
    return currentDimension
  }

  async show(assessmentTemplateDimensionId: number) {
    const dimension = await AssessmentTemplateDimension.query()
      .whereNull('assessment_template_dimension_deleted_at')
      .where('assessment_template_dimension_id', assessmentTemplateDimensionId)
      .first()
    return dimension ?? null
  }

  async getByTemplateId(assessmentTemplateId: number) {
    return await AssessmentTemplateDimension.query()
      .whereNull('assessment_template_dimension_deleted_at')
      .where('assessment_template_id', assessmentTemplateId)
      .orderBy('assessment_template_dimension_created_at', 'asc')
  }
}
