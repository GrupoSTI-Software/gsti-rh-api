import PositionWorkTool from '#models/position_work_tool'

export default class PositionWorkToolService {
  async create(positionWorkTool: PositionWorkTool) {
    const newPositionWorkTool = new PositionWorkTool()
    newPositionWorkTool.positionId = positionWorkTool.positionId
    newPositionWorkTool.positionWorkToolName = positionWorkTool.positionWorkToolName
    await newPositionWorkTool.save()
    return newPositionWorkTool
  }

  async update(
    currentPositionWorkTool: PositionWorkTool,
    positionWorkTool: PositionWorkTool
  ) {
    currentPositionWorkTool.positionWorkToolName = positionWorkTool.positionWorkToolName
    await currentPositionWorkTool.save()
    return currentPositionWorkTool
  }

  async delete(currentPositionWorkTool: PositionWorkTool) {
    await currentPositionWorkTool.delete()
    return currentPositionWorkTool
  }

  async getDistinctNames() {
    const positionWorkToolNames = await PositionWorkTool.query()
      .whereNull('position_work_tool_deleted_at')
      .select('position_work_tool_name')
      .distinct('position_work_tool_name')
      .orderBy('position_work_tool_name')
    return positionWorkToolNames
  }

  async getByPosition(positionId: number) {
    const positionWorkTools = await PositionWorkTool.query()
      .whereNull('position_work_tool_deleted_at')
      .where('position_id', positionId)
      .orderBy('position_work_tool_name')
    return positionWorkTools
  }
}
