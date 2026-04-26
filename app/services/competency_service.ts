import Competency from '#models/competency'
import CompetencyLevelDescription from '#models/competency_level_description'
import { CompetencyFilterSearchInterface } from '../interfaces/competency_filter_search_interface.js'

interface CompetencyLevelDescriptionPayload {
  competencyLevelId: number
  competencyLevelDescription: string
}

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
      .preload('levelDescriptions', (descriptionQuery) => {
        descriptionQuery
          .whereNull('competency_level_description_deleted_at')
          .preload('competencyLevel', (levelQuery) => {
            levelQuery.whereNull('competency_level_deleted_at')
          })
      })
      .orderBy('competency_name', 'asc')
      .paginate(filters.page, filters.limit)

    return items
  }

  async create(data: {
    competencyName: string
    competencyType: 'technical' | 'transversal'
    levelDescriptions?: CompetencyLevelDescriptionPayload[]
  }) {
    const newCompetency = new Competency()
    newCompetency.competencyName = data.competencyName
    newCompetency.competencyType = data.competencyType
    await newCompetency.save()

    if (data.levelDescriptions && data.levelDescriptions.length > 0) {
      await this.upsertLevelDescriptions(newCompetency.competencyId, data.levelDescriptions)
    }

    await newCompetency.load('levelDescriptions', (descriptionQuery) => {
      descriptionQuery
        .whereNull('competency_level_description_deleted_at')
        .preload('competencyLevel')
    })

    return newCompetency
  }

  async update(
    current: Competency,
    data: {
      competencyName: string
      competencyType: 'technical' | 'transversal'
      levelDescriptions?: CompetencyLevelDescriptionPayload[]
    }
  ) {
    current.competencyName = data.competencyName
    current.competencyType = data.competencyType
    await current.save()

    if (data.levelDescriptions && data.levelDescriptions.length > 0) {
      await this.upsertLevelDescriptions(current.competencyId, data.levelDescriptions)
    }

    await current.load('levelDescriptions', (descriptionQuery) => {
      descriptionQuery
        .whereNull('competency_level_description_deleted_at')
        .preload('competencyLevel')
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
      .preload('levelDescriptions', (descriptionQuery) => {
        descriptionQuery
          .whereNull('competency_level_description_deleted_at')
          .preload('competencyLevel', (levelQuery) => {
            levelQuery.whereNull('competency_level_deleted_at')
          })
      })
      .first()
    return competency ?? null
  }

  private async upsertLevelDescriptions(
    competencyId: number,
    levelDescriptions: CompetencyLevelDescriptionPayload[]
  ) {
    for (const item of levelDescriptions) {
      const existing = await CompetencyLevelDescription.query()
        .whereNull('competency_level_description_deleted_at')
        .where('competency_id', competencyId)
        .where('competency_level_id', item.competencyLevelId)
        .first()

      if (existing) {
        existing.competencyLevelDescription = item.competencyLevelDescription
        await existing.save()
      } else {
        const description = new CompetencyLevelDescription()
        description.competencyId = competencyId
        description.competencyLevelId = item.competencyLevelId
        description.competencyLevelDescription = item.competencyLevelDescription
        await description.save()
      }
    }
  }
}
