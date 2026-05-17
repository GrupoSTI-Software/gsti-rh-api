import Competency from '#models/competency'
import { CompetencyFilterSearchInterface } from '../interfaces/competency_filter_search_interface.js'

export default class CompetencyService {
  async index(filters: CompetencyFilterSearchInterface) {
    const selectedColumns = [
      'competency_id',
      'competency_name',
      'competency_type',
      'competency_created_at',
      'competency_updated_at',
    ]

    const items = await Competency.query()
      .whereNull('competency_deleted_at')
      .if(filters.search, (query) => {
        query.whereRaw('UPPER(competency_name) LIKE ?', [
          `%${filters.search!.toUpperCase()}%`,
        ])
      })
      .if(filters.competencyType, (query) => {
        query.where('competency_type', filters.competencyType!)
      })
      .select(selectedColumns)
      .preload('competencyDescriptors', (descriptorQuery) => {
        descriptorQuery
          .whereNull('competency_descriptor_deleted_at')
          .preload('businessUnitCompetencyLevel')
      })
      .orderBy('competency_name', 'asc')
      .paginate(filters.page, filters.limit)

    return items
  }

  async create(data: {
    competencyName: string
    competencyType: 'technical' | 'transversal'
  }) {
    const newCompetency = new Competency()
    newCompetency.competencyName = data.competencyName
    newCompetency.competencyType = data.competencyType
    await newCompetency.save()

    await newCompetency.load('competencyDescriptors', (descriptorQuery) => {
      descriptorQuery
        .whereNull('competency_descriptor_deleted_at')
        .preload('businessUnitCompetencyLevel')
    })

    return newCompetency
  }

  async update(
    current: Competency,
    data: {
      competencyName: string
      competencyType: 'technical' | 'transversal'
    }
  ) {
    current.competencyName = data.competencyName
    current.competencyType = data.competencyType
    await current.save()

    await current.load('competencyDescriptors', (descriptionQuery) => {
      descriptionQuery
        .whereNull('competency_descriptor_deleted_at')
        .preload('businessUnitCompetencyLevel')
    })

    return current
  }

  async delete(current: Competency) {
    await current.delete()
    return current
  }

  async show(competencyId: number) {
    const competency = await Competency.query()
      .whereNull('competency_deleted_at')
      .where('competency_id', competencyId)
      .preload('competencyDescriptors', (descriptorQuery) => {
        descriptorQuery
          .whereNull('competency_descriptor_deleted_at')
          .preload('businessUnitCompetencyLevel')
      })
      .first()
    return competency ?? null
  }
}
