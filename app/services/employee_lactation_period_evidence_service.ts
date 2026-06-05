import { DateTime } from 'luxon'
import { cuid } from '@adonisjs/core/helpers'
import UploadService from '#services/upload_service'
import EmployeeLactationPeriodEvidence, {
  type EmployeeLactationPeriodEvidenceCategory,
} from '#models/employee_lactation_period_evidence'
import EmployeeLactationPeriodService from '#services/employee_lactation_period_service'
import { ELPE_ERROR_CODES } from '../constants/employee_lactation_period_evidence_error_codes.js'
import { EmployeeLactationPeriodEvidenceError } from '../exceptions/employee_lactation_period_evidence_error.js'
import { EMPLOYEE_LACTATION_PERIOD_EVIDENCE_CATEGORIES } from '../validators/employee_lactation_period_evidence.js'

/**
 * Límite de tamaño por archivo: 10 MB. Coincide con la regla de la HU y queda
 * por debajo del límite global del bodyparser (20 MB), así que el archivo
 * llega siempre al controller cuando es válido.
 */
const MAX_FILE_BYTES = 10 * 1024 * 1024

/** Sólo PDFs por extensión y MIME. */
const ALLOWED_EXTENSIONS = ['pdf'] as const
const ALLOWED_MIME_TYPES = ['application/pdf'] as const

/** Carpeta lógica en S3; queda anidada bajo `AWS_ROOT_PATH/{folder}/...`. */
const S3_FOLDER = 'employee-lactation-period-evidences'

/** Categoría usada por default cuando el cliente no la envía. */
const DEFAULT_CATEGORY: EmployeeLactationPeriodEvidenceCategory = 'other'

/** Vigencia (segundos) de la URL firmada de descarga. 5 min, igual que certificaciones. */
const SIGNED_URL_EXPIRES_SECONDS = 5 * 60

export interface EmployeeLactationPeriodEvidencePayload {
  category?: EmployeeLactationPeriodEvidenceCategory
}

/** Representación segura de la evidencia para el cliente. */
export interface EmployeeLactationPeriodEvidenceRow {
  employeeLactationPeriodEvidenceId: number
  employeeLactationPeriodId: number
  employeeLactationPeriodEvidenceCategory: EmployeeLactationPeriodEvidenceCategory
  employeeLactationPeriodEvidenceOriginalName: string | null
  employeeLactationPeriodEvidenceCreatedAt: string | null
  employeeLactationPeriodEvidenceUpdatedAt: string | null
}

/**
 * Servicio de dominio para las evidencias documentales adjuntas a un periodo
 * de lactancia (PDFs). Reusa `UploadService` para hablar con S3 y delega en
 * `EmployeeLactationPeriodService.ensurePeriodAccessible` la validación
 * multitenant del periodo padre.
 *
 * Reglas clave:
 *  - Sólo se aceptan PDFs hasta 10 MB.
 *  - El archivo se sube como `private`; el cliente sólo recibe metadata y
 *    URLs firmadas temporales para descargar.
 *  - El soft-delete en BD NO borra el objeto en S3 (mismo criterio que
 *    `employee_certifications`); el reporte STPS puede seguir auditando
 *    versiones anteriores si se requiere.
 */
export default class EmployeeLactationPeriodEvidenceService {
  /**
   * Sube un PDF a S3 y persiste la evidencia ligada al periodo. Valida tipo,
   * tamaño y categoría antes de tocar S3 para no pagar latencia en caso de
   * input inválido.
   */
  async upload(
    periodId: number,
    file: any,
    payload: EmployeeLactationPeriodEvidencePayload,
    allowedBusinessUnitIds: number[]
  ): Promise<EmployeeLactationPeriodEvidenceRow> {
    const period = await this.ensurePeriod(periodId, allowedBusinessUnitIds)
    const category = this.resolveCategory(payload.category)

    this.assertFileValid(file)

    const sanitizedName = this.sanitizeFileName(file.clientName ?? 'evidence.pdf')
    const s3Key = await this.uploadToS3(file, period.employeeLactationPeriodId, sanitizedName)

    const record = new EmployeeLactationPeriodEvidence()
    record.employeeLactationPeriodId = period.employeeLactationPeriodId
    record.employeeLactationPeriodEvidenceFile = s3Key
    record.employeeLactationPeriodEvidenceOriginalName = sanitizedName
    record.employeeLactationPeriodEvidenceCategory = category
    await record.save()

    return this.toRow(record)
  }

  /**
   * Lista todas las evidencias vivas del periodo, ordenadas por la más
   * reciente primero. Nunca expone la `Key` interna de S3.
   */
  async listByPeriod(
    periodId: number,
    allowedBusinessUnitIds: number[]
  ): Promise<EmployeeLactationPeriodEvidenceRow[]> {
    const period = await this.ensurePeriod(periodId, allowedBusinessUnitIds)

    const rows = await EmployeeLactationPeriodEvidence.query()
      .where('employee_lactation_period_id', period.employeeLactationPeriodId)
      .whereNull('employee_lactation_period_evidence_deleted_at')
      .orderBy('employee_lactation_period_evidence_created_at', 'desc')
      .orderBy('employee_lactation_period_evidence_id', 'desc')

    return rows.map((r) => this.toRow(r))
  }

  /**
   * Devuelve una URL pre-firmada temporal (5 min) para descargar el archivo
   * de la evidencia indicada. Valida que la evidencia pertenezca al periodo
   * y al tenant antes de generar el enlace.
   */
  async getDownloadUrl(
    periodId: number,
    evidenceId: number,
    allowedBusinessUnitIds: number[]
  ): Promise<{ downloadUrl: string; expiresInSeconds: number }> {
    const evidence = await this.findEvidenceOrFail(
      periodId,
      evidenceId,
      allowedBusinessUnitIds
    )

    const uploadService = new UploadService()
    const url = await uploadService.getDownloadLink(
      evidence.employeeLactationPeriodEvidenceFile,
      SIGNED_URL_EXPIRES_SECONDS
    )

    if (typeof url !== 'string') {
      throw new EmployeeLactationPeriodEvidenceError(
        'No se pudo generar el enlace de descarga.',
        ELPE_ERROR_CODES.S3_OPERATION_FAILED,
        500,
        'lactation-evidence-download-failed'
      )
    }

    return { downloadUrl: url, expiresInSeconds: SIGNED_URL_EXPIRES_SECONDS }
  }

  /**
   * Soft delete de la evidencia (mantiene el objeto en S3 para auditoría).
   * Devuelve la fila previa al borrado para que el caller pueda emitir un
   * confirm en logs o UI sin volver a consultar.
   */
  async destroy(
    periodId: number,
    evidenceId: number,
    allowedBusinessUnitIds: number[]
  ): Promise<EmployeeLactationPeriodEvidenceRow> {
    const evidence = await this.findEvidenceOrFail(
      periodId,
      evidenceId,
      allowedBusinessUnitIds
    )
    const snapshot = this.toRow(evidence)
    await evidence.delete()
    return snapshot
  }

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------

  private async ensurePeriod(periodId: number, allowedBusinessUnitIds: number[]) {
    try {
      const service = new EmployeeLactationPeriodService()
      return await service.ensurePeriodAccessible(periodId, allowedBusinessUnitIds)
    } catch (error) {
      // Normalizamos el error del módulo padre al dominio de evidencias para
      // mantener `errorCode` consistente en todas las respuestas del controller.
      throw new EmployeeLactationPeriodEvidenceError(
        'El periodo de lactancia no existe o no pertenece a la empresa actual.',
        ELPE_ERROR_CODES.PERIOD_NOT_FOUND,
        404,
        'lactation-period-not-found'
      )
    }
  }

  private async findEvidenceOrFail(
    periodId: number,
    evidenceId: number,
    allowedBusinessUnitIds: number[]
  ): Promise<EmployeeLactationPeriodEvidence> {
    const period = await this.ensurePeriod(periodId, allowedBusinessUnitIds)

    const evidence = await EmployeeLactationPeriodEvidence.query()
      .where('employee_lactation_period_id', period.employeeLactationPeriodId)
      .where('employee_lactation_period_evidence_id', evidenceId)
      .whereNull('employee_lactation_period_evidence_deleted_at')
      .first()

    if (!evidence) {
      throw new EmployeeLactationPeriodEvidenceError(
        'La evidencia no existe o no pertenece al periodo indicado.',
        ELPE_ERROR_CODES.EVIDENCE_NOT_FOUND,
        404,
        'lactation-evidence-not-found'
      )
    }
    return evidence
  }

  private resolveCategory(
    raw: EmployeeLactationPeriodEvidenceCategory | undefined
  ): EmployeeLactationPeriodEvidenceCategory {
    if (raw === undefined || raw === null) return DEFAULT_CATEGORY
    if (!EMPLOYEE_LACTATION_PERIOD_EVIDENCE_CATEGORIES.includes(raw)) {
      throw new EmployeeLactationPeriodEvidenceError(
        'La categoría de la evidencia es inválida.',
        ELPE_ERROR_CODES.VAL_CATEGORY,
        400,
        'lactation-evidence-invalid-category'
      )
    }
    return raw
  }

  private assertFileValid(file: any) {
    if (!file) {
      throw new EmployeeLactationPeriodEvidenceError(
        'No se recibió ningún archivo.',
        ELPE_ERROR_CODES.INVALID_FILE_TYPE,
        400,
        'lactation-evidence-file-required'
      )
    }

    const ext = `${file.extname ?? ''}`.toLowerCase()
    const mime = `${file.type ?? ''}/${file.subtype ?? ''}`.toLowerCase()

    if (!ALLOWED_EXTENSIONS.includes(ext as (typeof ALLOWED_EXTENSIONS)[number])) {
      throw new EmployeeLactationPeriodEvidenceError(
        'Sólo se aceptan archivos PDF.',
        ELPE_ERROR_CODES.INVALID_FILE_TYPE,
        400,
        'lactation-evidence-invalid-file-type'
      )
    }
    if (!ALLOWED_MIME_TYPES.includes(mime as (typeof ALLOWED_MIME_TYPES)[number])) {
      throw new EmployeeLactationPeriodEvidenceError(
        'El contenido del archivo no corresponde a un PDF válido.',
        ELPE_ERROR_CODES.INVALID_FILE_TYPE,
        400,
        'lactation-evidence-invalid-file-type'
      )
    }

    if (typeof file.size === 'number' && file.size > MAX_FILE_BYTES) {
      throw new EmployeeLactationPeriodEvidenceError(
        'El archivo excede el tamaño máximo de 10 MB.',
        ELPE_ERROR_CODES.FILE_TOO_LARGE,
        400,
        'lactation-evidence-file-too-large'
      )
    }
  }

  private async uploadToS3(
    file: any,
    periodId: number,
    sanitizedName: string
  ): Promise<string> {
    const fileName = `${S3_FOLDER}/${periodId}/${cuid()}-${sanitizedName}`
    const uploadService = new UploadService()
    const result = await uploadService.fileUpload(file, '', fileName, 'private')

    if (!result || result === 'file_not_found' || result === 'S3Producer.fileUpload') {
      throw new EmployeeLactationPeriodEvidenceError(
        'Error al subir el archivo a S3.',
        ELPE_ERROR_CODES.S3_OPERATION_FAILED,
        500,
        'lactation-evidence-upload-failed'
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

  private toRow(record: EmployeeLactationPeriodEvidence): EmployeeLactationPeriodEvidenceRow {
    return {
      employeeLactationPeriodEvidenceId: record.employeeLactationPeriodEvidenceId,
      employeeLactationPeriodId: record.employeeLactationPeriodId,
      employeeLactationPeriodEvidenceCategory: record.employeeLactationPeriodEvidenceCategory,
      employeeLactationPeriodEvidenceOriginalName:
        record.employeeLactationPeriodEvidenceOriginalName ?? null,
      employeeLactationPeriodEvidenceCreatedAt: this.toIso(
        record.employeeLactationPeriodEvidenceCreatedAt
      ),
      employeeLactationPeriodEvidenceUpdatedAt: this.toIso(
        record.employeeLactationPeriodEvidenceUpdatedAt
      ),
    }
  }

  private toIso(value: unknown): string | null {
    if (value === null || value === undefined) return null
    if (DateTime.isDateTime(value)) return (value as DateTime).toISO()
    return null
  }
}
