import PositionApprovalHistory from '#models/position_approval_history'

export default class PositionApprovalHistoryService {
  async create(positionApprovalHistory: PositionApprovalHistory) {
    const newPositionApprovalHistory = new PositionApprovalHistory()
    newPositionApprovalHistory.positionId = positionApprovalHistory.positionId
    newPositionApprovalHistory.positionApprovalHistoryDate = positionApprovalHistory.positionApprovalHistoryDate
    await newPositionApprovalHistory.save()
    return newPositionApprovalHistory
  }

  async update(currentPositionApprovalHistory: PositionApprovalHistory, positionApprovalHistory: PositionApprovalHistory) {
    currentPositionApprovalHistory.positionApprovalHistoryDate = positionApprovalHistory.positionApprovalHistoryDate
    await currentPositionApprovalHistory.save()
    return currentPositionApprovalHistory
  }

  async delete(currentPositionApprovalHistory: PositionApprovalHistory) {
    await currentPositionApprovalHistory.delete()
    return currentPositionApprovalHistory
  }

  async getLast(positionId: number) {
    const positionApprovalHistory = await PositionApprovalHistory.query()
      .whereNull('position_approval_history_deleted_at')
      .where('position_id', positionId)
      .orderBy('position_approval_history_date', 'desc')
      .first()
    return positionApprovalHistory ? positionApprovalHistory : null
  }
}
