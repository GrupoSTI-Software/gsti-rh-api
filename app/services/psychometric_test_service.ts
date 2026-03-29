import PsychometricTest from '#models/psychometric_test'
import PsychometricTestDimension from '#models/psychometric_test_dimension'
import { PsychometricTestFilterSearchInterface } from '../interfaces/psychometric_test_filter_search_interface.js'

export default class PsychometricTestService {
  async index(filters: PsychometricTestFilterSearchInterface) {
    const selectedColumns = [
      'psychometric_test_id',
      'psychometric_test_name',
      'psychometric_test_description',
      'psychometric_test_created_at',
    ]
    const items = await PsychometricTest.query()
      .whereNull('psychometric_test_deleted_at')
      .if(filters.search, (query) => {
        query.whereRaw('UPPER(psychometric_test_name) LIKE ?', [
          `%${filters.search!.toUpperCase()}%`,
        ])
      })
      .preload('dimensions', (dimQuery) => {
        dimQuery.whereNull('psychometric_test_dimension_deleted_at')
      })
      .select(selectedColumns)
      .orderBy('psychometric_test_created_at', 'desc')
      .paginate(filters.page, filters.limit)

    return items
  }

  async create(
    data: { psychometricTestName: string; psychometricTestDescription?: string | null },
    dimensions?: {
      psychometricTestDimensionName: string
      psychometricTestDimensionAcronym: string
    }[]
  ) {
    const newTest = new PsychometricTest()
    newTest.psychometricTestName = data.psychometricTestName
    newTest.psychometricTestDescription = data.psychometricTestDescription ?? null
    await newTest.save()

    if (dimensions && dimensions.length > 0) {
      for (const dim of dimensions) {
        const newDim = new PsychometricTestDimension()
        newDim.psychometricTestId = newTest.psychometricTestId
        newDim.psychometricTestDimensionName = dim.psychometricTestDimensionName
        newDim.psychometricTestDimensionAcronym = dim.psychometricTestDimensionAcronym
        await newDim.save()
      }
    }

    await newTest.load('dimensions', (dimQuery) => {
      dimQuery.whereNull('psychometric_test_dimension_deleted_at')
    })

    return newTest
  }

  async update(
    currentTest: PsychometricTest,
    data: { psychometricTestName: string; psychometricTestDescription?: string | null },
    dimensions?: {
      psychometricTestDimensionId?: number
      psychometricTestDimensionName: string
      psychometricTestDimensionAcronym: string
    }[]
  ) {
    currentTest.psychometricTestName = data.psychometricTestName
    currentTest.psychometricTestDescription = data.psychometricTestDescription ?? null
    await currentTest.save()

    if (dimensions) {
      await this.syncDimensions(currentTest.psychometricTestId, dimensions)
    }

    await currentTest.load('dimensions', (dimQuery) => {
      dimQuery.whereNull('psychometric_test_dimension_deleted_at')
    })

    return currentTest
  }

  /**
   * Sincroniza las dimensiones de una prueba: crea nuevas, actualiza existentes y elimina las ausentes.
   */
  private async syncDimensions(
    psychometricTestId: number,
    dimensions: {
      psychometricTestDimensionId?: number
      psychometricTestDimensionName: string
      psychometricTestDimensionAcronym: string
    }[]
  ) {
    const existingDimensions = await PsychometricTestDimension.query()
      .where('psychometric_test_id', psychometricTestId)
      .whereNull('psychometric_test_dimension_deleted_at')

    const incomingIds = dimensions
      .filter((d) => d.psychometricTestDimensionId)
      .map((d) => d.psychometricTestDimensionId!)

    // Soft-delete de las dimensiones que ya no están en el array
    for (const existing of existingDimensions) {
      if (!incomingIds.includes(existing.psychometricTestDimensionId)) {
        await existing.delete()
      }
    }

    for (const dim of dimensions) {
      if (dim.psychometricTestDimensionId) {
        // Actualizar existente
        const existing = existingDimensions.find(
          (e) => e.psychometricTestDimensionId === dim.psychometricTestDimensionId
        )
        if (existing) {
          existing.psychometricTestDimensionName = dim.psychometricTestDimensionName
          existing.psychometricTestDimensionAcronym = dim.psychometricTestDimensionAcronym
          await existing.save()
        }
      } else {
        // Crear nueva
        const newDim = new PsychometricTestDimension()
        newDim.psychometricTestId = psychometricTestId
        newDim.psychometricTestDimensionName = dim.psychometricTestDimensionName
        newDim.psychometricTestDimensionAcronym = dim.psychometricTestDimensionAcronym
        await newDim.save()
      }
    }
  }

  async delete(currentTest: PsychometricTest) {
    const dimensions = await PsychometricTestDimension.query()
      .where('psychometric_test_id', currentTest.psychometricTestId)
      .whereNull('psychometric_test_dimension_deleted_at')

    for (const dim of dimensions) {
      await dim.delete()
    }

    await currentTest.delete()
    return currentTest
  }

  async show(psychometricTestId: number) {
    const test = await PsychometricTest.query()
      .whereNull('psychometric_test_deleted_at')
      .where('psychometric_test_id', psychometricTestId)
      .preload('dimensions', (dimQuery) => {
        dimQuery.whereNull('psychometric_test_dimension_deleted_at')
      })
      .first()
    return test ?? null
  }
}
