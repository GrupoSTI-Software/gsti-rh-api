import PositionKpi from '#models/position_kpi'

export default class PositionKpiService {
  async create(positionKpi: PositionKpi) {
    const newPositionKpi = new PositionKpi()
    newPositionKpi.positionId = positionKpi.positionId
    newPositionKpi.positionKpiName = positionKpi.positionKpiName
    newPositionKpi.positionKpiMin = positionKpi.positionKpiMin
    newPositionKpi.positionKpiMax = positionKpi.positionKpiMax
    newPositionKpi.positionKpiIdeal = positionKpi.positionKpiIdeal
    newPositionKpi.positionKpiScale = positionKpi.positionKpiScale
    newPositionKpi.positionKpiType = positionKpi.positionKpiType
    newPositionKpi.positionKpiFrequency = positionKpi.positionKpiFrequency
    await newPositionKpi.save()
    return newPositionKpi
  }

  async update(currentPositionKpi: PositionKpi, positionKpi: PositionKpi) {
    currentPositionKpi.positionKpiName = positionKpi.positionKpiName
    currentPositionKpi.positionKpiMin = positionKpi.positionKpiMin
    currentPositionKpi.positionKpiMax = positionKpi.positionKpiMax
    currentPositionKpi.positionKpiIdeal = positionKpi.positionKpiIdeal
    currentPositionKpi.positionKpiScale = positionKpi.positionKpiScale
    currentPositionKpi.positionKpiType = positionKpi.positionKpiType
    currentPositionKpi.positionKpiFrequency = positionKpi.positionKpiFrequency
    await currentPositionKpi.save()
    return currentPositionKpi
  }

  async delete(currentPositionKpi: PositionKpi) {
    await currentPositionKpi.delete()
    return currentPositionKpi
  }

  async getDistinctNames() {
    const positionKpiNames = await PositionKpi.query()
      .whereNull('position_kpi_deleted_at')
      .select('position_kpi_name')
      .distinct('position_kpi_name')
      .orderBy('position_kpi_name')
    return positionKpiNames
  }

  async getByPosition(positionId: number) {
    const positionKpis = await PositionKpi.query()
      .whereNull('position_kpi_deleted_at')
      .where('position_id', positionId)
      .orderBy('position_kpi_name')
    return positionKpis
  }

}
