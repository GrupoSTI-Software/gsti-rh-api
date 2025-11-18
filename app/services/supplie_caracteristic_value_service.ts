import SupplieCaracteristicValue from '#models/supplie_caracteristic_value'
import { SupplieCaracteristicValueFilterSearchInterface } from '../interfaces/supplie_caracteristic_value_filter_search_interface.js'

export default class SupplieCaracteristicValueService {
  /**
   * Get all supply characteristic values with pagination and filters
   */
  static async getAll(filters: SupplieCaracteristicValueFilterSearchInterface) {
    const page = filters.page || 1
    const limit = filters.limit || 10

    const query = SupplieCaracteristicValue.query()

    if (filters.search) {
      query.where((builder) => {
        builder
          .whereILike('supplieCaracteristicValueValue', `%${filters.search}%`)
      })
    }

    if (filters.supplieCaracteristicId) {
      query.where('supplieCaracteristicId', filters.supplieCaracteristicId)
    }

    if (filters.supplieId) {
      query.where('supplieId', filters.supplieId)
    }

    if (filters.supplieCaracteristicValueValue) {
      query.whereILike('supplieCaracteristicValueValue', `%${filters.supplieCaracteristicValueValue}%`)
    }

    return await query.paginate(page, limit)
  }

  /**
   * Get supply characteristic value by ID
   */
  static async getById(id: number) {
    return await SupplieCaracteristicValue.findOrFail(id)
  }

  /**
   * Create new supply characteristic value
   */
  static async create(data: {
    supplieCaracteristicId: number
    supplieId: number
    supplieCaracteristicValueValue: string | number | boolean | null
  }) {
    return await SupplieCaracteristicValue.create(data)
  }

  /**
   * Update supply characteristic value
   */
  static async update(id: number, data: {
    supplieCaracteristicId?: number
    supplieId?: number
    supplieCaracteristicValueValue?: string | number | boolean | null
  }) {
    const supplieCaracteristicValue = await SupplieCaracteristicValue.findOrFail(id)
    supplieCaracteristicValue.merge(data)
    await supplieCaracteristicValue.save()
    return supplieCaracteristicValue
  }

  /**
   * Delete supply characteristic value (soft delete)
   */
  static async delete(id: number) {
    const supplieCaracteristicValue = await SupplieCaracteristicValue.findOrFail(id)
    await supplieCaracteristicValue.delete()
    return supplieCaracteristicValue
  }

  /**
   * Get supply characteristic value with its characteristic
   */
  static async getWithCharacteristic(id: number) {
    return await SupplieCaracteristicValue.query()
      .where('supplieCaracteristicValueId', id)
      .preload('supplieCaracteristic')
      .firstOrFail()
  }

  /**
   * Get values by characteristic
   */
  static async getByCharacteristic(supplieCaracteristicId: number) {
    return await SupplieCaracteristicValue.query()
      .where('supplieCaracteristicId', supplieCaracteristicId)
  }

  /**
   * Get values by supply
   */
  static async getBySupply(supplieId: number) {
    return await SupplieCaracteristicValue.query()
      .where('supplieId', supplieId)
      .preload('supplieCaracteristic')
  }
}
