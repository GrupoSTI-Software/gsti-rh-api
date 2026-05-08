import PositionBusinessUnitCompetencyLevel from '#models/position_business_unit_competency_level'

export default class PositionBusinessUnitCompetencyLevelService {
  async create(data: { positionId: number; competencyId: number; businessUnitCompetencyLevelId: number }) {
    const newLevel = new PositionBusinessUnitCompetencyLevel()
    newLevel.positionId = data.positionId
    newLevel.competencyId = data.competencyId
    newLevel.businessUnitCompetencyLevelId = data.businessUnitCompetencyLevelId
    await newLevel.save()
    await newLevel.load('competency', (competencyQuery) => {
      competencyQuery.whereNull('competency_deleted_at')
    })
    await newLevel.load('businessUnitCompetencyLevel', (levelQuery) => {
      levelQuery.whereNull('business_unit_competency_level_deleted_at')
    })
    return newLevel
  }

  async update(current: PositionBusinessUnitCompetencyLevel, data: { businessUnitCompetencyLevelId: number }) {
    current.businessUnitCompetencyLevelId = data.businessUnitCompetencyLevelId
    await current.save()
    await current.load('competency', (competencyQuery) => {
      competencyQuery.whereNull('competency_deleted_at')
    })
    await current.load('businessUnitCompetencyLevel', (levelQuery) => {
      levelQuery.whereNull('business_unit_competency_level_deleted_at')
    })
    return current
  }

  async delete(current: PositionBusinessUnitCompetencyLevel) {
    await current.delete()
    return current
  }

  async show(positionBusinessUnitCompetencyLevelId: number) {
    const level = await PositionBusinessUnitCompetencyLevel.query()
      .whereNull('position_business_unit_competency_level_deleted_at')
      .where('position_business_unit_competency_level_id', positionBusinessUnitCompetencyLevelId)
      .preload('competency', (competencyQuery) => {
        competencyQuery.whereNull('competency_deleted_at')
      })
      .preload('businessUnitCompetencyLevel', (levelQuery) => {
        levelQuery.whereNull('business_unit_competency_level_deleted_at')
      })
      .first()
    return level ?? null
  }

  async getByPosition(positionId: number) {
    const levels = await PositionBusinessUnitCompetencyLevel.query()
      .whereNull('position_business_unit_competency_level_deleted_at')
      .where('position_id', positionId)
      .preload('competency', (competencyQuery) => {
        competencyQuery.whereNull('competency_deleted_at')
      })
      .preload('businessUnitCompetencyLevel', (levelQuery) => {
        levelQuery.whereNull('business_unit_competency_level_deleted_at')
      })
      .orderBy('position_business_unit_competency_level_created_at', 'desc')
    return levels
  }

  async findByPositionAndCompetency(positionId: number, competencyId: number) {
    const level = await PositionBusinessUnitCompetencyLevel.query()
      .whereNull('position_business_unit_competency_level_deleted_at')
      .where('position_id', positionId)
      .where('competency_id', competencyId)
      .first()
    return level ?? null
  }
}
