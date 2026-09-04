import { cuid } from '@adonisjs/core/helpers'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import DocumentoContratoEspecializado from '#models/documento_contrato_especializado'
import UploadService, { type S3ObjectStream } from '#services/upload_service'
import { DOCUMENTO_CONTRATO_ESPECIALIZADO_ERROR_CODES } from '../constants/documento_contrato_especializado_error_codes.js'
import { DocumentoContratoEspecializadoError } from '../exceptions/documento_contrato_especializado_error.js'
import { findContratoInTenantOrFail } from '../helpers/repse_tenant_scope.js'

/** Límite de tamaño del PDF; ajustar solo aquí (mensajes de error se derivan de este valor). */
export const MAX_FILE_BYTES = 10 * 1024 * 1024

const ALLOWED_EXTENSIONS = ['pdf']
const ALLOWED_MIME_TYPES = ['application/pdf']
const S3_FOLDER = 'compliance-repse/contrato-documentos'

function formatMaxFileSizeLabel(maxBytes: number = MAX_FILE_BYTES): string {
  const mb = maxBytes / (1024 * 1024)
  if (mb >= 1 && Number.isInteger(mb)) {
    return `${mb} MB`
  }
  if (mb >= 1) {
    return `${Number.parseFloat(mb.toFixed(1))} MB`
  }
  const kb = Math.round(maxBytes / 1024)
  return `${kb} KB`
}

export type DocumentoContratoSerialized = {
  documentoId: number
  contratoId: number
  origen: string
  vigente: boolean
  fechaInicioVigencia: string
  fechaVencimiento: string
  nombreArchivo: string
  mimeType: string
  tamanoBytes: number
  subidoPor: number | null
  createdAt: string
  deletedAt: string | null
}

export type SubirDocumentoInput = {
  contratoId: number
  file: any
  fechaInicioVigencia: Date
  fechaVencimiento: Date
  subidoPor: number | null
}

export default class DocumentoContratoEspecializadoService {
  /**
   * Sube un PDF y lo marca como vigente; archiva el vigente anterior en transacción.
   */
  async subirDocumento(input: SubirDocumentoInput): Promise<DocumentoContratoSerialized> {
    const contrato = await findContratoInTenantOrFail(input.contratoId)
    this.assertFileValid(input.file)
    this.assertVigenciaCoherente(input.fechaInicioVigencia, input.fechaVencimiento)

    const storageKey = await this.uploadToS3(input.file, input.contratoId)
    const nombreArchivo = String(input.file.clientName ?? 'documento.pdf')
    const mimeType = `${input.file.type ?? 'application'}/${input.file.subtype ?? 'pdf'}`
    const tamanoBytes = Number(input.file.size ?? 0)

    const row = await db.transaction(async (trx) => {
      const vigenteActual = await DocumentoContratoEspecializado.query({ client: trx })
        .where('contrato_servicio_especializado_id', contrato.contratoServicioEspecializadoId)
        .where('documento_contrato_especializado_vigente', true)
        .whereNull('documento_contrato_especializado_deleted_at')
        .forUpdate()
        .first()

      if (vigenteActual) {
        vigenteActual.vigente = false
        vigenteActual.useTransaction(trx)
        await vigenteActual.save()
        await vigenteActual.delete()
      }

      const documento = new DocumentoContratoEspecializado()
      documento.contratoServicioEspecializadoId = contrato.contratoServicioEspecializadoId
      documento.businessUnitId = contrato.businessUnitId
      documento.origen = 'subido'
      documento.vigente = true
      documento.fechaInicioVigencia = DateTime.fromJSDate(input.fechaInicioVigencia)
      documento.fechaVencimiento = DateTime.fromJSDate(input.fechaVencimiento)
      documento.nombreArchivo = nombreArchivo
      documento.storageKey = storageKey
      documento.mimeType = mimeType
      documento.tamanoBytes = tamanoBytes
      documento.subidoPor = input.subidoPor
      documento.useTransaction(trx)
      await documento.save()

      return documento
    })

    logger.info(
      {
        contratoId: contrato.contratoServicioEspecializadoId,
        documentoId: row.documentoContratoEspecializadoId,
      },
      'Documento firmado de contrato REPSE registrado'
    )

    return this.serialize(row)
  }

  /**
   * Equivalente a subir uno nuevo que reemplaza el vigente.
   */
  async reemplazarVigente(input: SubirDocumentoInput): Promise<DocumentoContratoSerialized> {
    return this.subirDocumento(input)
  }

  /**
   * Lista vigente y archivados del contrato, orden cronológico descendente.
   */
  async listarPorContrato(contratoId: number): Promise<DocumentoContratoSerialized[]> {
    await findContratoInTenantOrFail(contratoId)

    const rows = await DocumentoContratoEspecializado.query()
      .withTrashed()
      .where('contrato_servicio_especializado_id', contratoId)
      .orderBy('documento_contrato_especializado_created_at', 'desc')
      .orderBy('documento_contrato_especializado_id', 'desc')

    return rows.map((row) => this.serialize(row))
  }

  /**
   * Resuelve el documento vigente activo para descarga por stream.
   */
  async resolverVigenteParaDescarga(contratoId: number): Promise<DocumentoContratoEspecializado> {
    await findContratoInTenantOrFail(contratoId)

    const row = await DocumentoContratoEspecializado.query()
      .where('contrato_servicio_especializado_id', contratoId)
      .where('documento_contrato_especializado_vigente', true)
      .whereNull('documento_contrato_especializado_deleted_at')
      .first()

    if (!row) {
      throw new DocumentoContratoEspecializadoError(
        'No hay documento vigente para este contrato.',
        DOCUMENTO_CONTRATO_ESPECIALIZADO_ERROR_CODES.NOT_FOUND,
        404,
        'documento-no-encontrado',
        'No hay documento vigente para este contrato.'
      )
    }

    return row
  }

  /**
   * Obtiene el stream S3 del documento vigente.
   */
  async obtenerStreamVigente(contratoId: number): Promise<{
    documento: DocumentoContratoEspecializado
    object: S3ObjectStream
  }> {
    const documento = await this.resolverVigenteParaDescarga(contratoId)
    const uploadService = new UploadService()
    const object = await uploadService.getObjectStream(documento.storageKey)

    if (!object) {
      logger.warn(
        { contratoId, documentoId: documento.documentoContratoEspecializadoId },
        'Documento registrado en BD pero no encontrado en almacenamiento'
      )
      throw new DocumentoContratoEspecializadoError(
        'El archivo del documento vigente no está disponible.',
        DOCUMENTO_CONTRATO_ESPECIALIZADO_ERROR_CODES.NOT_FOUND,
        404,
        'documento-no-encontrado',
        'El archivo del documento vigente no está disponible.'
      )
    }

    return { documento, object }
  }

  private serialize(row: DocumentoContratoEspecializado): DocumentoContratoSerialized {
    return {
      documentoId: row.documentoContratoEspecializadoId,
      contratoId: row.contratoServicioEspecializadoId,
      origen: row.origen,
      vigente: row.vigente,
      fechaInicioVigencia: row.fechaInicioVigencia.toISODate()!,
      fechaVencimiento: row.fechaVencimiento.toISODate()!,
      nombreArchivo: row.nombreArchivo,
      mimeType: row.mimeType,
      tamanoBytes: row.tamanoBytes,
      subidoPor: row.subidoPor,
      createdAt: row.createdAt.toISO()!,
      deletedAt: row.deletedAt ? row.deletedAt.toISO()! : null,
    }
  }

  private assertVigenciaCoherente(fechaInicio: Date, fechaVencimiento: Date) {
    const inicio = DateTime.fromJSDate(fechaInicio).startOf('day')
    const fin = DateTime.fromJSDate(fechaVencimiento).startOf('day')
    if (inicio > fin) {
      throw new DocumentoContratoEspecializadoError(
        'La fecha de inicio de vigencia no puede ser posterior a la fecha de vencimiento.',
        DOCUMENTO_CONTRATO_ESPECIALIZADO_ERROR_CODES.VAL_VIGENCIA,
        400,
        'vigencia-incoherente',
        'La fecha de inicio de vigencia debe ser anterior o igual a la fecha de vencimiento.'
      )
    }
  }

  private assertFileValid(file: any) {
    if (!file) {
      throw new DocumentoContratoEspecializadoError(
        'No se recibió ningún archivo.',
        DOCUMENTO_CONTRATO_ESPECIALIZADO_ERROR_CODES.VAL_DOCUMENTO,
        422,
        'documento-invalido',
        'Debe adjuntar un archivo PDF en el campo archivo.'
      )
    }

    const ext = (file.extname ?? '').toLowerCase()
    const mime = `${file.type ?? ''}/${file.subtype ?? ''}`.toLowerCase()

    if (!ALLOWED_EXTENSIONS.includes(ext) || !ALLOWED_MIME_TYPES.includes(mime)) {
      throw new DocumentoContratoEspecializadoError(
        'Tipo de archivo no permitido. Solo se acepta PDF.',
        DOCUMENTO_CONTRATO_ESPECIALIZADO_ERROR_CODES.VAL_DOCUMENTO,
        422,
        'documento-invalido',
        'El archivo debe ser PDF (application/pdf).'
      )
    }

    if (file.size > MAX_FILE_BYTES) {
      const maxLabel = formatMaxFileSizeLabel()
      const message = `El archivo excede el tamaño máximo de ${maxLabel}.`
      throw new DocumentoContratoEspecializadoError(
        message,
        DOCUMENTO_CONTRATO_ESPECIALIZADO_ERROR_CODES.VAL_DOCUMENTO,
        422,
        'documento-invalido',
        `El archivo no puede superar ${maxLabel}.`
      )
    }
  }

  private async uploadToS3(file: any, contratoId: number): Promise<string> {
    const sanitizedName = (file.clientName as string)
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.{2,}/g, '.')
      .slice(0, 100)

    const fileName = `${S3_FOLDER}/${contratoId}/${cuid()}-${sanitizedName}`
    const uploadService = new UploadService()
    const result = await uploadService.fileUpload(file, 'pdf-document', '', { fileName: fileName })

    if (!result || result === 'file_not_found' || result === 'S3Producer.fileUpload') {
      throw new DocumentoContratoEspecializadoError(
        'No se pudo almacenar el archivo del documento.',
        DOCUMENTO_CONTRATO_ESPECIALIZADO_ERROR_CODES.VAL_DOCUMENTO,
        422,
        'documento-invalido',
        'Error al subir el archivo al almacenamiento.'
      )
    }

    return result
  }
}
