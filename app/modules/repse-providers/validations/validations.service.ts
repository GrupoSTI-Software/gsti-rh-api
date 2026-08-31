import { cuid } from '@adonisjs/core/helpers'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import ProveedorRepseValidacion, {
  type ProveedorRepseValidacionEstatus,
} from '#models/proveedor_repse_validacion'
import UploadService, { type S3ObjectStream } from '#services/upload_service'
import { REPSE_PROVIDER_ERROR_CODES } from '#constants/repse_provider_error_codes'
import { RepseProviderError } from '#exceptions/repse_provider_error'
import { findProveedorRepseInTenantOrFail } from '../tenant_scope.js'
import {
  parseBusinessCalendarDate,
  toBusinessCalendarDate,
  todayInBusinessZone,
} from '../repse_provider_dates.js'
import ValidationsRepositoryMysql from './validations.repository.mysql.js'
import type { ValidationsRepository } from './validations.repository.js'
import type { ProveedorRepseValidacionDto } from './dto/validations.dto.js'

/** Mismo límite que la evidencia de contratos especializados. */
export const MAX_EVIDENCE_FILE_BYTES = 10 * 1024 * 1024

const ALLOWED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg']
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
]
const S3_FOLDER = 'repse-providers/validaciones'

export interface CreateValidacionInput {
  proveedorRepseId: number
  estatus: ProveedorRepseValidacionEstatus
  fecha: string
  autorUserId: number
  file: any
}

export default class ValidationsService {
  private readonly repository: ValidationsRepository

  constructor(repository: ValidationsRepository = new ValidationsRepositoryMysql()) {
    this.repository = repository
  }

  async create(input: CreateValidacionInput): Promise<ProveedorRepseValidacionDto> {
    const proveedor = await findProveedorRepseInTenantOrFail(input.proveedorRepseId)
    this.assertFileValid(input.file)

    const fecha = this.parseFecha(input.fecha)
    this.assertFechaNotFuture(fecha)

    const lastValidation = await this.repository.findLastByProveedor(proveedor.proveedorRepseId)
    this.assertFechaChronological(fecha, lastValidation)

    const storageKey = await this.uploadEvidenceToS3(input.file, proveedor.proveedorRepseId)
    const nombreArchivo = String(input.file.clientName ?? 'evidencia')
    const mimeType = `${input.file.type ?? 'application'}/${input.file.subtype ?? 'octet-stream'}`
    const tamanoBytes = Number(input.file.size ?? 0)

    const row = await db.transaction(async (trx) => {
      const created = await this.repository.create(
        {
          proveedorRepseId: proveedor.proveedorRepseId,
          businessUnitId: proveedor.businessUnitId,
          estatus: input.estatus,
          fecha,
          autorUserId: input.autorUserId,
          evidenciaNombreArchivo: nombreArchivo,
          evidenciaStorageKey: storageKey,
          evidenciaMimeType: mimeType,
          evidenciaTamanoBytes: tamanoBytes,
        },
        trx
      )

      const nextReviewAt = fecha.plus({ months: proveedor.periodicidadMeses })
      proveedor.nextReviewAt = nextReviewAt
      proveedor.useTransaction(trx)
      await proveedor.save()

      return created
    })

    return this.serialize(row)
  }

  async listByProveedor(proveedorRepseId: number): Promise<ProveedorRepseValidacionDto[]> {
    await findProveedorRepseInTenantOrFail(proveedorRepseId)
    const rows = await this.repository.listByProveedor(proveedorRepseId)
    return rows.map((row) => this.serialize(row))
  }

  /**
   * Stream de la evidencia (captura del padrón REPSE) de una validación puntual.
   *
   * La HU exige poder "demostrar diligencia ante una auditoría" con la evidencia
   * de cada revisión — guardarla sin poder recuperarla después no cumple ese
   * propósito, por eso este endpoint es de solo lectura (permiso `read`), igual
   * que `documentos_contrato_especializado_controller.ts#downloadVigente`.
   */
  async getEvidenceStream(
    proveedorRepseId: number,
    proveedorRepseValidacionId: number
  ): Promise<{ validacion: ProveedorRepseValidacion; object: S3ObjectStream }> {
    await findProveedorRepseInTenantOrFail(proveedorRepseId)

    const validacion = await this.repository.findByIdForProveedor(
      proveedorRepseId,
      proveedorRepseValidacionId
    )
    if (!validacion) {
      throw new RepseProviderError(
        'La validación indicada no existe o no pertenece a este proveedor REPSE.',
        REPSE_PROVIDER_ERROR_CODES.VALIDATION_NOT_FOUND,
        404,
        'validacion-no-encontrada'
      )
    }

    const uploadService = new UploadService()
    const object = await uploadService.getObjectStream(validacion.evidenciaStorageKey)
    if (!object) {
      throw new RepseProviderError(
        'El archivo de evidencia está registrado pero ya no está disponible en el almacenamiento.',
        REPSE_PROVIDER_ERROR_CODES.VAL_EVIDENCE,
        404,
        'evidencia-no-disponible'
      )
    }

    return { validacion, object }
  }

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------

  /** Parsea `fecha` como fecha de calendario en la zona de negocio (ver `repse_provider_dates.ts`). */
  private parseFecha(value: string): DateTime {
    const parsed = parseBusinessCalendarDate(value)
    if (!parsed.isValid) {
      throw new RepseProviderError(
        'La fecha de la validación es inválida.',
        REPSE_PROVIDER_ERROR_CODES.DATE_INVALID,
        422,
        'fecha-invalida'
      )
    }
    return parsed
  }

  /**
   * No se puede documentar evidencia de una revisión que "todavía no pasa":
   * la bitácora es un registro de auditoría de hechos ya ocurridos.
   */
  private assertFechaNotFuture(fecha: DateTime) {
    if (fecha > todayInBusinessZone()) {
      throw new RepseProviderError(
        'La fecha de la validación no puede ser posterior a hoy.',
        REPSE_PROVIDER_ERROR_CODES.DATE_INVALID,
        422,
        'fecha-futura'
      )
    }
  }

  /**
   * Evita que una validación "vieja" insertada después de una más reciente
   * retroceda `nextReviewAt` de forma incoherente (la bitácora es append-only
   * y `nextReviewAt` siempre se deriva de la última `fecha` registrada).
   */
  private assertFechaChronological(fecha: DateTime, last: ProveedorRepseValidacion | null) {
    if (last && fecha < toBusinessCalendarDate(last.fecha)) {
      throw new RepseProviderError(
        'La fecha de la validación no puede ser anterior a la última validación registrada.',
        REPSE_PROVIDER_ERROR_CODES.DATE_INVALID,
        422,
        'fecha-anterior-a-ultima-validacion'
      )
    }
  }

  private assertFileValid(file: any) {
    if (!file) {
      throw new RepseProviderError(
        'No se recibió ningún archivo de evidencia.',
        REPSE_PROVIDER_ERROR_CODES.VAL_EVIDENCE,
        422,
        'evidencia-faltante'
      )
    }

    const ext = (file.extname ?? '').toLowerCase()
    const mime = `${file.type ?? ''}/${file.subtype ?? ''}`.toLowerCase()

    if (!ALLOWED_EXTENSIONS.includes(ext) || !ALLOWED_MIME_TYPES.includes(mime)) {
      throw new RepseProviderError(
        'Tipo de archivo no permitido para la evidencia. Solo se acepta PDF, PNG o JPG.',
        REPSE_PROVIDER_ERROR_CODES.VAL_EVIDENCE,
        422,
        'evidencia-tipo-invalido'
      )
    }

    if (Number(file.size ?? 0) > MAX_EVIDENCE_FILE_BYTES) {
      throw new RepseProviderError(
        'El archivo de evidencia excede el tamaño máximo de 10 MB.',
        REPSE_PROVIDER_ERROR_CODES.VAL_EVIDENCE,
        422,
        'evidencia-tamano-excedido'
      )
    }
  }

  private async uploadEvidenceToS3(file: any, proveedorRepseId: number): Promise<string> {
    const sanitizedName = String(file.clientName ?? 'evidencia')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.{2,}/g, '.')
      .slice(0, 100)

    const fileName = `${S3_FOLDER}/${proveedorRepseId}/${cuid()}-${sanitizedName}`
    const uploadService = new UploadService()
    const result = await uploadService.fileUpload(file, 'evidence-document', '', { fileName: fileName })

    if (!result || result === 'file_not_found' || result === 'S3Producer.fileUpload') {
      throw new RepseProviderError(
        'No se pudo almacenar el archivo de evidencia.',
        REPSE_PROVIDER_ERROR_CODES.VAL_EVIDENCE,
        422,
        'evidencia-invalida'
      )
    }
    return result
  }

  private serialize(row: ProveedorRepseValidacion): ProveedorRepseValidacionDto {
    const person = row.autor?.person
    const autorNombre = person
      ? [person.personFirstname, person.personLastname, person.personSecondLastname]
          .filter(Boolean)
          .join(' ')
          .trim()
      : ''

    return {
      proveedorRepseValidacionId: row.proveedorRepseValidacionId,
      proveedorRepseId: row.proveedorRepseId,
      businessUnitId: row.businessUnitId,
      estatus: row.estatus,
      fecha: row.fecha.toISODate()!,
      autorUserId: row.autorUserId,
      autor: row.autor
        ? {
            userId: row.autorUserId,
            nombreCompleto: autorNombre || row.autor.userEmail || 'Usuario',
          }
        : null,
      evidenciaNombreArchivo: row.evidenciaNombreArchivo,
      evidenciaMimeType: row.evidenciaMimeType,
      evidenciaTamanoBytes: row.evidenciaTamanoBytes,
      proveedorRepseValidacionCreatedAt: row.createdAt ? row.createdAt.toISO() : null,
    }
  }
}
