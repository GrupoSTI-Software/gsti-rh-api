import SupplyValueHistory from '#models/supply_value_history'
import Supplie from '#models/supplie'

interface SupplyValueHistoryFilterInterface {
  page?: number
  limit?: number
  supplyId?: number
}

interface CreateSupplyValueHistoryData {
  supplyId: number
  supplyValueHistoryCost: number
  supplyValueHistoryCurrentValue: number
  supplyValueHistoryNotes?: string | null
}

interface UpdateSupplyValueHistoryData {
  supplyValueHistoryCost?: number
  supplyValueHistoryCurrentValue?: number
  supplyValueHistoryNotes?: string | null
}

export default class SupplyValueHistoryService {
  /**
   * Obtiene todos los registros del historial de valores con paginación
   */
  static async getAll(filters: SupplyValueHistoryFilterInterface) {
    const page = filters.page || 1
    const limit = filters.limit || 10

    const query = SupplyValueHistory.query()
      .orderBy('supplyValueHistoryCreatedAt', 'desc')

    if (filters.supplyId) {
      query.where('supplyId', filters.supplyId)
    }

    return await query.paginate(page, limit)
  }

  /**
   * Obtiene el historial de valores de un insumo específico ordenado del más nuevo al más antiguo
   */
  static async getBySupplyId(supplyId: number, filters: SupplyValueHistoryFilterInterface = {}) {
    const page = filters.page || 1
    const limit = filters.limit || 10

    await Supplie.findOrFail(supplyId)

    return await SupplyValueHistory.query()
      .where('supplyId', supplyId)
      .orderBy('supplyValueHistoryCreatedAt', 'desc')
      .paginate(page, limit)
  }

  /**
   * Obtiene un registro del historial por su ID
   */
  static async getById(id: number) {
    return await SupplyValueHistory.query()
      .where('supplyValueHistoryId', id)
      .preload('supply')
      .firstOrFail()
  }

  /**
   * Crea un nuevo registro en el historial de valores
   */
  static async create(data: CreateSupplyValueHistoryData) {
    await Supplie.findOrFail(data.supplyId)

    if (data.supplyValueHistoryCost < 0) {
      throw new Error('El costo no puede ser un valor negativo')
    }

    if (data.supplyValueHistoryCurrentValue < 0) {
      throw new Error('El valor actual no puede ser un valor negativo')
    }

    return await SupplyValueHistory.create(data)
  }

  /**
   * Actualiza un registro del historial de valores
   */
  static async update(id: number, data: UpdateSupplyValueHistoryData) {
    const history = await SupplyValueHistory.findOrFail(id)

    if (data.supplyValueHistoryCost !== undefined && data.supplyValueHistoryCost < 0) {
      throw new Error('El costo no puede ser un valor negativo')
    }

    if (data.supplyValueHistoryCurrentValue !== undefined && data.supplyValueHistoryCurrentValue < 0) {
      throw new Error('El valor actual no puede ser un valor negativo')
    }

    history.merge(data)
    await history.save()

    return history
  }

  /**
   * Elimina un registro del historial (soft delete)
   */
  static async delete(id: number) {
    const history = await SupplyValueHistory.findOrFail(id)
    await history.delete()
    return history
  }

  /**
   * Obtiene el valor más reciente de un insumo
   */
  static async getLatestValue(supplyId: number) {
    await Supplie.findOrFail(supplyId)

    return await SupplyValueHistory.query()
      .where('supplyId', supplyId)
      .orderBy('supplyValueHistoryCreatedAt', 'desc')
      .first()
  }
}
