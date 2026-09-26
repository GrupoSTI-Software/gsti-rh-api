import { cuid } from '@adonisjs/core/helpers'
import { DateTime } from 'luxon'
import UploadService from '#services/upload_service'
import TraumaticEventReportEvidence, {
  type TraumaticEventReportEvidenceCategory,
} from '#models/traumatic_event_report_evidence'
import TraumaticEventReportService from '#services/traumatic_event_report_service'
import { TERE_ERROR_CODES } from '../constants/traumatic_event_report_evidence_error_codes.js'
import { TraumaticEventReportEvidenceError } from '../exceptions/traumatic_event_report_evidence_error.js'
import { TRAUMATIC_EVENT_REPORT_EVIDENCE_CATEGORIES } from '../validators/traumatic_event_report_evidence.js'

/** Límite de tamaño por archivo: 10 MB. */
const MAX_FILE_BYTES = 10 * 1024 * 1024

/** PDF, JPG y PNG (ticket exige los 3 tipos). */
// El perfil `evidence-document` del intake es la fuente de verdad; esta lista
// es un pre-filtro barato y debe mantenerse alineada con el.
const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp'] as const
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
] as const

/** Carpeta lógica en S3 bajo `AWS_ROOT_PATH/`. */
const S3_FOLDER = 'traumatic-event-report-evidences'

/** Categoría default cuando el cliente no la envía. */
const DEFAULT_CATEGORY: TraumaticEventReportEvidenceCategory = 'other'

/** Vigencia (segundos) de la URL firmada: 5 min. */
const SIGNED_URL_EXPIRES_SECONDS = 5 * 60

export interface TraumaticEventReportEvidencePayload {
  category?: TraumaticEventReportEvidenceCategory
}

/** Representación segura de la evidencia — nunca incluye la Key de S3. */
export interface TraumaticEventReportEvidenceRow {
  traumaticEventReportEvidenceId: number
  traumaticEventReportId: number
  traumaticEventReportEvidenceCategory: TraumaticEventReportEvidenceCategory
  traumaticEventReportEvidenceOriginalName: string | null
  traumaticEventReportEvidenceCreatedAt: string | null
  traumaticEventReportEvidenceUpdatedAt: string | null
}

/**
 * Servicio de dominio para las evidencias documentales adjuntas a un reporte
 * de evento traumático (NOM-035 §6.5). Acepta PDF, JPG y PNG hasta 10 MB.
 *
 * Reglas clave:
 *  - El archivo se sube como `private`; el cliente solo recibe metadata y
 *    URLs firmadas temporales para descargar.
 *  - El soft-delete en BD NO borra el objeto en S3 (trazabilidad de inspección).
 *  - El scope multi-tenant se delega a `TraumaticEventReportService.assertReportInScope`.
 */
export default class TraumaticEventReportEvidenceService {
  private readonly reportService = new TraumaticEventReportService()

  /**
   * Sube el archivo a S3 y persiste la evidencia ligada al reporte.
   * Valida tipo, tamaño y categoría antes de tocar S3.
   */
  async upload(
    reportId: number,
    file: any,
    payload: TraumaticEventReportEvidencePayload,
    allowedBusinessUnitIds: number[]
  ): Promise<TraumaticEventReportEvidenceRow> {
    await this.reportService.assertReportInScope(reportId, allowedBusinessUnitIds)
    const category = this.resolveCategory(payload.category)
    this.assertFileValid(file)

    const sanitizedName = this.sanitizeFileName(file.clientName ?? 'evidence')
    const s3Key = await this.uploadToS3(file, reportId, sanitizedName)

    const record = new TraumaticEventReportEvidence()
    record.traumaticEventReportId = reportId
    record.traumaticEventReportEvidenceFile = s3Key
    record.traumaticEventReportEvidenceOriginalName = sanitizedName
    record.traumaticEventReportEvidenceCategory = category
    await record.save()

    return this.toRow(record)
  }

  /**
   * Lista todas las evidencias vivas del reporte, ordenadas por creación desc.
   * Nunca expone la Key interna de S3.
   */
  async listByReport(
    reportId: number,
    allowedBusinessUnitIds: number[]
  ): Promise<TraumaticEventReportEvidenceRow[]> {
    await this.reportService.assertReportInScope(reportId, allowedBusinessUnitIds)

    const rows = await TraumaticEventReportEvidence.query()
      .where('traumatic_event_report_id', reportId)
      .whereNull('traumatic_event_report_evidence_deleted_at')
      .orderBy('traumatic_event_report_evidence_created_at', 'desc')
      .orderBy('traumatic_event_report_evidence_id', 'desc')

    return rows.map((r) => this.toRow(r))
  }

  /**
   * Devuelve una URL pre-firmada temporal (5 min) para descargar el archivo.
   * Valida scope del reporte y pertenencia de la evidencia antes de firmar.
   */
  async getDownloadUrl(
    reportId: number,
    evidenceId: number,
    allowedBusinessUnitIds: number[]
  ): Promise<{ downloadUrl: string; expiresInSeconds: number }> {
    const evidence = await this.findEvidenceOrFail(reportId, evidenceId, allowedBusinessUnitIds)

    const uploadService = new UploadService()
    const url = await uploadService.getDownloadLink(
      evidence.traumaticEventReportEvidenceFile,
      SIGNED_URL_EXPIRES_SECONDS
    )

    if (typeof url !== 'string') {
      throw new TraumaticEventReportEvidenceError(
        'No se pudo generar el enlace de descarga.',
        TERE_ERROR_CODES.S3_OPERATION_FAILED,
        500,
        'evidencia-descarga-fallida'
      )
    }

    return { downloadUrl: url, expiresInSeconds: SIGNED_URL_EXPIRES_SECONDS }
  }

  /**
   * Soft delete de la evidencia. El objeto S3 se conserva para auditoría.
   */
  async destroy(
    reportId: number,
    evidenceId: number,
    allowedBusinessUnitIds: number[]
  ): Promise<void> {
    const evidence = await this.findEvidenceOrFail(reportId, evidenceId, allowedBusinessUnitIds)
    await evidence.delete()
  }

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------

  private async findEvidenceOrFail(
    reportId: number,
    evidenceId: number,
    allowedBusinessUnitIds: number[]
  ): Promise<TraumaticEventReportEvidence> {
    await this.reportService.assertReportInScope(reportId, allowedBusinessUnitIds)

    const evidence = await TraumaticEventReportEvidence.query()
      .where('traumatic_event_report_id', reportId)
      .where('traumatic_event_report_evidence_id', evidenceId)
      .whereNull('traumatic_event_report_evidence_deleted_at')
      .first()

    if (!evidence) {
      throw new TraumaticEventReportEvidenceError(
        'La evidencia no existe o no pertenece al reporte indicado.',
        TERE_ERROR_CODES.EVIDENCE_NOT_FOUND,
        404,
        'evidencia-no-encontrada'
      )
    }
    return evidence
  }

  private resolveCategory(
    raw: TraumaticEventReportEvidenceCategory | undefined
  ): TraumaticEventReportEvidenceCategory {
    if (raw === undefined || raw === null) return DEFAULT_CATEGORY
    if (!TRAUMATIC_EVENT_REPORT_EVIDENCE_CATEGORIES.includes(raw)) {
      throw new TraumaticEventReportEvidenceError(
        'La categoría de la evidencia es inválida.',
        TERE_ERROR_CODES.VAL_CATEGORY,
        400,
        'evidencia-categoria-invalida'
      )
    }
    return raw
  }

  private assertFileValid(file: any) {
    if (!file) {
      throw new TraumaticEventReportEvidenceError(
        'No se recibió ningún archivo.',
        TERE_ERROR_CODES.INVALID_FILE_TYPE,
        400,
        'archivo-invalido'
      )
    }

    const ext = `${file.extname ?? ''}`.toLowerCase()
    const mime = `${file.type ?? ''}/${file.subtype ?? ''}`.toLowerCase()

    if (!ALLOWED_EXTENSIONS.includes(ext as (typeof ALLOWED_EXTENSIONS)[number])) {
      throw new TraumaticEventReportEvidenceError(
        'Solo se aceptan archivos PDF, JPG o PNG.',
        TERE_ERROR_CODES.INVALID_FILE_TYPE,
        400,
        'archivo-invalido'
      )
    }

    if (!ALLOWED_MIME_TYPES.includes(mime as (typeof ALLOWED_MIME_TYPES)[number])) {
      throw new TraumaticEventReportEvidenceError(
        'El contenido del archivo no corresponde a un tipo permitido (PDF, JPG, PNG).',
        TERE_ERROR_CODES.INVALID_FILE_TYPE,
        400,
        'archivo-invalido'
      )
    }

    if (typeof file.size === 'number' && file.size > MAX_FILE_BYTES) {
      throw new TraumaticEventReportEvidenceError(
        'El archivo excede el tamaño máximo de 10 MB.',
        TERE_ERROR_CODES.FILE_TOO_LARGE,
        400,
        'archivo-demasiado-grande'
      )
    }
  }

  private async uploadToS3(file: any, reportId: number, sanitizedName: string): Promise<string> {
    const key = `${S3_FOLDER}/${reportId}/${cuid()}-${sanitizedName}`
    const uploadService = new UploadService()
    const result = await uploadService.fileUpload(file, 'evidence-document', '', { fileName: key })

    if (!result || result === 'file_not_found' || result === 'S3Producer.fileUpload') {
      throw new TraumaticEventReportEvidenceError(
        'Error al subir el archivo al almacenamiento.',
        TERE_ERROR_CODES.S3_OPERATION_FAILED,
        500,
        'evidencia-subida-fallida'
      )
    }
    return result
  }

  private sanitizeFileName(rawName: string): string {
    return `${rawName}`
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.{2,}/g, '.')
      .slice(0, 100)
  }

  private toRow(record: TraumaticEventReportEvidence): TraumaticEventReportEvidenceRow {
    return {
      traumaticEventReportEvidenceId: record.traumaticEventReportEvidenceId,
      traumaticEventReportId: record.traumaticEventReportId,
      traumaticEventReportEvidenceCategory: record.traumaticEventReportEvidenceCategory,
      traumaticEventReportEvidenceOriginalName:
        record.traumaticEventReportEvidenceOriginalName ?? null,
      traumaticEventReportEvidenceCreatedAt: this.toIso(
        record.traumaticEventReportEvidenceCreatedAt
      ),
      traumaticEventReportEvidenceUpdatedAt: this.toIso(
        record.traumaticEventReportEvidenceUpdatedAt
      ),
    }
  }

  private toIso(value: unknown): string | null {
    if (value === null || value === undefined) return null
    if (DateTime.isDateTime(value)) return (value as DateTime).toISO()
    return null
  }
}
