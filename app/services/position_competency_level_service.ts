import PositionCompetencyLevel from '#models/position_competency_level'

export default class PositionCompetencyLevelService {
  async create(data: { positionId: number; competencyId: number; competencyLevelId: number }) {
    const newLevel = new PositionCompetencyLevel()
    newLevel.positionId = data.positionId
    newLevel.competencyId = data.competencyId
    newLevel.competencyLevelId = data.competencyLevelId
    await newLevel.save()
    await newLevel.load('competency', (competencyQuery) => {
      competencyQuery.whereNull('competency_deleted_at')
    })
    await newLevel.load('competencyLevel', (levelQuery) => {
      levelQuery.whereNull('competency_level_deleted_at')
    })
    return newLevel
  }

  async update(current: PositionCompetencyLevel, data: { competencyLevelId: number }) {
    current.competencyLevelId = data.competencyLevelId
    await current.save()
    await current.load('competency', (competencyQuery) => {
      competencyQuery.whereNull('competency_deleted_at')
    })
    await current.load('competencyLevel', (levelQuery) => {
      levelQuery.whereNull('competency_level_deleted_at')
    })
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
      .preload('competencyLevel', (levelQuery) => {
        levelQuery.whereNull('competency_level_deleted_at')
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
      .preload('competencyLevel', (levelQuery) => {
        levelQuery.whereNull('competency_level_deleted_at')
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
