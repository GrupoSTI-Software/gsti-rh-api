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
      .orderBy('competency_name', 'asc')
      .paginate(filters.page, filters.limit)

    return items
  }

  async create(data: { competencyName: string; competencyType: 'technical' | 'transversal' }) {
    const newCompetency = new Competency()
    newCompetency.competencyName = data.competencyName
    newCompetency.competencyType = data.competencyType
    await newCompetency.save()
    return newCompetency
  }

  async update(
    current: Competency,
    data: { competencyName: string; competencyType: 'technical' | 'transversal' }
  ) {
    current.competencyName = data.competencyName
    current.competencyType = data.competencyType
    await current.save()
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
      .first()
    return competency ?? null
  }
}
