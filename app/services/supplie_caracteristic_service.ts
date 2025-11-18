import SupplieCaracteristic from '#models/supplie_caracteristic'
import { SupplieCaracteristicFilterSearchInterface } from '../interfaces/supplie_caracteristic_filter_search_interface.js'

export default class SupplieCaracteristicService {
  /**
   * Get all supply characteristics with pagination and filters
   */
  static async getAll(filters: SupplieCaracteristicFilterSearchInterface) {
    const page = filters.page || 1
    const limit = filters.limit || 10

    const query = SupplieCaracteristic.query()

    if (filters.search) {
      query.where((builder) => {
        builder
          .whereILike('supplieCaracteristicName', `%${filters.search}%`)
      })
    }

    if (filters.supplyTypeId) {
      query.where('supplyTypeId', filters.supplyTypeId)
    }

    if (filters.supplieCaracteristicName) {
      query.whereILike('supplieCaracteristicName', `%${filters.supplieCaracteristicName}%`)
    }

    if (filters.supplieCaracteristicType) {
      query.where('supplieCaracteristicType', filters.supplieCaracteristicType)
    }

    return await query.paginate(page, limit)
  }

  /**
   * Get supply characteristic by ID
   */
  static async getById(id: number) {
    return await SupplieCaracteristic.findOrFail(id)
  }

  /**
   * Create new supply characteristic
   */
  static async create(data: {
    supplyTypeId: number
    supplieCaracteristicName: string
    supplieCaracteristicType: 'text' | 'number' | 'date' | 'boolean' | 'radio' | 'file'
  }) {
    return await SupplieCaracteristic.create(data)
  }

  /**
   * Update supply characteristic
   */
  static async update(id: number, data: {
    supplyTypeId?: number
    supplieCaracteristicName?: string
    supplieCaracteristicType?: 'text' | 'number' | 'date' | 'boolean' | 'radio' | 'file'
  }) {
    const supplieCaracteristic = await SupplieCaracteristic.findOrFail(id)
    supplieCaracteristic.merge(data)
    await supplieCaracteristic.save()
    return supplieCaracteristic
  }

  /**
   * Delete supply characteristic (soft delete)
   */
  static async delete(id: number) {
    const supplieCaracteristic = await SupplieCaracteristic.findOrFail(id)
    await supplieCaracteristic.delete()
    return supplieCaracteristic
  }

  /**
   * Get supply characteristic with its values
   */
  static async getWithValues(id: number) {
    return await SupplieCaracteristic.query()
      .where('supplieCaracteristicId', id)
      .preload('supplieCaracteristicValues')
      .firstOrFail()
  }

  /**
   * Get characteristics by supply type
   */

  static async getBySupplyType(supplyTypeId: number) {
    return await SupplieCaracteristic.query()
      .where('supplyTypeId', supplyTypeId)
      .preload('supplieCaracteristicValues')
  }
}
