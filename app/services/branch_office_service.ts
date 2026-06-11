import BranchOffice from '#models/branch_office'
import EmpresaContratante from '#models/empresa_contratante'
import { DateTime } from 'luxon'
import { BRANCH_OFFICE_ERROR_CODES } from '../constants/branch_office_error_codes.js'
import { EMPRESA_CONTRATANTE_ERROR_CODES } from '../constants/empresa_contratante_error_codes.js'
import { BranchOfficeServiceError } from '../exceptions/branch_office_service_error.js'
import { EmpresaContratanteError } from '../exceptions/empresa_contratante_error.js'
import { findEmpresaContratanteInTenantOrFail } from '../helpers/repse_tenant_scope.js'
import { BranchOfficeFilterSearchInterface } from '../interfaces/branch_office_filter_search_interface.js'

function toIsoDateTimeString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }
  if (DateTime.isDateTime(value)) {
    return (value as DateTime).toISO()
  }
  if (value instanceof Date) {
    return DateTime.fromJSDate(value).toISO()
  }
  if (typeof value === 'string') {
    return value
  }
  return null
}

function serializeEmpresaContratanteEmbed(row: EmpresaContratante) {
  return {
    empresaContratanteId: row.empresaContratanteId,
    razonSocial: row.razonSocial,
  }
}

/** DTO público de sucursal con empresa contratante embebida cuando aplica. */
export function serializeBranchOffice(row: BranchOffice) {
  const contratante = row.empresaContratante

  return {
    branchOfficeId: row.branchOfficeId,
    businessUnitId: row.businessUnitId,
    branchOfficeName: row.branchOfficeName,
    branchOfficeSlug: row.branchOfficeSlug,
    branchOfficeLocationAddress: row.branchOfficeLocationAddress,
    branchOfficeIdealTemplateCount: row.branchOfficeIdealTemplateCount,
    branchOfficeMinActiveEmployeesPerShift: row.branchOfficeMinActiveEmployeesPerShift,
    empresaContratanteId: row.empresaContratanteId,
    empresaContratante: contratante ? serializeEmpresaContratanteEmbed(contratante) : null,
    branchOfficeCreatedAt: toIsoDateTimeString(row.branchOfficeCreatedAt),
    branchOfficeUpdatedAt: toIsoDateTimeString(row.branchOfficeUpdatedAt),
    branchOfficeDeletedAt: toIsoDateTimeString(row.deletedAt),
  }
}

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

  /**
   * Valida y resuelve el vínculo opcional con empresa contratante (sitio de servicio).
   */
  private static async resolveEmpresaContratanteLink(
    empresaContratanteId: number | null | undefined,
    businessUnitId: number,
    branchOfficeId?: number,
    currentEmpresaContratanteId?: number | null
  ): Promise<number | null> {
    if (empresaContratanteId === undefined) {
      return currentEmpresaContratanteId ?? null
    }

    if (empresaContratanteId === null) {
      return null
    }

    const empresa = await findEmpresaContratanteInTenantOrFail(
      empresaContratanteId,
      'empresa-contratante-no-encontrada'
    )

    if (empresa.businessUnitId !== businessUnitId) {
      throw new EmpresaContratanteError(
        'No se encontró la empresa contratante indicada.',
        EMPRESA_CONTRATANTE_ERROR_CODES.NOT_FOUND,
        404,
        'empresa-contratante-no-encontrada',
        'No se encontró la empresa contratante indicada'
      )
    }

    if (
      branchOfficeId !== undefined &&
      currentEmpresaContratanteId !== null &&
      currentEmpresaContratanteId !== undefined &&
      currentEmpresaContratanteId !== empresaContratanteId
    ) {
      throw new BranchOfficeServiceError(
        'La sucursal ya está ligada a otra empresa contratante.',
        BRANCH_OFFICE_ERROR_CODES.ALREADY_LINKED,
        409,
        'sucursal-ya-ligada',
        'La sucursal ya está ligada a otra empresa contratante'
      )
    }

    return empresaContratanteId
  }

  static async getAll(filters: BranchOfficeFilterSearchInterface, allowedBusinessUnitIds: number[]) {
    const page = filters.page || 1
    const limit = filters.limit || 10
    const sortOrder = filters.sortOrder === 'desc' ? 'desc' : 'asc'

    if (allowedBusinessUnitIds.length === 0) {
      return BranchOffice.query().whereRaw('1 = 0').preload('businessUnit').paginate(page, limit)
    }

    if (filters.empresaContratanteId !== undefined) {
      await findEmpresaContratanteInTenantOrFail(
        filters.empresaContratanteId,
        'empresa-contratante-no-encontrada'
      )
    }

    const query = BranchOffice.query()
      .whereIn('businessUnitId', allowedBusinessUnitIds)
      .preload('businessUnit')
      .preload('empresaContratante')

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

    if (filters.empresaContratanteId !== undefined) {
      query.where('empresaContratanteId', filters.empresaContratanteId)
    }

    if (filters.branchOfficeName) {
      query.whereILike('branchOfficeName', `%${filters.branchOfficeName}%`)
    }

    query.orderBy('branchOfficeName', sortOrder)

    const paginated = await query.paginate(page, limit)
    return {
      ...paginated.toJSON(),
      data: paginated.all().map((row) => serializeBranchOffice(row)),
    }
  }

  static async getById(id: number, allowedBusinessUnitIds: number[]) {
    if (allowedBusinessUnitIds.length === 0) {
      const branch = await BranchOffice.query()
        .where('branchOfficeId', id)
        .whereRaw('1 = 0')
        .preload('businessUnit')
        .preload('empresaContratante')
        .firstOrFail()
      return serializeBranchOffice(branch)
    }
    const branch = await BranchOffice.query()
      .where('branchOfficeId', id)
      .whereIn('businessUnitId', allowedBusinessUnitIds)
      .preload('businessUnit')
      .preload('empresaContratante')
      .firstOrFail()
    return serializeBranchOffice(branch)
  }

  static async create(
    data: {
      businessUnitId: number
      branchOfficeName: string
      branchOfficeLocationAddress?: string | null
      branchOfficeIdealTemplateCount?: number | null
      branchOfficeMinActiveEmployeesPerShift?: number | null
      empresaContratanteId?: number | null
    },
    allowedBusinessUnitIds: number[]
  ) {
    this.assertBusinessUnitAllowed(data.businessUnitId, allowedBusinessUnitIds)

    const resolvedEmpresaContratanteId = await this.resolveEmpresaContratanteLink(
      data.empresaContratanteId,
      data.businessUnitId
    )

    const baseSlug = this.slugify(data.branchOfficeName)
    const slug = await this.resolveUniqueSlug(data.businessUnitId, baseSlug)

    const created = await BranchOffice.create({
      businessUnitId: data.businessUnitId,
      branchOfficeName: data.branchOfficeName,
      branchOfficeSlug: slug,
      branchOfficeLocationAddress: data.branchOfficeLocationAddress ?? null,
      branchOfficeIdealTemplateCount: data.branchOfficeIdealTemplateCount ?? null,
      branchOfficeMinActiveEmployeesPerShift: data.branchOfficeMinActiveEmployeesPerShift ?? null,
      empresaContratanteId: resolvedEmpresaContratanteId,
    })
    await created.load('businessUnit')
    await created.load('empresaContratante')
    return serializeBranchOffice(created)
  }

  static async update(
    id: number,
    data: {
      businessUnitId?: number
      branchOfficeName?: string
      branchOfficeLocationAddress?: string | null
      branchOfficeIdealTemplateCount?: number | null
      branchOfficeMinActiveEmployeesPerShift?: number | null
      empresaContratanteId?: number | null
    },
    allowedBusinessUnitIds: number[]
  ) {
    const branch = await BranchOffice.query()
      .where('branchOfficeId', id)
      .whereIn('businessUnitId', allowedBusinessUnitIds)
      .firstOrFail()

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

    if (data.empresaContratanteId !== undefined) {
      branch.empresaContratanteId = await this.resolveEmpresaContratanteLink(
        data.empresaContratanteId,
        targetBusinessUnitId,
        branch.branchOfficeId,
        branch.empresaContratanteId
      )
    } else if (data.businessUnitId !== undefined && branch.empresaContratanteId !== null) {
      await this.resolveEmpresaContratanteLink(
        branch.empresaContratanteId,
        targetBusinessUnitId,
        branch.branchOfficeId,
        branch.empresaContratanteId
      )
    }

    if (data.businessUnitId !== undefined) branch.businessUnitId = data.businessUnitId
    if (data.branchOfficeName !== undefined) branch.branchOfficeName = data.branchOfficeName
    if (data.branchOfficeLocationAddress !== undefined) branch.branchOfficeLocationAddress = data.branchOfficeLocationAddress
    if (data.branchOfficeIdealTemplateCount !== undefined) branch.branchOfficeIdealTemplateCount = data.branchOfficeIdealTemplateCount
    if (data.branchOfficeMinActiveEmployeesPerShift !== undefined) branch.branchOfficeMinActiveEmployeesPerShift = data.branchOfficeMinActiveEmployeesPerShift

    branch.branchOfficeSlug = nextSlug
    await branch.save()
    await branch.load('businessUnit')
    await branch.load('empresaContratante')
    return serializeBranchOffice(branch)
  }

  static async delete(id: number, allowedBusinessUnitIds: number[]) {
    const branch = await BranchOffice.query()
      .where('branchOfficeId', id)
      .whereIn('businessUnitId', allowedBusinessUnitIds)
      .firstOrFail()
    await branch.delete()
    return branch
  }
}
