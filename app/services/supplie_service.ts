import Supplie from '#models/supplie'
import { SupplieFilterSearchInterface } from '../interfaces/supplie_filter_search_interface.js'
import { DateTime } from 'luxon'

export default class SupplieService {
  /**
   * Get all supplies with pagination and filters
   */
  static async getAll(filters: SupplieFilterSearchInterface) {
    const page = filters.page || 1
    const limit = filters.limit || 10

    const query = Supplie.query()

    if (filters.includeDeleted) {
      // incluir eliminados lógicamente
      // @ts-ignore provided by adonis-lucid-soft-deletes
      query.withTrashed()
    }

    if (filters.search) {
      query.where((builder) => {
        builder
          .whereILike('supplyName', `%${filters.search}%`)
          .orWhereILike('supplyDescription', `%${filters.search}%`)
          .orWhere('supplyFileNumber', filters.search as unknown as number)
      })
    }

    if (filters.supplyTypeId) {
      query.where('supplyTypeId', filters.supplyTypeId)
    }

    if (filters.supplyName) {
      query.whereILike('supplyName', `%${filters.supplyName}%`)
    }

    if (filters.supplyStatus) {
      query.where('supplyStatus', filters.supplyStatus)
    }

    if (filters.supplyFileNumber) {
      query.where('supplyFileNumber', filters.supplyFileNumber)
    }

    return await query.paginate(page, limit)
  }

  /**
   * Get supply by ID
   */
  static async getById(id: number) {
    return await Supplie.findOrFail(id)
  }

  /**
   * Create new supply
   */
  static async create(data: {
    supplyFileNumber: number
    supplyName: string
    supplyDescription?: string
    supplyTypeId: number
    supplyStatus?: 'active' | 'inactive' | 'lost' | 'damaged'
  }) {
    // Check if file number already exists
    const existingSupply = await Supplie.query()
      .where('supplyFileNumber', data.supplyFileNumber)
      .first()

    if (existingSupply) {
      throw new Error('Supply with this file number already exists')
    }

    return await Supplie.create(data)
  }

  /**
   * Update supply
   */
  static async update(id: number, data: {
    supplyFileNumber?: number
    supplyName?: string
    supplyDescription?: string
    supplyTypeId?: number
    supplyStatus?: 'active' | 'inactive' | 'lost' | 'damaged'
  }) {
    const supply = await Supplie.findOrFail(id)

    // Check if file number already exists (excluding current record)
    if (data.supplyFileNumber) {
      const existingSupply = await Supplie.query()
        .where('supplyFileNumber', data.supplyFileNumber)
        .where('supplyId', '!=', id)
        .first()

      if (existingSupply) {
        throw new Error('Supply with this file number already exists')
      }
    }

    supply.merge(data)
    await supply.save()

    return supply
  }

  /**
   * Delete supply (soft delete)
   */
  static async delete(id: number) {
    const supply = await Supplie.findOrFail(id)
    await supply.delete()
    return supply
  }

  /**
   * Deactivate supply with reason
   */
  static async deactivate(id: number, data: {
    supplyDeactivationReason: string
    supplyDeactivationDate?: string
  }) {
    const supply = await Supplie.findOrFail(id)

    supply.supplyStatus = 'inactive'
    supply.supplyDeactivationReason = data.supplyDeactivationReason
    supply.supplyDeactivationDate = data.supplyDeactivationDate
      ? DateTime.fromISO(data.supplyDeactivationDate)
      : DateTime.now()

    await supply.save()
    return supply
  }

  /**
   * Get supply with its type
   */
  static async getWithType(id: number) {
    return await Supplie.query()
      .where('supplyId', id)
      .preload('supplyType')
      .firstOrFail()
  }

  /**
   * Get supplies by type
   */
  static async getByType(supplyTypeId: number) {
    return await Supplie.query()
      .where('supplyTypeId', supplyTypeId)
      .where('supplyStatus', 'active')
  }
}
