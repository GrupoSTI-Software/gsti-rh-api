import PsychometricTestDimension from '#models/psychometric_test_dimension'
import { PsychometricTestDimensionFilterSearchInterface } from '../interfaces/psychometric_test_dimension_filter_search_interface.js'

export default class PsychometricTestDimensionService {
  async index(filters: PsychometricTestDimensionFilterSearchInterface) {
    const selectedColumns = [
      'psychometric_test_dimension_id',
      'psychometric_test_id',
      'psychometric_test_dimension_name',
      'psychometric_test_dimension_acronym',
      'psychometric_test_dimension_created_at',
    ]
    const items = await PsychometricTestDimension.query()
      .whereNull('psychometric_test_dimension_deleted_at')
      .where('psychometric_test_id', filters.psychometricTestId)
      .if(filters.search, (query) => {
        query.whereRaw('UPPER(psychometric_test_dimension_name) LIKE ?', [
          `%${filters.search!.toUpperCase()}%`,
        ])
      })
      .select(selectedColumns)
      .orderBy('psychometric_test_dimension_created_at', 'asc')
      .paginate(filters.page, filters.limit)

    return items
  }

  async create(dimension: PsychometricTestDimension) {
    const newDimension = new PsychometricTestDimension()
    newDimension.psychometricTestId = dimension.psychometricTestId
    newDimension.psychometricTestDimensionName = dimension.psychometricTestDimensionName
    newDimension.psychometricTestDimensionAcronym = dimension.psychometricTestDimensionAcronym
    await newDimension.save()
    return newDimension
  }

  async update(
    currentDimension: PsychometricTestDimension,
    dimension: PsychometricTestDimension
  ) {
    currentDimension.psychometricTestDimensionName = dimension.psychometricTestDimensionName
    currentDimension.psychometricTestDimensionAcronym = dimension.psychometricTestDimensionAcronym
    await currentDimension.save()
    return currentDimension
  }

  async delete(currentDimension: PsychometricTestDimension) {
    await currentDimension.delete()
    return currentDimension
  }

  async show(psychometricTestDimensionId: number) {
    const dimension = await PsychometricTestDimension.query()
      .whereNull('psychometric_test_dimension_deleted_at')
      .where('psychometric_test_dimension_id', psychometricTestDimensionId)
      .first()
    return dimension ?? null
  }

  async getByTestId(psychometricTestId: number) {
    return await PsychometricTestDimension.query()
      .whereNull('psychometric_test_dimension_deleted_at')
      .where('psychometric_test_id', psychometricTestId)
      .orderBy('psychometric_test_dimension_created_at', 'asc')
  }
}
