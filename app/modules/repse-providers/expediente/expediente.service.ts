import { cuid } from '@adonisjs/core/helpers'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import type RepseExpedienteDocumento from '#models/repse_expediente_documento'
import UploadService, { type S3ObjectStream } from '#services/upload_service'
import { REPSE_EXPEDIENTE_ERROR_CODES } from '#constants/repse_expediente_error_codes'
import { RepseExpedienteError } from '#exceptions/repse_expediente_error'
import { findProveedorRepseInTenantOrFail } from '../tenant_scope.js'
import {
  EXPEDIENTE_ELEVATED_ROLE_SLUGS,
  EXPEDIENTE_S3_FOLDER,
  type RepseExpedienteAccion,
  type RepseExpedienteDocumentoTipo,
} from './expediente.constants.js'
import { assertExpedienteFileValid } from './expediente_file_validation.js'
import {
  computeConservarHasta,
  isRetentionActive,
  parseOptionalFechaDocumento,
} from './expediente_retention.js'
import ExpedienteRepositoryMysql from './expediente.repository.mysql.js'
import type { ExpedienteRepository } from './expediente.repository.js'
import type {
  RepseExpedienteDocumentoDto,
  RepseExpedienteListDto,
} from './dto/expediente.dto.js'

export interface CreateExpedienteDocumentoInput {
  proveedorRepseId: number
  tipo: RepseExpedienteDocumentoTipo
  anio: number
  mes?: number
  cuatrimestre?: number
  fechaDocumento?: unknown
  subidoPorUserId: number
  file: any
}

export interface ListExpedienteDocumentosInput {
  proveedorRepseId: number
  tipo?: RepseExpedienteDocumentoTipo
  anio?: number
  mes?: number
  cuatrimestre?: number
  page: number
  limit: number
  userId: number
}

export interface DestroyExpedienteDocumentoInput {
  proveedorRepseId: number
  repseExpedienteDocumentoId: number
  userId: number
  roleSlug?: string
}

export default class ExpedienteService {
  private readonly repository: ExpedienteRepository

  constructor(repository: ExpedienteRepository = new ExpedienteRepositoryMysql()) {
    this.repository = repository
  }

  async create(input: CreateExpedienteDocumentoInput): Promise<RepseExpedienteDocumentoDto> {
    const proveedor = await findProveedorRepseInTenantOrFail(input.proveedorRepseId)
    assertExpedienteFileValid(input.file)

    const fechaDocumento = parseOptionalFechaDocumento(input.fechaDocumento)
    if (input.fechaDocumento !== undefined && input.fechaDocumento !== null && input.fechaDocumento !== '' && !fechaDocumento) {
      throw new RepseExpedienteError(
        'La fecha del documento es inválida.',
        REPSE_EXPEDIENTE_ERROR_CODES.VAL_INPUT,
        422,
        'entrada-invalida'
      )
    }

    const conservarHasta = computeConservarHasta(fechaDocumento)
    const storageKey = await this.uploadToS3(input.file, proveedor.proveedorRepseId)
    const nombreArchivo = String(input.file.clientName ?? 'documento.pdf')
    const mimeType = `${input.file.type ?? 'application'}/${input.file.subtype ?? 'pdf'}`
    const tamanoBytes = Number(input.file.size ?? 0)

    const row = await this.repository.create({
      proveedorRepseId: proveedor.proveedorRepseId,
      businessUnitId: proveedor.businessUnitId,
      tipo: input.tipo,
      anio: input.anio,
      mes: input.mes ?? null,
      cuatrimestre: input.cuatrimestre ?? null,
      fechaDocumento,
      conservarHasta,
      nombreArchivo,
      storageKey,
      mimeType,
      tamanoBytes,
      subidoPorUserId: input.subidoPorUserId,
    })

    return this.serialize(row)
  }

  async listByProveedor(input: ListExpedienteDocumentosInput): Promise<RepseExpedienteListDto> {
    const proveedor = await findProveedorRepseInTenantOrFail(input.proveedorRepseId)
    const safePage = Math.max(input.page, 1)
    const safeLimit = Math.min(Math.max(input.limit, 1), 100)

    const result = await this.repository.listByProveedor({
      proveedorRepseId: proveedor.proveedorRepseId,
      tipo: input.tipo,
      anio: input.anio,
      mes: input.mes,
      cuatrimestre: input.cuatrimestre,
      page: safePage,
      limit: safeLimit,
    })

    const firstRow = result.rows[0]
    if (firstRow) {
      await this.logAccessSafe({
        repseExpedienteDocumentoId: firstRow.repseExpedienteDocumentoId,
        businessUnitId: proveedor.businessUnitId,
        accion: 'consulta',
        userId: input.userId,
      })
    }

    return {
      meta: {
        total: result.total,
        perPage: result.limit,
        currentPage: result.page,
        lastPage: result.lastPage,
        page: result.page,
        firstPage: 1,
      },
      data: result.rows.map((row) => this.serialize(row)),
    }
  }

  async getDownloadStream(
    proveedorRepseId: number,
    repseExpedienteDocumentoId: number,
    userId: number
  ): Promise<{ documento: RepseExpedienteDocumento; object: S3ObjectStream }> {
    const proveedor = await findProveedorRepseInTenantOrFail(proveedorRepseId)

    const documento = await this.repository.findByIdForProveedor(
      proveedor.proveedorRepseId,
      repseExpedienteDocumentoId
    )
    if (!documento) {
      throw new RepseExpedienteError(
        'El documento del expediente no existe o no pertenece a este proveedor REPSE.',
        REPSE_EXPEDIENTE_ERROR_CODES.NOT_FOUND,
        404,
        'documento-no-encontrado'
      )
    }

    const uploadService = new UploadService()
    const object = await uploadService.getObjectStream(documento.storageKey)
    if (!object) {
      throw new RepseExpedienteError(
        'El documento está registrado pero ya no está disponible en el almacenamiento.',
        REPSE_EXPEDIENTE_ERROR_CODES.VAL_DOCUMENTO,
        404,
        'documento-no-encontrado'
      )
    }

    await this.logAccessSafe({
      repseExpedienteDocumentoId: documento.repseExpedienteDocumentoId,
      businessUnitId: documento.businessUnitId,
      accion: 'descarga',
      userId,
    })

    return { documento, object }
  }

  async destroy(input: DestroyExpedienteDocumentoInput): Promise<void> {
    const proveedor = await findProveedorRepseInTenantOrFail(input.proveedorRepseId)

    const documento = await this.repository.findByIdForProveedor(
      proveedor.proveedorRepseId,
      input.repseExpedienteDocumentoId
    )
    if (!documento) {
      throw new RepseExpedienteError(
        'El documento del expediente no existe o no pertenece a este proveedor REPSE.',
        REPSE_EXPEDIENTE_ERROR_CODES.NOT_FOUND,
        404,
        'documento-no-encontrado'
      )
    }

    if (
      isRetentionActive(documento.conservarHasta) &&
      !this.isElevatedRole(input.roleSlug)
    ) {
      throw new RepseExpedienteError(
        'No se puede eliminar el documento mientras esté vigente su periodo de retención normativa.',
        REPSE_EXPEDIENTE_ERROR_CODES.FORBIDDEN_RETENTION,
        403,
        'retencion-vigente'
      )
    }

    await db.transaction(async (trx) => {
      await this.repository.softDelete(documento, trx)
      await this.logAccessSafe(
        {
          repseExpedienteDocumentoId: documento.repseExpedienteDocumentoId,
          businessUnitId: documento.businessUnitId,
          accion: 'eliminacion',
          userId: input.userId,
        },
        trx
      )
    })
  }

  private isElevatedRole(roleSlug: string | undefined): boolean {
    return EXPEDIENTE_ELEVATED_ROLE_SLUGS.includes(
      roleSlug as (typeof EXPEDIENTE_ELEVATED_ROLE_SLUGS)[number]
    )
  }

  private async uploadToS3(file: any, proveedorRepseId: number): Promise<string> {
    const sanitizedName = String(file.clientName ?? 'documento.pdf')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.{2,}/g, '.')
      .slice(0, 100)

    const fileName = `${EXPEDIENTE_S3_FOLDER}/${proveedorRepseId}/${cuid()}-${sanitizedName}`
    const uploadService = new UploadService()
    const result = await uploadService.fileUpload(file, 'pdf-document', '', { fileName: fileName })

    if (!result || result === 'file_not_found' || result === 'S3Producer.fileUpload') {
      throw new RepseExpedienteError(
        'No se pudo almacenar el documento del expediente.',
        REPSE_EXPEDIENTE_ERROR_CODES.S3_UPLOAD_FAILED,
        422,
        'documento-invalido'
      )
    }
    return result
  }

  /** Registra acceso en bitácora. Fail-open: un fallo de log no bloquea la operación. */
  private async logAccessSafe(
    input: {
      repseExpedienteDocumentoId: number
      businessUnitId: number
      accion: RepseExpedienteAccion
      userId: number
    },
    trx?: import('@adonisjs/lucid/types/database').TransactionClientContract
  ) {
    try {
      await this.repository.logAccess(
        {
          repseExpedienteDocumentoId: input.repseExpedienteDocumentoId,
          businessUnitId: input.businessUnitId,
          accion: input.accion,
          userId: input.userId,
        },
        trx
      )
    } catch (error) {
      logger.warn(
        {
          err: error,
          repseExpedienteDocumentoId: input.repseExpedienteDocumentoId,
          accion: input.accion,
        },
        'repse_expediente: fallo al registrar acceso (fail-open)'
      )
    }
  }

  private serialize(row: RepseExpedienteDocumento): RepseExpedienteDocumentoDto {
    return {
      repseExpedienteDocumentoId: row.repseExpedienteDocumentoId,
      proveedorRepseId: row.proveedorRepseId,
      businessUnitId: row.businessUnitId,
      tipo: row.tipo,
      anio: row.anio,
      mes: row.mes,
      cuatrimestre: row.cuatrimestre,
      fechaDocumento: row.fechaDocumento ? row.fechaDocumento.toISODate() : null,
      conservarHasta: row.conservarHasta.toISODate()!,
      nombreArchivo: row.nombreArchivo,
      mimeType: row.mimeType,
      tamanoBytes: row.tamanoBytes,
      subidoPorUserId: row.subidoPorUserId,
      repseExpedienteDocumentoCreatedAt: row.createdAt ? row.createdAt.toISO() : null,
    }
  }
}
