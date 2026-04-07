import BranchOffice from '#models/branch_office'
import BusinessUnit from '#models/business_unit'
import env from '#start/env'
import { BRANCH_OFFICE_ERROR_CODES } from '../constants/branch_office_error_codes.js'
import { BranchOfficeServiceError } from '../exceptions/branch_office_service_error.js'
import { BranchOfficeFilterSearchInterface } from '../interfaces/branch_office_filter_search_interface.js'

export default class BranchOfficeService {
  /**
   * Slugs de unidades de negocio permitidas en esta instancia (variable SYSTEM_BUSINESS, separada por comas).
   */
  static getSystemBusinessSlugs(): string[] {
    const businessConf = env.get('SYSTEM_BUSINESS', '') || ''
    return businessConf
      .split(',')
      .map((slug: string) => slug.trim())
      .filter((slug: string) => slug.length > 0)
  }

  /**
   * IDs de unidades de negocio activas cuyo slug está en SYSTEM_BUSINESS.
   */
  static async getAllowedBusinessUnitIds(): Promise<number[]> {
    const slugs = this.getSystemBusinessSlugs()
    if (slugs.length === 0) {
      return []
    }
    const units = await BusinessUnit.query()
      .whereNull('business_unit_deleted_at')
      .where('business_unit_active', 1)
      .whereIn('business_unit_slug', slugs)
    return units.map((u) => u.businessUnitId)
  }

  /**
   * Genera un slug URL a partir del nombre (sin acentos, minúsculas, guiones).
   */
  static slugify(name: string): string {
    const base = name
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    return base || `sucursal-${Date.now()}`
  }

  /**
   * Resuelve un slug único dentro de la unidad de negocio (excluye eliminados lógicos).
   */
  static async resolveUniqueSlug(
    businessUnitId: number,
    baseSlug: string,
    excludeBranchOfficeId?: number
  ): Promise<string> {
    let slug = baseSlug
    let suffix = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const query = BranchOffice.query()
        .where('businessUnitId', businessUnitId)
        .where('branchOfficeSlug', slug)
      if (excludeBranchOfficeId) {
        query.where('branchOfficeId', '!=', excludeBranchOfficeId)
      }
      const exists = await query.first()
      if (!exists) {
        return slug
      }
      suffix += 1
      slug = `${baseSlug}-${suffix}`
    }
  }

  static async assertBusinessUnitExists(businessUnitId: number) {
    const slugs = this.getSystemBusinessSlugs()
    if (slugs.length === 0) {
      throw new BranchOfficeServiceError(
        'No hay unidades de negocio configuradas para este sistema (SYSTEM_BUSINESS)',
        BRANCH_OFFICE_ERROR_CODES.CFG_SYSTEM_BUSINESS,
        400
      )
    }
    const unit = await BusinessUnit.query()
      .whereNull('business_unit_deleted_at')
      .where('businessUnitId', businessUnitId)
      .where('business_unit_active', 1)
      .whereIn('business_unit_slug', slugs)
      .first()
    if (!unit) {
      throw new BranchOfficeServiceError(
        'Unidad de negocio no encontrada o no permitida en el sistema',
        BRANCH_OFFICE_ERROR_CODES.BU_NOT_ALLOWED,
        400
      )
    }
  }

  static async getAll(filters: BranchOfficeFilterSearchInterface) {
    const page = filters.page || 1
    const limit = filters.limit || 10
    const sortOrder = filters.sortOrder === 'desc' ? 'desc' : 'asc'

    const allowedIds = await this.getAllowedBusinessUnitIds()
    if (allowedIds.length === 0) {
      return await BranchOffice.query().whereRaw('1 = 0').preload('businessUnit').paginate(page, limit)
    }

    const query = BranchOffice.query().whereIn('businessUnitId', allowedIds).preload('businessUnit')

    if (filters.includeDeleted) {
      // @ts-ignore proporcionado por adonis-lucid-soft-deletes
      query.withTrashed()
    }

    if (filters.businessUnitId) {
      if (!allowedIds.includes(filters.businessUnitId)) {
        return await BranchOffice.query().whereRaw('1 = 0').preload('businessUnit').paginate(page, limit)
      }
      query.where('businessUnitId', filters.businessUnitId)
    }

    if (filters.branchOfficeName) {
      query.whereILike('branchOfficeName', `%${filters.branchOfficeName}%`)
    }

    query.orderBy('branchOfficeName', sortOrder)

    return await query.paginate(page, limit)
  }

  static async getById(id: number) {
    const allowedIds = await this.getAllowedBusinessUnitIds()
    if (allowedIds.length === 0) {
      return await BranchOffice.query().where('branchOfficeId', id).whereRaw('1 = 0').preload('businessUnit').firstOrFail()
    }
    return await BranchOffice.query()
      .where('branchOfficeId', id)
      .whereIn('businessUnitId', allowedIds)
      .preload('businessUnit')
      .firstOrFail()
  }

  static async create(data: {
    businessUnitId: number
    branchOfficeName: string
    branchOfficeLocationAddress?: string | null
    branchOfficeIdealTemplateCount?: number | null
    branchOfficeMinActiveEmployeesPerShift?: number | null
  }) {
    await this.assertBusinessUnitExists(data.businessUnitId)
    const baseSlug = this.slugify(data.branchOfficeName)
    const slug = await this.resolveUniqueSlug(data.businessUnitId, baseSlug)

    const created = await BranchOffice.create({
      businessUnitId: data.businessUnitId,
      branchOfficeName: data.branchOfficeName,
      branchOfficeSlug: slug,
      branchOfficeLocationAddress: data.branchOfficeLocationAddress ?? null,
      branchOfficeIdealTemplateCount: data.branchOfficeIdealTemplateCount ?? null,
      branchOfficeMinActiveEmployeesPerShift: data.branchOfficeMinActiveEmployeesPerShift ?? null,
    })
    await created.load('businessUnit')
    return created
  }

  static async update(
    id: number,
    data: {
      businessUnitId?: number
      branchOfficeName?: string
      branchOfficeLocationAddress?: string | null
      branchOfficeIdealTemplateCount?: number | null
      branchOfficeMinActiveEmployeesPerShift?: number | null
    }
  ) {
    const branch = await this.getById(id)

    if (data.businessUnitId !== undefined && data.businessUnitId !== branch.businessUnitId) {
      await this.assertBusinessUnitExists(data.businessUnitId)
    }

    const targetBusinessUnitId = data.businessUnitId ?? branch.businessUnitId
    let nextSlug = branch.branchOfficeSlug

    if (data.branchOfficeName !== undefined && data.branchOfficeName !== branch.branchOfficeName) {
      const baseSlug = this.slugify(data.branchOfficeName)
      nextSlug = await this.resolveUniqueSlug(targetBusinessUnitId, baseSlug, branch.branchOfficeId)
    } else if (data.businessUnitId !== undefined && data.businessUnitId !== branch.businessUnitId) {
      nextSlug = await this.resolveUniqueSlug(targetBusinessUnitId, branch.branchOfficeSlug, branch.branchOfficeId)
    }

    if (data.businessUnitId !== undefined) {
      branch.businessUnitId = data.businessUnitId
    }
    if (data.branchOfficeName !== undefined) {
      branch.branchOfficeName = data.branchOfficeName
    }
    if (data.branchOfficeLocationAddress !== undefined) {
      branch.branchOfficeLocationAddress = data.branchOfficeLocationAddress
    }
    if (data.branchOfficeIdealTemplateCount !== undefined) {
      branch.branchOfficeIdealTemplateCount = data.branchOfficeIdealTemplateCount
    }
    if (data.branchOfficeMinActiveEmployeesPerShift !== undefined) {
      branch.branchOfficeMinActiveEmployeesPerShift = data.branchOfficeMinActiveEmployeesPerShift
    }
    branch.branchOfficeSlug = nextSlug
    await branch.save()
    await branch.load('businessUnit')
    return branch
  }

  static async delete(id: number) {
    const branch = await this.getById(id)
    await branch.delete()
    return branch
  }
}
