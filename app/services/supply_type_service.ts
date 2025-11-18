import SupplyType from '#models/supply_type'
import { SupplyTypeFilterSearchInterface } from '../interfaces/supply_type_filter_search_interface.js'

export default class SupplyTypeService {
  /**
   * Get all supply types with pagination and filters
   */
  static async getAll(filters: SupplyTypeFilterSearchInterface) {
    const page = filters.page || 1
    const limit = filters.limit || 10

    const query = SupplyType.query()

    if (filters.search) {
      query.where((builder) => {
        builder
          .whereILike('supplyTypeName', `%${filters.search}%`)
          .orWhereILike('supplyTypeDescription', `%${filters.search}%`)
          .orWhereILike('supplyTypeSlug', `%${filters.search}%`)
      })
    }

    if (filters.supplyTypeName) {
      query.whereILike('supplyTypeName', `%${filters.supplyTypeName}%`)
    }

    if (filters.supplyTypeSlug) {
      query.whereILike('supplyTypeSlug', `%${filters.supplyTypeSlug}%`)
    }

    return await query.paginate(page, limit)
  }

  /**
   * Get supply type by ID
   */
  static async getById(id: number) {
    return await SupplyType.findOrFail(id)
  }

  /**
   * Create new supply type
   */
  static async create(data: {
    supplyTypeName: string
    supplyTypeDescription?: string
    supplyTypeIdentifier?: string
    supplyTypeSlug: string
  }) {
    // Check if slug already exists
    const existingSupplyType = await SupplyType.query()
      .where('supplyTypeSlug', data.supplyTypeSlug)
      .first()

    if (existingSupplyType) {
      throw new Error('Supply type with this slug already exists')
    }

    return await SupplyType.create(data)
  }

  /**
   * Update supply type
   */
  static async update(id: number, data: {
    supplyTypeName?: string
    supplyTypeDescription?: string
    supplyTypeIdentifier?: string
    supplyTypeSlug?: string
  }) {
    const supplyType = await SupplyType.findOrFail(id)

    // Check if slug already exists (excluding current record)
    if (data.supplyTypeSlug) {
      const existingSupplyType = await SupplyType.query()
        .where('supplyTypeSlug', data.supplyTypeSlug)
        .where('supplyTypeId', '!=', id)
        .first()

      if (existingSupplyType) {
        throw new Error('Supply type with this slug already exists')
      }
    }

    supplyType.merge(data)
    await supplyType.save()

    return supplyType
  }

  /**
   * Delete supply type (soft delete)
   */
  static async delete(id: number) {
    const supplyType = await SupplyType.findOrFail(id)
    await supplyType.delete()
    return supplyType
  }

  /**
   * Get supply type with its characteristics
   */
  static async getWithCharacteristics(id: number) {
    return await SupplyType.query()
      .where('supplyTypeId', id)
      .preload('supplies', (query) => {
        query.preload('supplieCaracteristics')
      })
      .firstOrFail()
  }
}
