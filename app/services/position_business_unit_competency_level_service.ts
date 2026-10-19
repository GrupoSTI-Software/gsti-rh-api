import PositionBusinessUnitCompetencyLevel from '#models/position_business_unit_competency_level'
import Position from '#models/position'
import Competency from '#models/competency'
import BusinessUnitCompetencyLevel from '#models/business_unit_competency_level'
import { COMPETENCY_ERROR_CODES, type CompetencyErrorCode } from '#constants/competency_error_codes'

export default class PositionBusinessUnitCompetencyLevelService {
  /**
   * VLRH-H1792032453526 (reglas 1 y 3 propias, VLRH-C0192 R4): el puesto, la
   * competencia y el nivel deben ser de la empresa en contexto. La pertenencia
   * sale de la consulta escopeada (withBusinessUnitScope, VLRH-H1792026427127):
   * sin fila es ajeno, plantilla o inexistente, sin distinguir.
   *
   * Solo valida los ids presentes. Orden: positionId → competencyId →
   * businessUnitCompetencyLevelId (coincide con el orden de uso en store/update).
   */
  async findOutOfScopeReference(data: {
    positionId?: number
    competencyId?: number
    businessUnitCompetencyLevelId?: number
  }): Promise<CompetencyErrorCode | null> {
    if (data.positionId) {
      const position = await Position.query()
        .whereNull('position_deleted_at')
        .where('positionId', data.positionId)
        .first()
      if (!position) return COMPETENCY_ERROR_CODES.POSITION_NOT_FOUND
    }

    if (data.competencyId) {
      const competency = await Competency.query()
        .whereNull('competency_deleted_at')
        .where('competencyId', data.competencyId)
        .first()
      if (!competency) return COMPETENCY_ERROR_CODES.COMPETENCY_NOT_FOUND
    }

    if (data.businessUnitCompetencyLevelId) {
      const level = await BusinessUnitCompetencyLevel.query()
        .whereNull('business_unit_competency_level_deleted_at')
        .where('businessUnitCompetencyLevelId', data.businessUnitCompetencyLevelId)
        .first()
      if (!level) return COMPETENCY_ERROR_CODES.BUSINESS_UNIT_LEVEL_NOT_FOUND
    }

    return null
  }

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
        competencyQuery.preload('competencyDescriptors')
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
