import PositionCompetency from '#models/position_competency'

export default class PositionCompetencyService {
  async create(positionCompetency: PositionCompetency) {
    const newPositionCompetency = new PositionCompetency()
    newPositionCompetency.positionId = positionCompetency.positionId
    newPositionCompetency.weightId = positionCompetency.weightId
    newPositionCompetency.competencyId = positionCompetency.competencyId
    newPositionCompetency.positionCompetencyName = positionCompetency.positionCompetencyName
    newPositionCompetency.positionCompetencyType = positionCompetency.positionCompetencyType
    await newPositionCompetency.save()
    return newPositionCompetency
  }

  async update(currentPositionCompetency: PositionCompetency, positionCompetency: PositionCompetency) {
    currentPositionCompetency.weightId = positionCompetency.weightId
    currentPositionCompetency.competencyId = positionCompetency.competencyId
    currentPositionCompetency.positionCompetencyName = positionCompetency.positionCompetencyName
    currentPositionCompetency.positionCompetencyType = positionCompetency.positionCompetencyType
    await currentPositionCompetency.save()
    return currentPositionCompetency
  }

  async delete(currentPositionCompetency: PositionCompetency) {
    await currentPositionCompetency.delete()
    return currentPositionCompetency
  }

  async getDistinctNames() {
    const positionCompetencyNames = await PositionCompetency.query()
      .whereNull('position_competency_deleted_at')
      .select('position_competency_name')
      .distinct('position_competency_name')
      .orderBy('position_competency_name')
    return positionCompetencyNames
  }

  async getByPosition(positionId: number, type: string) {
    const positionCompetencies = await PositionCompetency.query()
      .whereNull('position_competency_deleted_at')
      .where('position_id', positionId)
      .where('position_competency_type', type)
      .preload('weight')
      .orderBy('position_competency_name')
    return positionCompetencies
  }

}
