import PositionCompetencyLevel from '#models/position_competency_level'

export default class PositionCompetencyLevelService {
  async create(data: {
    positionId: number
    competencyId: number
    positionCompetencyLevelInDevelopmentDescription?: string | null
    positionCompetencyLevelCapableDescription?: string | null
    positionCompetencyLevelExpertDescription?: string | null
  }) {
    const newLevel = new PositionCompetencyLevel()
    newLevel.positionId = data.positionId
    newLevel.competencyId = data.competencyId
    newLevel.positionCompetencyLevelInDevelopmentDescription =
      data.positionCompetencyLevelInDevelopmentDescription ?? null
    newLevel.positionCompetencyLevelCapableDescription =
      data.positionCompetencyLevelCapableDescription ?? null
    newLevel.positionCompetencyLevelExpertDescription =
      data.positionCompetencyLevelExpertDescription ?? null
    await newLevel.save()
    await newLevel.load('competency')
    return newLevel
  }

  async update(
    current: PositionCompetencyLevel,
    data: {
      positionCompetencyLevelInDevelopmentDescription?: string | null
      positionCompetencyLevelCapableDescription?: string | null
      positionCompetencyLevelExpertDescription?: string | null
    }
  ) {
    current.positionCompetencyLevelInDevelopmentDescription =
      data.positionCompetencyLevelInDevelopmentDescription ?? null
    current.positionCompetencyLevelCapableDescription =
      data.positionCompetencyLevelCapableDescription ?? null
    current.positionCompetencyLevelExpertDescription =
      data.positionCompetencyLevelExpertDescription ?? null
    await current.save()
    await current.load('competency')
    return current
  }

  async delete(current: PositionCompetencyLevel) {
    await current.delete()
    return current
  }

  async show(positionCompetencyLevelId: number) {
    const level = await PositionCompetencyLevel.query()
      .whereNull('position_competency_level_deleted_at')
      .where('position_competency_level_id', positionCompetencyLevelId)
      .preload('competency', (competencyQuery) => {
        competencyQuery.whereNull('competency_deleted_at')
      })
      .first()
    return level ?? null
  }

  async getByPosition(positionId: number) {
    const levels = await PositionCompetencyLevel.query()
      .whereNull('position_competency_level_deleted_at')
      .where('position_id', positionId)
      .preload('competency', (competencyQuery) => {
        competencyQuery.whereNull('competency_deleted_at')
      })
      .orderBy('position_competency_level_created_at', 'desc')
    return levels
  }

  async findByPositionAndCompetency(positionId: number, competencyId: number) {
    const level = await PositionCompetencyLevel.query()
      .whereNull('position_competency_level_deleted_at')
      .where('position_id', positionId)
      .where('competency_id', competencyId)
      .first()
    return level ?? null
  }
}
