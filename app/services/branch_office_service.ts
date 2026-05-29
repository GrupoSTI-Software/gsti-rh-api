import BranchOffice from '#models/branch_office'
import { BRANCH_OFFICE_ERROR_CODES } from '../constants/branch_office_error_codes.js'
import { BranchOfficeServiceError } from '../exceptions/branch_office_service_error.js'
import { BranchOfficeFilterSearchInterface } from '../interfaces/branch_office_filter_search_interface.js'

export default class BranchOfficeService {
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

  static assertBusinessUnitAllowed(businessUnitId: number, allowedBusinessUnitIds: number[]) {
    if (allowedBusinessUnitIds.length === 0 || !allowedBusinessUnitIds.includes(businessUnitId)) {
      throw new BranchOfficeServiceError(
        'Unidad de negocio no encontrada o no permitida',
        BRANCH_OFFICE_ERROR_CODES.BU_NOT_ALLOWED,
        400
      )
    }
  }

  static async getAll(filters: BranchOfficeFilterSearchInterface, allowedBusinessUnitIds: number[]) {
    const page = filters.page || 1
    const limit = filters.limit || 10
    const sortOrder = filters.sortOrder === 'desc' ? 'desc' : 'asc'

    if (allowedBusinessUnitIds.length === 0) {
      return BranchOffice.query().whereRaw('1 = 0').preload('businessUnit').paginate(page, limit)
    }

    const query = BranchOffice.query().whereIn('businessUnitId', allowedBusinessUnitIds).preload('businessUnit')

    if (filters.includeDeleted) {
      // @ts-ignore proporcionado por adonis-lucid-soft-deletes
      query.withTrashed()
    }

    if (filters.businessUnitId) {
      if (!allowedBusinessUnitIds.includes(filters.businessUnitId)) {
        return BranchOffice.query().whereRaw('1 = 0').preload('businessUnit').paginate(page, limit)
      }
      query.where('businessUnitId', filters.businessUnitId)
    }

    if (filters.branchOfficeName) {
      query.whereILike('branchOfficeName', `%${filters.branchOfficeName}%`)
    }

    query.orderBy('branchOfficeName', sortOrder)

    return query.paginate(page, limit)
  }

  static async getById(id: number, allowedBusinessUnitIds: number[]) {
    if (allowedBusinessUnitIds.length === 0) {
      return BranchOffice.query().where('branchOfficeId', id).whereRaw('1 = 0').preload('businessUnit').firstOrFail()
    }
    return BranchOffice.query()
      .where('branchOfficeId', id)
      .whereIn('businessUnitId', allowedBusinessUnitIds)
      .preload('businessUnit')
      .firstOrFail()
  }

  static async create(
    data: {
      businessUnitId: number
      branchOfficeName: string
      branchOfficeLocationAddress?: string | null
      branchOfficeIdealTemplateCount?: number | null
      branchOfficeMinActiveEmployeesPerShift?: number | null
    },
    allowedBusinessUnitIds: number[]
  ) {
    this.assertBusinessUnitAllowed(data.businessUnitId, allowedBusinessUnitIds)
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
    },
    allowedBusinessUnitIds: number[]
  ) {
    const branch = await this.getById(id, allowedBusinessUnitIds)

    if (data.businessUnitId !== undefined && data.businessUnitId !== branch.businessUnitId) {
      this.assertBusinessUnitAllowed(data.businessUnitId, allowedBusinessUnitIds)
    }

    const targetBusinessUnitId = data.businessUnitId ?? branch.businessUnitId
    let nextSlug = branch.branchOfficeSlug

    if (data.branchOfficeName !== undefined && data.branchOfficeName !== branch.branchOfficeName) {
      const baseSlug = this.slugify(data.branchOfficeName)
      nextSlug = await this.resolveUniqueSlug(targetBusinessUnitId, baseSlug, branch.branchOfficeId)
    } else if (data.businessUnitId !== undefined && data.businessUnitId !== branch.businessUnitId) {
      nextSlug = await this.resolveUniqueSlug(targetBusinessUnitId, branch.branchOfficeSlug, branch.branchOfficeId)
    }

    if (data.businessUnitId !== undefined) branch.businessUnitId = data.businessUnitId
    if (data.branchOfficeName !== undefined) branch.branchOfficeName = data.branchOfficeName
    if (data.branchOfficeLocationAddress !== undefined) branch.branchOfficeLocationAddress = data.branchOfficeLocationAddress
    if (data.branchOfficeIdealTemplateCount !== undefined) branch.branchOfficeIdealTemplateCount = data.branchOfficeIdealTemplateCount
    if (data.branchOfficeMinActiveEmployeesPerShift !== undefined) branch.branchOfficeMinActiveEmployeesPerShift = data.branchOfficeMinActiveEmployeesPerShift

    branch.branchOfficeSlug = nextSlug
    await branch.save()
    await branch.load('businessUnit')
    return branch
  }

  static async delete(id: number, allowedBusinessUnitIds: number[]) {
    const branch = await this.getById(id, allowedBusinessUnitIds)
    await branch.delete()
    return branch
  }
}
