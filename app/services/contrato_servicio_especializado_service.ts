import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import Clausula15d, { type CompromisoDocumental } from '#models/clausula_15d'
import ContratoServicioEspecializado, {
  type ContratoServicioEspecializadoEstatus,
} from '#models/contrato_servicio_especializado'
import EmpresaContratante from '#models/empresa_contratante'
import { CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES } from '../constants/contrato_servicio_especializado_error_codes.js'
import { ContratoServicioEspecializadoError } from '../exceptions/contrato_servicio_especializado_error.js'
import {
  findActiveRepseFolioForTenant,
  findContratoInTenantOrFail,
  findEmpresaContratanteInTenantOrFail,
  getAllowedBusinessUnitIds,
} from '../helpers/repse_tenant_scope.js'
import { toBusinessDateString } from '#utils/business_date'

export interface Anexo15dCreatePayload {
  objetoDetallado: string
  numeroTrabajadoresAprox: number
  fechaInicioServicio: Date
  fechaFinServicio?: Date | null
  compromisosDocumentales: CompromisoDocumental[]
  responsabilidadSolidariaAceptada?: boolean
  textoResponsabilidadSolidaria: string
}

export type Anexo15dUpdatePayload = Partial<Anexo15dCreatePayload>

export interface ContratoServicioEspecializadoCreatePayload {
  empresaContratanteId: number
  numeroContrato: string
  fechaInicio: Date
  fechaFin?: Date | null
  objetoServicio: string
  montoTotal?: number | null
  moneda?: string
  estatus?: ContratoServicioEspecializadoEstatus
  anexo15d: Anexo15dCreatePayload
}

export type ContratoServicioEspecializadoUpdatePayload = Partial<
  Omit<ContratoServicioEspecializadoCreatePayload, 'empresaContratanteId' | 'anexo15d'>
> & {
  anexo15d?: Anexo15dUpdatePayload
}

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

function toIsoDateString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }
  if (DateTime.isDateTime(value)) {
    return (value as DateTime).toISODate()
  }
  if (value instanceof Date) {
    return DateTime.fromJSDate(value).toISODate()
  }
  return null
}

function assertDateRangeOrFail(
  start: Date | DateTime,
  end: Date | DateTime | null | undefined,
  fieldLabel: string
) {
  if (end === null || end === undefined) {
    return
  }
  const startDt = DateTime.isDateTime(start)
    ? start
    : DateTime.fromJSDate(start instanceof Date ? start : new Date(start))
  const endDt = DateTime.isDateTime(end)
    ? end
    : DateTime.fromJSDate(end instanceof Date ? end : new Date(end))
  if (endDt < startDt) {
    throw new ContratoServicioEspecializadoError(
      `${fieldLabel}: la fecha fin no puede ser anterior a la fecha inicio.`,
      CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.VAL_FECHAS,
      422,
      'fecha-fin-anterior-a-fecha-inicio',
      'La fecha fin no puede ser anterior a la fecha inicio.'
    )
  }
}

function serializeAnexo15d(row: Clausula15d) {
  return {
    folioRepse: row.folioRepse,
    objetoDetallado: row.objetoDetallado,
    numeroTrabajadoresAprox: row.numeroTrabajadoresAprox,
    fechaInicioServicio: toIsoDateString(row.fechaInicioServicio),
    fechaFinServicio: toIsoDateString(row.fechaFinServicio),
    compromisosDocumentales: row.compromisosDocumentales,
    responsabilidadSolidariaAceptada: row.responsabilidadSolidariaAceptada,
    textoResponsabilidadSolidaria: row.textoResponsabilidadSolidaria,
  }
}

function serializeContratanteBasico(row: EmpresaContratante) {
  return {
    id: row.empresaContratanteId,
    razonSocial: row.razonSocial,
    rfc: row.rfc,
  }
}

/** DTO público sin identificadores de scope interno. */
export function serializeContratoServicioEspecializado(row: ContratoServicioEspecializado) {
  const contratante = row.empresaContratante
  const anexo = row.clausula15d

  return {
    id: row.contratoServicioEspecializadoId,
    numeroContrato: row.numeroContrato,
    empresaContratante: contratante ? serializeContratanteBasico(contratante) : null,
    fechaInicio: toIsoDateString(row.fechaInicio),
    fechaFin: toIsoDateString(row.fechaFin),
    objetoServicio: row.objetoServicio,
    montoTotal: row.montoTotal !== null ? Number(row.montoTotal) : null,
    moneda: row.moneda,
    estatus: row.estatusEfectivo,
    vencidoPorFecha: row.vencidoPorFecha,
    anexo15d: anexo ? serializeAnexo15d(anexo) : null,
    createdAt: toIsoDateTimeString(row.createdAt),
    updatedAt: toIsoDateTimeString(row.updatedAt),
  }
}

/**
 * Servicio de dominio de contratos de servicios especializados REPSE (anexo 15-D LFT).
 */
export default class ContratoServicioEspecializadoService {
  async create(payload: ContratoServicioEspecializadoCreatePayload) {
    const contratante = await findEmpresaContratanteInTenantOrFail(payload.empresaContratanteId)
    const folioRepse = await findActiveRepseFolioForTenant()

    assertDateRangeOrFail(payload.fechaInicio, payload.fechaFin, 'Contrato')
    assertDateRangeOrFail(
      payload.anexo15d.fechaInicioServicio,
      payload.anexo15d.fechaFinServicio,
      'Anexo 15-D'
    )

    const normalizedNumero = payload.numeroContrato.trim()
    await this.assertNumeroContratoUniqueInTenant(normalizedNumero)

    const row = await db.transaction(async (trx) => {
      const contrato = new ContratoServicioEspecializado()
      contrato.businessUnitId = contratante.businessUnitId
      contrato.empresaContratanteId = contratante.empresaContratanteId
      contrato.numeroContrato = normalizedNumero
      contrato.fechaInicio = DateTime.fromJSDate(payload.fechaInicio)
      contrato.fechaFin =
        payload.fechaFin !== undefined && payload.fechaFin !== null
          ? DateTime.fromJSDate(payload.fechaFin)
          : null
      contrato.objetoServicio = payload.objetoServicio.trim()
      contrato.montoTotal = payload.montoTotal ?? null
      contrato.moneda = (payload.moneda ?? 'MXN').trim().toUpperCase()
      contrato.estatus = payload.estatus ?? 'borrador'
      contrato.useTransaction(trx)
      await contrato.save()

      const anexo = new Clausula15d()
      anexo.contratoServicioEspecializadoId = contrato.contratoServicioEspecializadoId
      anexo.folioRepse = folioRepse
      anexo.objetoDetallado = payload.anexo15d.objetoDetallado.trim()
      anexo.numeroTrabajadoresAprox = payload.anexo15d.numeroTrabajadoresAprox
      anexo.fechaInicioServicio = DateTime.fromJSDate(payload.anexo15d.fechaInicioServicio)
      anexo.fechaFinServicio =
        payload.anexo15d.fechaFinServicio !== undefined &&
        payload.anexo15d.fechaFinServicio !== null
          ? DateTime.fromJSDate(payload.anexo15d.fechaFinServicio)
          : null
      anexo.compromisosDocumentales = payload.anexo15d.compromisosDocumentales
      anexo.responsabilidadSolidariaAceptada =
        payload.anexo15d.responsabilidadSolidariaAceptada ?? true
      anexo.textoResponsabilidadSolidaria =
        payload.anexo15d.textoResponsabilidadSolidaria.trim()
      anexo.useTransaction(trx)
      await anexo.save()

      return contrato
    })

    logger.info(
      { contratoId: row.contratoServicioEspecializadoId, numeroContrato: row.numeroContrato },
      'Contrato de servicios especializados creado'
    )

    await this.loadRelations(row)
    const forResponse = await this.findForSerialization(row.contratoServicioEspecializadoId)
    return serializeContratoServicioEspecializado(forResponse)
  }

  async listPaginated(
    page: number,
    perPage: number,
    filters: {
      estatus?: ContratoServicioEspecializadoEstatus[]
      empresaContratanteId?: number
      fechaInicioDesde?: Date
      fechaInicioHasta?: Date
      q?: string
    }
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

    if (filters.empresaContratanteId !== undefined) {
      await findEmpresaContratanteInTenantOrFail(filters.empresaContratanteId)
    }

    let query = ContratoServicioEspecializado.withDocumentoVigenteFechaVencimiento(
      ContratoServicioEspecializado.query()
    )
      .whereNull('contrato_servicio_especializado_deleted_at')
      .whereIn('business_unit_id', allowed)
      .preload('clausula15d')
      .preload('empresaContratante')

    const hoyIso = toBusinessDateString()
    if (filters.estatus && filters.estatus.length > 0) {
      query = ContratoServicioEspecializado.applyEffectiveEstatusFilter(
        query,
        filters.estatus,
        hoyIso
      )
    }

    if (filters.empresaContratanteId !== undefined) {
      query = query.where('empresa_contratante_id', filters.empresaContratanteId)
    }

    if (filters.fechaInicioDesde) {
      query = query.where(
        'contrato_servicio_especializado_fecha_inicio',
        '>=',
        DateTime.fromJSDate(filters.fechaInicioDesde).toISODate()!
      )
    }

    if (filters.fechaInicioHasta) {
      query = query.where(
        'contrato_servicio_especializado_fecha_inicio',
        '<=',
        DateTime.fromJSDate(filters.fechaInicioHasta).toISODate()!
      )
    }

    const search = filters.q?.trim()
    if (search && search.length > 0) {
      const term = `%${search}%`
      query = query.where((builder) => {
        builder
          .whereILike('contrato_servicio_especializado_numero_contrato', term)
          .orWhereHas('empresaContratante', (contratanteQuery) => {
            contratanteQuery
              .whereILike('empresa_contratante_razon_social', term)
              .orWhereILike('empresa_contratante_rfc', term)
          })
      })
    }

    const paginator = await query
      .orderBy('contrato_servicio_especializado_created_at', 'desc')
      .paginate(safePage, safePerPage)

    const serialized = paginator.serialize()
    const currentPage = serialized.meta.currentPage

    return {
      meta: {
        ...serialized.meta,
        page: currentPage,
      },
      data: paginator.all().map((row) => serializeContratoServicioEspecializado(row)),
    }
  }

  async findById(contratoServicioEspecializadoId: number) {
    const row = await this.findForSerialization(contratoServicioEspecializadoId)
    return serializeContratoServicioEspecializado(row)
  }

  async update(
    contratoServicioEspecializadoId: number,
    payload: ContratoServicioEspecializadoUpdatePayload
  ) {
    const current = await findContratoInTenantOrFail(contratoServicioEspecializadoId)
    await current.load('clausula15d')

    const targetFechaInicio =
      payload.fechaInicio !== undefined
        ? payload.fechaInicio
        : current.fechaInicio.toJSDate()
    const targetFechaFin =
      payload.fechaFin !== undefined
        ? payload.fechaFin
        : current.fechaFin
          ? current.fechaFin.toJSDate()
          : null

    assertDateRangeOrFail(targetFechaInicio, targetFechaFin, 'Contrato')

    if (payload.anexo15d) {
      const anexoCurrent = current.clausula15d
      const targetInicioServicio =
        payload.anexo15d.fechaInicioServicio ??
        anexoCurrent?.fechaInicioServicio.toJSDate() ??
        new Date()
      const targetFinServicio =
        payload.anexo15d.fechaFinServicio !== undefined
          ? payload.anexo15d.fechaFinServicio
          : anexoCurrent?.fechaFinServicio
            ? anexoCurrent.fechaFinServicio.toJSDate()
            : null
      assertDateRangeOrFail(targetInicioServicio, targetFinServicio, 'Anexo 15-D')
    }

    const targetNumero =
      payload.numeroContrato !== undefined
        ? payload.numeroContrato.trim()
        : current.numeroContrato

    if (targetNumero !== current.numeroContrato) {
      await this.assertNumeroContratoUniqueInTenant(
        targetNumero,
        current.contratoServicioEspecializadoId
      )
    }

    const folioRepse = await findActiveRepseFolioForTenant()

    await db.transaction(async (trx) => {
      if (payload.numeroContrato !== undefined) {
        current.numeroContrato = targetNumero
      }
      if (payload.fechaInicio !== undefined) {
        current.fechaInicio = DateTime.fromJSDate(payload.fechaInicio)
      }
      if (payload.fechaFin !== undefined) {
        current.fechaFin =
          payload.fechaFin !== null ? DateTime.fromJSDate(payload.fechaFin) : null
      }
      if (payload.objetoServicio !== undefined) {
        current.objetoServicio = payload.objetoServicio.trim()
      }
      if (payload.montoTotal !== undefined) {
        current.montoTotal = payload.montoTotal
      }
      if (payload.moneda !== undefined) {
        current.moneda = payload.moneda.trim().toUpperCase()
      }
      if (payload.estatus !== undefined) {
        current.estatus = payload.estatus
      }
      current.useTransaction(trx)
      await current.save()

      if (payload.anexo15d && current.clausula15d) {
        const anexo = current.clausula15d
        anexo.folioRepse = folioRepse
        if (payload.anexo15d.objetoDetallado !== undefined) {
          anexo.objetoDetallado = payload.anexo15d.objetoDetallado.trim()
        }
        if (payload.anexo15d.numeroTrabajadoresAprox !== undefined) {
          anexo.numeroTrabajadoresAprox = payload.anexo15d.numeroTrabajadoresAprox
        }
        if (payload.anexo15d.fechaInicioServicio !== undefined) {
          anexo.fechaInicioServicio = DateTime.fromJSDate(payload.anexo15d.fechaInicioServicio)
        }
        if (payload.anexo15d.fechaFinServicio !== undefined) {
          anexo.fechaFinServicio =
            payload.anexo15d.fechaFinServicio !== null
              ? DateTime.fromJSDate(payload.anexo15d.fechaFinServicio)
              : null
        }
        if (payload.anexo15d.compromisosDocumentales !== undefined) {
          anexo.compromisosDocumentales = payload.anexo15d.compromisosDocumentales
        }
        if (payload.anexo15d.responsabilidadSolidariaAceptada !== undefined) {
          anexo.responsabilidadSolidariaAceptada =
            payload.anexo15d.responsabilidadSolidariaAceptada
        }
        if (payload.anexo15d.textoResponsabilidadSolidaria !== undefined) {
          anexo.textoResponsabilidadSolidaria =
            payload.anexo15d.textoResponsabilidadSolidaria.trim()
        }
        anexo.useTransaction(trx)
        await anexo.save()
      } else if (current.clausula15d) {
        current.clausula15d.folioRepse = folioRepse
        current.clausula15d.useTransaction(trx)
        await current.clausula15d.save()
      }
    })

    logger.info(
      {
        contratoId: current.contratoServicioEspecializadoId,
        numeroContrato: current.numeroContrato,
      },
      'Contrato de servicios especializados actualizado'
    )

    await this.loadRelations(current)
    const forResponse = await this.findForSerialization(current.contratoServicioEspecializadoId)
    return serializeContratoServicioEspecializado(forResponse)
  }

  async destroy(contratoServicioEspecializadoId: number) {
    const row = await findContratoInTenantOrFail(contratoServicioEspecializadoId)
    await row.delete()
    logger.info(
      { contratoId: row.contratoServicioEspecializadoId, numeroContrato: row.numeroContrato },
      'Contrato de servicios especializados eliminado lógicamente'
    )
  }

  private async findForSerialization(contratoServicioEspecializadoId: number) {
    const row = await findContratoInTenantOrFail(contratoServicioEspecializadoId, {
      withDocumentoVigenteFecha: true,
    })
    await this.loadRelations(row)
    return row
  }

  private async loadRelations(row: ContratoServicioEspecializado) {
    await row.load('clausula15d')
    await row.load('empresaContratante')
  }

  private async assertNumeroContratoUniqueInTenant(numeroContrato: string, excludeId?: number) {
    const allowed = await getAllowedBusinessUnitIds()
    if (allowed.length === 0) {
      return
    }

    let query = ContratoServicioEspecializado.query()
      .whereNull('contrato_servicio_especializado_deleted_at')
      .whereIn('business_unit_id', allowed)
      .where('contrato_servicio_especializado_numero_contrato', numeroContrato)

    if (excludeId !== undefined) {
      query = query.whereNot('contrato_servicio_especializado_id', excludeId)
    }

    const conflict = await query.first()
    if (conflict) {
      throw new ContratoServicioEspecializadoError(
        'Ya existe un contrato con ese número en su tenant.',
        CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.NUMERO_DUPLICATE,
        409,
        'numero-contrato-duplicado',
        'Número de contrato duplicado'
      )
    }
  }
}
