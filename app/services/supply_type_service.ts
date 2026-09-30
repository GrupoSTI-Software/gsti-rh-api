import SupplyType from '#models/supply_type'
import { slugifyFileNamePart } from '#helpers/download_file_name'
import { assertSupplyTypeWithoutAssets } from '#modules/assets/assets.rules'
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
    supplyTypeSlug?: string
  }) {
    if (!data.supplyTypeSlug) {
      return await SupplyType.create({
        ...data,
        supplyTypeSlug: await SupplyTypeService.resolveFreeSlug(data.supplyTypeName),
      })
    }

    // Check if slug already exists
    const existingSupplyType = await SupplyType.query()
      .where('supplyTypeSlug', data.supplyTypeSlug)
      .first()

    if (existingSupplyType) {
      throw new Error('Supply type with this slug already exists')
    }

    return await SupplyType.create({ ...data, supplyTypeSlug: data.supplyTypeSlug })
  }

  /**
   * Slug derivado del nombre, libre en la empresa (el modelo acota la
   * consulta al tenant): `laptop`, `laptop-2`, `laptop-3`...
   */
  private static async resolveFreeSlug(name: string): Promise<string> {
    const base = slugifyFileNamePart(name) || 'tipo-de-activo'
    const taken = await SupplyType.query()
      .where((query) => {
        query.where('supplyTypeSlug', base).orWhere('supplyTypeSlug', 'like', `${base}-%`)
      })
      .select('supplyTypeSlug')
    const used = new Set(taken.map((row) => row.supplyTypeSlug))
    if (!used.has(base)) return base
    let suffix = 2
    while (used.has(`${base}-${suffix}`)) suffix += 1
    return `${base}-${suffix}`
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
    await assertSupplyTypeWithoutAssets(supplyType.supplyTypeId)
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
