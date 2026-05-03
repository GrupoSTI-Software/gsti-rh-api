import CompetencyLevel from '#models/competency_level'

export default class CompetencyLevelService {
  async index() {
    const items = await CompetencyLevel.query()
      .whereNull('competency_level_deleted_at')
      .orderBy('competency_level_order', 'asc')
    return items
  }

  async show(competencyLevelId: number) {
    const level = await CompetencyLevel.query()
      .whereNull('competency_level_deleted_at')
      .where('competency_level_id', competencyLevelId)
      .first()
    return level ?? null
  }
}
