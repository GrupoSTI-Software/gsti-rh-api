import PositionApprovalHistory from '#models/position_approval_history'
import Position from '#models/position'
import { PositionApprovalHistoryError } from '#exceptions/position_approval_history_error'

export default class PositionApprovalHistoryService {
  /**
   * Valida que el puesto exista y esté en el scope activo antes de leer o
   * escribir su historial de aprobaciones (USRH1784259058555). Como
   * `Position` ya compone `withBusinessUnitScope()`, un puesto ajeno con
   * contexto de tenant activo resuelve `null` aquí — nunca "prohibido".
   */
  private async ensurePositionExists(positionId: number): Promise<Position> {
    const position = await Position.query()
      .whereNull('position_deleted_at')
      .where('positionId', positionId)
      .first()

    if (!position) {
      throw new PositionApprovalHistoryError('El puesto no existe o no está disponible.', 404)
    }

    return position
  }

  async create(positionApprovalHistory: PositionApprovalHistory) {
    await this.ensurePositionExists(positionApprovalHistory.positionId)

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
    await this.ensurePositionExists(positionId)

    const positionApprovalHistory = await PositionApprovalHistory.query()
      .whereNull('position_approval_history_deleted_at')
      .where('position_id', positionId)
      .orderBy('position_approval_history_date', 'desc')
      .first()
    return positionApprovalHistory ? positionApprovalHistory : null
  }
}
