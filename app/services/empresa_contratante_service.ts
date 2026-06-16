import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import EmpresaContratante from '#models/empresa_contratante'
import { EMPRESA_CONTRATANTE_ERROR_CODES } from '../constants/empresa_contratante_error_codes.js'
import { EmpresaContratanteError } from '../exceptions/empresa_contratante_error.js'
import { maskRazonSocialForLog, maskRfcForLog } from '../helpers/pii_log_helper.js'
import {
  assertBusinessUnitInTenant,
  findEmpresaContratanteInTenantOrFail,
  getAllowedBusinessUnitIds,
} from '../helpers/repse_tenant_scope.js'
import { normalizeRfc } from '../shared/validators/rfc.validator.js'

export interface EmpresaContratanteCreatePayload {
  businessUnitId: number
  razonSocial: string
  rfc: string
  domicilioFiscal: string
  representanteLegal?: string | null
  correo?: string | null
  telefono?: string | null
}

export type EmpresaContratanteUpdatePayload = Partial<
  Omit<EmpresaContratanteCreatePayload, 'businessUnitId'>
>

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

/** DTO público sin identificadores de scope interno. */
export function serializeEmpresaContratante(row: EmpresaContratante) {
  return {
    id: row.empresaContratanteId,
    razonSocial: row.razonSocial,
    rfc: row.rfc,
    domicilioFiscal: row.domicilioFiscal,
    representanteLegal: row.representanteLegal,
    correo: row.correo,
    telefono: row.telefono,
    createdAt: toIsoDateTimeString(row.createdAt),
    updatedAt: toIsoDateTimeString(row.updatedAt),
  }
}

/**
 * Servicio de dominio del catálogo de empresas contratantes REPSE.
 *
 * - Aísla por tenant vía `business_unit_id` y `SYSTEM_BUSINESS`.
 * - RFC único a nivel catálogo del prestador (todas las BUs permitidas).
 * - Soft delete obligatorio para conservar expediente fiscal.
 */
export default class EmpresaContratanteService {
  /**
   * Registra una empresa contratante en el catálogo del tenant.
   */
  async create(payload: EmpresaContratanteCreatePayload) {
    await assertBusinessUnitInTenant(payload.businessUnitId)

    const normalizedRfc = normalizeRfc(payload.rfc)
    await this.assertRfcUniqueInTenant(normalizedRfc)

    const row = await db.transaction(async (trx) => {
      const created = new EmpresaContratante()
      created.businessUnitId = payload.businessUnitId
      created.razonSocial = payload.razonSocial.trim()
      created.rfc = normalizedRfc
      created.domicilioFiscal = payload.domicilioFiscal.trim()
      created.representanteLegal = payload.representanteLegal?.trim() ?? null
      created.correo = payload.correo?.trim() ?? null
      created.telefono = payload.telefono?.trim() ?? null
      created.useTransaction(trx)
      await created.save()
      return created
    })

    await row.refresh()
    return serializeEmpresaContratante(row)
  }

  /**
   * Lista paginada con búsqueda opcional por razón social o RFC (case-insensitive).
   */
  async listPaginated(
    page: number,
    perPage: number,
    q?: string,
    businessUnitId?: number
  ) {
    const safePerPage = Math.min(Math.max(perPage, 1), 500)
    const safePage = Math.max(page, 1)
    const allowed = await getAllowedBusinessUnitIds()

    if (allowed.length === 0) {
      return {
        meta: {
          total: 0,
          perPage: safePerPage,
          currentPage: safePage,
          lastPage: 0,
          page: safePage,
          firstPage: 1,
        },
        data: [],
      }
    }

    if (businessUnitId !== undefined) {
      await assertBusinessUnitInTenant(businessUnitId)
    }

    const targetBusinessUnitIds =
      businessUnitId !== undefined ? [businessUnitId] : allowed

    let query = EmpresaContratante.query()
      .whereNull('empresa_contratante_deleted_at')
      .whereIn('business_unit_id', targetBusinessUnitIds)

    const search = q?.trim()
    if (search && search.length > 0) {
      const term = `%${search}%`
      query = query.where((builder) => {
        builder
          .whereILike('empresa_contratante_razon_social', term)
          .orWhereILike('empresa_contratante_rfc', term)
      })
    }

    const paginator = await query
      .orderBy('empresa_contratante_created_at', 'desc')
      .paginate(safePage, safePerPage)

    const serialized = paginator.serialize()
    const currentPage = serialized.meta.currentPage

    return {
      meta: {
        ...serialized.meta,
        page: currentPage,
      },
      data: paginator.all().map((row) => serializeEmpresaContratante(row)),
    }
  }

  /** Detalle por id validando scope del tenant. */
  async findById(empresaContratanteId: number) {
    const row = await findEmpresaContratanteInTenantOrFail(empresaContratanteId)
    return serializeEmpresaContratante(row)
  }

  /**
   * Actualización parcial. No permite cambiar `businessUnitId`.
   */
  async update(empresaContratanteId: number, payload: EmpresaContratanteUpdatePayload) {
    const current = await findEmpresaContratanteInTenantOrFail(empresaContratanteId)

    const targetRfc =
      payload.rfc !== undefined ? normalizeRfc(payload.rfc) : current.rfc

    if (targetRfc !== current.rfc) {
      await this.assertRfcUniqueInTenant(targetRfc, empresaContratanteId)
    }

    const updated = await db.transaction(async (trx) => {
      if (payload.razonSocial !== undefined) {
        current.razonSocial = payload.razonSocial.trim()
      }
      if (payload.rfc !== undefined) {
        current.rfc = targetRfc
      }
      if (payload.domicilioFiscal !== undefined) {
        current.domicilioFiscal = payload.domicilioFiscal.trim()
      }
      if (payload.representanteLegal !== undefined) {
        current.representanteLegal = payload.representanteLegal?.trim() ?? null
      }
      if (payload.correo !== undefined) {
        current.correo = payload.correo?.trim() ?? null
      }
      if (payload.telefono !== undefined) {
        current.telefono = payload.telefono?.trim() ?? null
      }
      current.useTransaction(trx)
      await current.save()
      return current
    })

    await updated.refresh()
    return serializeEmpresaContratante(updated)
  }

  /** Soft delete sin validar contratos asociados (ESB-08-11-02-03). */
  async destroy(empresaContratanteId: number) {
    const row = await findEmpresaContratanteInTenantOrFail(empresaContratanteId)

    await db.transaction(async (trx) => {
      const blocking = await trx
        .from('contratos_servicios_especializados')
        .where('empresa_contratante_id', empresaContratanteId)
        .whereNull('contrato_servicio_especializado_deleted_at')
        .select('contrato_servicio_especializado_id')
        .forUpdate()
        .limit(1)

      if (blocking.length > 0) {
        throw new EmpresaContratanteError(
          'No se puede eliminar la empresa contratante mientras tenga contratos asociados.',
          EMPRESA_CONTRATANTE_ERROR_CODES.CONTRATOS_ACTIVOS,
          409,
          'empresa-con-contratos-activos',
          'Empresa con contratos activos'
        )
      }

      const linkedSites = await trx
        .from('branch_offices')
        .where('empresa_contratante_id', empresaContratanteId)
        .whereNull('branch_office_deleted_at')
        .count('* as total')
        .forUpdate()

      const linkedCount = Number(linkedSites[0]?.total ?? 0)
      if (linkedCount > 0) {
        throw new EmpresaContratanteError(
          `Desliga las ${linkedCount} sucursales ligadas antes de eliminar la empresa`,
          EMPRESA_CONTRATANTE_ERROR_CODES.SITIOS_LIGADOS,
          422,
          'empresa-con-sitios-ligados',
          `Desliga las ${linkedCount} sucursales ligadas antes de eliminar la empresa`
        )
      }

      row.useTransaction(trx)
      await row.delete()
    })
  }

  /**
   * Verifica que el RFC no exista en el catálogo activo del tenant
   * (todas las BUs permitidas por SYSTEM_BUSINESS).
   */
  private async assertRfcUniqueInTenant(rfc: string, excludeId?: number) {
    const allowed = await getAllowedBusinessUnitIds()
    if (allowed.length === 0) {
      return
    }

    let query = EmpresaContratante.query()
      .whereNull('empresa_contratante_deleted_at')
      .whereIn('business_unit_id', allowed)
      .where('empresa_contratante_rfc', rfc)

    if (excludeId !== undefined) {
      query = query.whereNot('empresa_contratante_id', excludeId)
    }

    const conflict = await query.first()
    if (conflict) {
      logger.debug(
        'RFC duplicado en catálogo de empresas contratantes rfc=%s razon=%s',
        maskRfcForLog(rfc),
        maskRazonSocialForLog(conflict.razonSocial)
      )
      throw new EmpresaContratanteError(
        'Ya existe una empresa con ese RFC en su catálogo.',
        EMPRESA_CONTRATANTE_ERROR_CODES.RFC_DUPLICATE,
        409,
        'rfc-duplicado',
        'Ya existe una empresa con ese RFC en su catálogo'
      )
    }
  }
}
