import BranchOffice from '#models/branch_office'
import EmployeeBranchOffice from '#models/employee_branch_office'
import EmpresaContratante from '#models/empresa_contratante'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DateTime } from 'luxon'
import { BRANCH_OFFICE_ERROR_CODES } from '../constants/branch_office_error_codes.js'
import { EMPRESA_CONTRATANTE_ERROR_CODES } from '../constants/empresa_contratante_error_codes.js'
import { BranchOfficeServiceError } from '../exceptions/branch_office_service_error.js'
import { EmpresaContratanteError } from '../exceptions/empresa_contratante_error.js'
import { findEmpresaContratanteInTenantOrFail } from '../helpers/repse_tenant_scope.js'
import { BranchOfficeFilterSearchInterface } from '../interfaces/branch_office_filter_search_interface.js'
import {
  resolveUniqueBranchOfficeSlug,
  slugifyBranchOffice,
} from '#helpers/branch_office_slug'
import EmployeeTemporaryAssignmentService from './employee_temporary_assignment_service.js'
import { isValidTimeZone } from '#modules/attendance-time/attendance_clock'

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
export function serializeBranchOffice(row: BranchOffice, activeEmployeesCount?: number) {
  const contratante = row.empresaContratante

  return {
    branchOfficeId: row.branchOfficeId,
    businessUnitId: row.businessUnitId,
    branchOfficeName: row.branchOfficeName,
    branchOfficeSlug: row.branchOfficeSlug,
    branchOfficeLocationAddress: row.branchOfficeLocationAddress,
    branchOfficeStreet: row.branchOfficeStreet,
    branchOfficeSettlement: row.branchOfficeSettlement,
    branchOfficeZipcode: row.branchOfficeZipcode,
    branchOfficeCity: row.branchOfficeCity,
    branchOfficeState: row.branchOfficeState,
    branchOfficeTimezone: row.branchOfficeTimezone,
    branchOfficeIsDefault: row.branchOfficeIsDefault,
    activeEmployeesCount: activeEmployeesCount ?? null,
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
   * La regla vive en `#helpers/branch_office_slug`; aquí queda la fachada que
   * ya consumen controladores y servicios.
   */
  static slugify(name: string): string {
    return slugifyBranchOffice(name)
  }

  /**
   * Resuelve un slug único dentro de la unidad de negocio (excluye eliminados lógicos).
   */
  static async resolveUniqueSlug(
    businessUnitId: number,
    baseSlug: string,
    excludeBranchOfficeId?: number,
    trx?: TransactionClientContract
  ): Promise<string> {
    return resolveUniqueBranchOfficeSlug(businessUnitId, baseSlug, excludeBranchOfficeId, trx)
  }

  /**
   * La zona de la sucursal decide a qué hora se evalúa la asistencia de su
   * personal: una zona que Luxon no reconoce se rechaza en lugar de guardarse
   * y caer en silencio a la de la empresa.
   */
  private static assertTimeZone(zone: string | null | undefined): void {
    if (zone === null || zone === undefined) return
    if (isValidTimeZone(zone)) return
    throw new BranchOfficeServiceError(
      'La zona horaria de la sucursal no es un identificador IANA válido.',
      BRANCH_OFFICE_ERROR_CODES.VAL_INPUT,
      400,
      'zona-horaria-invalida',
      `"${zone}" no es una zona horaria reconocida; usa un identificador como America/Ciudad_Juarez.`
    )
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

  /**
   * Empleados con asignación vigente, por sucursal. El listado lo necesita
   * para poder avisar a cuánta gente afecta un borrado antes de hacerlo.
   */
  private static async countActiveEmployeesByBranch(
    branchOfficeIds: number[]
  ): Promise<Map<number, number>> {
    if (branchOfficeIds.length === 0) return new Map()

    const rows = await db
      .from('employee_branch_offices')
      .whereIn('branch_office_id', branchOfficeIds)
      .where('employee_branch_office_active', 1)
      .groupBy('branch_office_id')
      .select('branch_office_id')
      .count('* as total')

    return new Map(
      rows.map((row: { branch_office_id: number; total: number }) => [
        Number(row.branch_office_id),
        Number(row.total),
      ])
    )
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
    const rows = paginated.all()
    const counts = await this.countActiveEmployeesByBranch(rows.map((row) => row.branchOfficeId))

    return {
      ...paginated.toJSON(),
      data: rows.map((row) => serializeBranchOffice(row, counts.get(row.branchOfficeId) ?? 0)),
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

  /**
   * Alta de sucursal.
   *
   * `businessUnitId` es opcional: el backoffice identifica a la empresa por su
   * publicId (UUID) y no conoce su id numerico, asi que el alta la resuelve
   * desde el scope de la sesion. Cuando si viene, el scope manda igual: una
   * empresa ajena se rechaza con BU_NOT_ALLOWED.
   */
  static async create(
    data: {
      businessUnitId?: number
      branchOfficeName: string
      branchOfficeLocationAddress?: string | null
      branchOfficeStreet?: string | null
      branchOfficeSettlement?: string | null
      branchOfficeZipcode?: string | null
      branchOfficeCity?: string | null
      branchOfficeState?: string | null
      branchOfficeTimezone?: string | null
      branchOfficeIdealTemplateCount?: number | null
      branchOfficeMinActiveEmployeesPerShift?: number | null
      empresaContratanteId?: number | null
      branchOfficeIsDefault?: boolean
    },
    allowedBusinessUnitIds: number[]
  ) {
    const businessUnitId = data.businessUnitId ?? allowedBusinessUnitIds[0]
    this.assertBusinessUnitAllowed(businessUnitId, allowedBusinessUnitIds)

    const resolvedEmpresaContratanteId = await this.resolveEmpresaContratanteLink(
      data.empresaContratanteId,
      businessUnitId
    )

    this.assertTimeZone(data.branchOfficeTimezone)

    const baseSlug = this.slugify(data.branchOfficeName)
    const slug = await this.resolveUniqueSlug(businessUnitId, baseSlug)

    const created = await BranchOffice.create({
      businessUnitId,
      branchOfficeName: data.branchOfficeName,
      branchOfficeSlug: slug,
      branchOfficeLocationAddress: data.branchOfficeLocationAddress ?? null,
      branchOfficeStreet: data.branchOfficeStreet ?? null,
      branchOfficeSettlement: data.branchOfficeSettlement ?? null,
      branchOfficeZipcode: data.branchOfficeZipcode ?? null,
      branchOfficeCity: data.branchOfficeCity ?? null,
      branchOfficeState: data.branchOfficeState ?? null,
      branchOfficeTimezone: data.branchOfficeTimezone ?? null,
      branchOfficeIdealTemplateCount: data.branchOfficeIdealTemplateCount ?? null,
      branchOfficeMinActiveEmployeesPerShift: data.branchOfficeMinActiveEmployeesPerShift ?? null,
      empresaContratanteId: resolvedEmpresaContratanteId,
      branchOfficeIsDefault: 0,
    })

    if (data.branchOfficeIsDefault === true) {
      await this.transferDefaultFlag(created)
    }

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
      branchOfficeStreet?: string | null
      branchOfficeSettlement?: string | null
      branchOfficeZipcode?: string | null
      branchOfficeCity?: string | null
      branchOfficeState?: string | null
      branchOfficeTimezone?: string | null
      branchOfficeIdealTemplateCount?: number | null
      branchOfficeMinActiveEmployeesPerShift?: number | null
      empresaContratanteId?: number | null
      branchOfficeIsDefault?: boolean
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
    if (data.branchOfficeStreet !== undefined) branch.branchOfficeStreet = data.branchOfficeStreet
    if (data.branchOfficeSettlement !== undefined) branch.branchOfficeSettlement = data.branchOfficeSettlement
    if (data.branchOfficeZipcode !== undefined) branch.branchOfficeZipcode = data.branchOfficeZipcode
    if (data.branchOfficeCity !== undefined) branch.branchOfficeCity = data.branchOfficeCity
    if (data.branchOfficeState !== undefined) branch.branchOfficeState = data.branchOfficeState
    if (data.branchOfficeTimezone !== undefined) {
      this.assertTimeZone(data.branchOfficeTimezone)
      branch.branchOfficeTimezone = data.branchOfficeTimezone
    }
    if (data.branchOfficeIdealTemplateCount !== undefined) branch.branchOfficeIdealTemplateCount = data.branchOfficeIdealTemplateCount
    if (data.branchOfficeMinActiveEmployeesPerShift !== undefined) branch.branchOfficeMinActiveEmployeesPerShift = data.branchOfficeMinActiveEmployeesPerShift

    if (data.branchOfficeIsDefault === false && branch.branchOfficeIsDefault === 1) {
      throw new BranchOfficeServiceError(
        'La marca de sucursal principal no se puede quitar.',
        BRANCH_OFFICE_ERROR_CODES.DEFAULT_NOT_CLEARABLE,
        409,
        'default-no-se-desmarca',
        'Marca otra sucursal como principal: la empresa siempre tiene una'
      )
    }

    branch.branchOfficeSlug = nextSlug
    await branch.save()

    if (data.branchOfficeIsDefault === true && branch.branchOfficeIsDefault !== 1) {
      await this.transferDefaultFlag(branch)
    }
    await branch.load('businessUnit')
    await branch.load('empresaContratante')
    return serializeBranchOffice(branch)
  }

  /**
   * Pasa la marca de sucursal principal a `branch`, quitándosela a la que la
   * tenga. En una transacción porque el UNIQUE sobre la columna generada no
   * tolera el estado intermedio de dos defaults vivas.
   */
  private static async transferDefaultFlag(branch: BranchOffice) {
    await db.transaction(async (trx) => {
      await BranchOffice.query({ client: trx })
        .where('businessUnitId', branch.businessUnitId)
        .where('branchOfficeIsDefault', 1)
        .whereNot('branchOfficeId', branch.branchOfficeId)
        .update({ branch_office_is_default: 0 })

      branch.useTransaction(trx)
      branch.branchOfficeIsDefault = 1
      await branch.save()
    })
  }

  /**
   * Empleados con asignación vigente a la sucursal.
   */
  static async countActiveEmployees(branchOfficeId: number): Promise<number> {
    const rows = await db
      .from('employee_branch_offices')
      .where('branch_office_id', branchOfficeId)
      .where('employee_branch_office_active', 1)
      .count('* as total')
    return Number(rows[0]?.total ?? 0)
  }

  /**
   * Elimina la sucursal y, si tenía gente, la traslada a la sucursal destino.
   *
   * Dos candados: la default no se elimina (la empresa se quedaría sin destino
   * para los empleados sin sucursal), y una sucursal con empleados activos
   * exige destino explícito. Antes el borrado no tocaba `employee_branch_offices`
   * y dejaba asignaciones vivas apuntando a una sucursal muerta: el empleado
   * figuraba con sucursal en base, pero ninguna consulta se la devolvía.
   *
   * El traslado cierra la asignación vieja y abre una nueva en lugar de
   * reescribir la fila: el paso por la sucursal que cerró es historia real.
   */
  static async delete(
    id: number,
    allowedBusinessUnitIds: number[],
    options: { targetBranchOfficeId?: number } = {}
  ) {
    const branch = await BranchOffice.query()
      .where('branchOfficeId', id)
      .whereIn('businessUnitId', allowedBusinessUnitIds)
      .firstOrFail()

    if (branch.branchOfficeIsDefault === 1) {
      throw new BranchOfficeServiceError(
        'La sucursal principal de la empresa no se puede eliminar.',
        BRANCH_OFFICE_ERROR_CODES.DEFAULT_NOT_DELETABLE,
        409,
        'sucursal-default-no-eliminable',
        'Marca otra sucursal como principal antes de eliminar esta'
      )
    }

    const activeEmployees = await this.countActiveEmployees(branch.branchOfficeId)

    if (activeEmployees > 0 && options.targetBranchOfficeId === undefined) {
      throw new BranchOfficeServiceError(
        'La sucursal tiene empleados asignados.',
        BRANCH_OFFICE_ERROR_CODES.TARGET_REQUIRED,
        409,
        'sucursal-requiere-destino',
        `Indica a qué sucursal se trasladan los ${activeEmployees} empleados asignados`
      )
    }

    let target: BranchOffice | null = null
    if (activeEmployees > 0) {
      target = await BranchOffice.query()
        .where('branchOfficeId', options.targetBranchOfficeId!)
        .where('businessUnitId', branch.businessUnitId)
        .whereNot('branchOfficeId', branch.branchOfficeId)
        .first()

      if (!target) {
        throw new BranchOfficeServiceError(
          'La sucursal destino no es válida.',
          BRANCH_OFFICE_ERROR_CODES.TARGET_INVALID,
          409,
          'sucursal-destino-invalido',
          'El destino debe ser otra sucursal viva de la misma empresa'
        )
      }
    }

    await EmployeeTemporaryAssignmentService.cancelActiveAssignmentsByBranch(
      branch.branchOfficeId,
      DateTime.now().toFormat('yyyy-MM-dd')
    )

    await db.transaction(async (trx) => {
      if (target) {
        await this.moveActiveAssignments(branch.branchOfficeId, target.branchOfficeId, trx)
      }
      branch.useTransaction(trx)
      await branch.delete()
    })

    return branch
  }

  /**
   * Cierra las asignaciones vivas de una sucursal y abre las equivalentes en
   * el destino, conservando el paso por la sucursal que se va.
   */
  private static async moveActiveAssignments(
    fromBranchOfficeId: number,
    toBranchOfficeId: number,
    trx: TransactionClientContract
  ) {
    const assignments = await EmployeeBranchOffice.query({ client: trx })
      .where('branchOfficeId', fromBranchOfficeId)
      .where('employeeBranchOfficeActive', 1)

    if (assignments.length === 0) return

    // Knex no serializa Luxon DateTime en .update(): se usa Date nativo.
    const now = new Date()

    await EmployeeBranchOffice.query({ client: trx })
      .where('branchOfficeId', fromBranchOfficeId)
      .where('employeeBranchOfficeActive', 1)
      .update({
        employeeBranchOfficeActive: 0,
        employeeBranchOfficeDeactivatedAt: now,
        employeeBranchOfficeUpdatedAt: now,
      })

    await EmployeeBranchOffice.createMany(
      assignments.map((assignment) => ({
        employeeId: assignment.employeeId,
        businessUnitId: assignment.businessUnitId,
        branchOfficeId: toBranchOfficeId,
        employeeBranchOfficeActive: 1,
        employeeBranchOfficeDeactivatedAt: null,
      })),
      { client: trx }
    )
  }
}
