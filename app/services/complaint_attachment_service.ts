import { DateTime } from 'luxon'
import { cuid } from '@adonisjs/core/helpers'
import Complaint from '#models/complaint'
import ComplaintAttachment from '#models/complaint_attachment'
import Employee from '#models/employee'
import User from '#models/user'
import UploadService from '#services/upload_service'
import ComplaintFileSanitizerService from '#services/complaint_file_sanitizer_service'
import { COMPLAINT_ERROR_CODES } from '#constants/complaint_error_codes'
import {
  COMPLAINT_ATTACHMENT_MAX_BYTES,
  COMPLAINT_ATTACHMENT_S3_FOLDER,
  COMPLAINT_ATTACHMENT_SIGNED_URL_EXPIRES_SECONDS,
} from '#constants/complaint_attachment'
import { ComplaintServiceError } from '#exceptions/complaint_service_error'
import type {
  ComplaintAttachmentDownloadResult,
  ComplaintAttachmentRow,
} from '../interfaces/complaint_attachment_interface.js'

/**
 * Servicio de adjuntos del buzón de quejas. Sanitiza metadatos antes de
 * persistir y aísla almacenamiento por tenant (business unit).
 */
export default class ComplaintAttachmentService {
  private readonly sanitizer = new ComplaintFileSanitizerService()

  /**
   * Sube un adjunto sanitizado a una queja identificada por folio (empleado autenticado).
   */
  async uploadByFolio(folio: string, file: any, user: User): Promise<ComplaintAttachmentRow> {
    const complaint = await this.findComplaintByFolioForEmployee(folio, user)
    return this.uploadForComplaint(complaint, file)
  }

  /** Lista adjuntos de una queja dentro del scope del administrador. */
  async listByComplaintId(
    complaintId: number,
    allowedBusinessUnitIds: number[]
  ): Promise<ComplaintAttachmentRow[]> {
    const complaint = await this.findComplaintInScopeOrFail(complaintId, allowedBusinessUnitIds)

    const rows = await ComplaintAttachment.query()
      .where('complaint_id', complaint.complaintId)
      .whereNull('complaint_attachment_deleted_at')
      .orderBy('complaint_attachment_created_at', 'desc')
      .orderBy('complaint_attachment_id', 'desc')

    return rows.map((row) => this.toRow(row))
  }

  /** Genera URL firmada temporal del adjunto ya sanitizado. */
  async getDownloadUrl(
    attachmentId: number,
    allowedBusinessUnitIds: number[]
  ): Promise<ComplaintAttachmentDownloadResult> {
    const attachment = await this.findAttachmentInScopeOrFail(attachmentId, allowedBusinessUnitIds)

    const uploadService = new UploadService()
    const url = await uploadService.getDownloadLink(
      attachment.complaintAttachmentFilePath,
      COMPLAINT_ATTACHMENT_SIGNED_URL_EXPIRES_SECONDS
    )

    if (typeof url !== 'string') {
      throw new ComplaintServiceError(
        'No se pudo generar el enlace de descarga',
        COMPLAINT_ERROR_CODES.S3_OPERATION_FAILED,
        500,
        'complaint-attachment-download-failed'
      )
    }

    return {
      downloadUrl: url,
      expiresInSeconds: COMPLAINT_ATTACHMENT_SIGNED_URL_EXPIRES_SECONDS,
    }
  }

  /** Soft delete del adjunto. Idempotente: si ya estaba eliminado, no lanza error. */
  async destroy(attachmentId: number, allowedBusinessUnitIds: number[]): Promise<void> {
    const attachment = await this.findAttachmentInScopeOrFail(
      attachmentId,
      allowedBusinessUnitIds,
      { includeTrashed: true }
    )

    if (attachment.trashed) {
      return
    }

    await attachment.delete()
  }

  private async uploadForComplaint(complaint: Complaint, file: any): Promise<ComplaintAttachmentRow> {
    this.assertFilePresent(file)

    if (typeof file.size === 'number' && file.size > COMPLAINT_ATTACHMENT_MAX_BYTES) {
      throw this.invalidFileError('El archivo excede el tamaño máximo permitido')
    }

    let sanitized
    try {
      sanitized = await this.sanitizer.sanitizeFromPath(file.tmpPath)
    } catch {
      throw this.invalidFileError('El tipo o contenido del archivo no está permitido')
    }

    if (sanitized.fileSize > COMPLAINT_ATTACHMENT_MAX_BYTES) {
      throw this.invalidFileError('El archivo excede el tamaño máximo permitido')
    }

    const displayName = this.sanitizeFileName(file.clientName ?? 'attachment')
    const s3RelativeKey = `${COMPLAINT_ATTACHMENT_S3_FOLDER}/${complaint.businessUnitId}/${complaint.complaintId}/${cuid()}-${displayName}`

    const uploadService = new UploadService()
    const s3Key = await uploadService.uploadPrivateBuffer(
      s3RelativeKey,
      sanitized.buffer,
      sanitized.mimeType
    )

    if (!s3Key) {
      throw new ComplaintServiceError(
        'Error al subir el archivo sanitizado a S3',
        COMPLAINT_ERROR_CODES.S3_OPERATION_FAILED,
        500,
        'complaint-attachment-upload-failed'
      )
    }

    const record = await ComplaintAttachment.create({
      complaintId: complaint.complaintId,
      complaintAttachmentFileName: displayName,
      complaintAttachmentFilePath: s3Key,
      complaintAttachmentMimeType: sanitized.mimeType,
      complaintAttachmentFileSize: sanitized.fileSize,
      complaintAttachmentSanitized: true,
    })

    return this.toRow(record)
  }

  private async findComplaintByFolioForEmployee(folio: string, user: User): Promise<Complaint> {
    await user.load('person')

    if (!user.person?.personId) {
      throw new ComplaintServiceError(
        'El usuario no tiene una persona asociada',
        COMPLAINT_ERROR_CODES.EMPLOYEE_NOT_FOUND,
        403,
        'AUTH.COMPLAINT.EMPLOYEE_NOT_FOUND'
      )
    }

    const employee = await Employee.query()
      .where('personId', user.person.personId)
      .whereNull('employee_deleted_at')
      .first()

    if (!employee) {
      throw new ComplaintServiceError(
        'El usuario no tiene un registro de empleado asociado',
        COMPLAINT_ERROR_CODES.EMPLOYEE_NOT_FOUND,
        403,
        'AUTH.COMPLAINT.EMPLOYEE_NOT_FOUND'
      )
    }

    const complaint = await Complaint.query()
      .where('complaint_folio', folio.trim())
      .where('employee_id', employee.employeeId)
      .whereNull('complaint_deleted_at')
      .first()

    if (!complaint) {
      throw new ComplaintServiceError(
        'La queja no existe o no pertenece al empleado autenticado',
        COMPLAINT_ERROR_CODES.STATUS_NOT_FOUND,
        404,
        'caso-no-encontrado'
      )
    }

    return complaint
  }

  private async findComplaintInScopeOrFail(
    complaintId: number,
    allowedBusinessUnitIds: number[]
  ): Promise<Complaint> {
    if (allowedBusinessUnitIds.length === 0) {
      throw this.complaintNotFoundError()
    }

    const complaint = await Complaint.query()
      .where('complaint_id', complaintId)
      .whereNull('complaint_deleted_at')
      .whereIn('business_unit_id', allowedBusinessUnitIds)
      .first()

    if (!complaint) {
      throw this.complaintNotFoundError()
    }

    return complaint
  }

  private async findAttachmentInScopeOrFail(
    attachmentId: number,
    allowedBusinessUnitIds: number[],
    options: { includeTrashed?: boolean } = {}
  ): Promise<ComplaintAttachment> {
    if (allowedBusinessUnitIds.length === 0) {
      throw this.attachmentNotFoundError()
    }

    const query = options.includeTrashed
      ? ComplaintAttachment.query().withTrashed()
      : ComplaintAttachment.query()

    const attachment = await query
      .where('complaint_attachment_id', attachmentId)
      .whereHas('complaint', (complaintQuery) => {
        complaintQuery
          .whereNull('complaint_deleted_at')
          .whereIn('business_unit_id', allowedBusinessUnitIds)
      })
      .first()

    if (!attachment || (!options.includeTrashed && attachment.trashed)) {
      throw this.attachmentNotFoundError()
    }

    return attachment
  }

  private assertFilePresent(file: any) {
    if (!file || !file.tmpPath) {
      throw this.invalidFileError('No se recibió ningún archivo')
    }
  }

  private invalidFileError(message: string) {
    return new ComplaintServiceError(
      message,
      COMPLAINT_ERROR_CODES.INVALID_FILE,
      422,
      'archivo-invalido'
    )
  }

  private complaintNotFoundError() {
    return new ComplaintServiceError(
      'La queja no existe o está fuera del alcance del usuario autenticado',
      COMPLAINT_ERROR_CODES.STATUS_NOT_FOUND,
      404,
      'queja-no-encontrada'
    )
  }

  private attachmentNotFoundError() {
    return new ComplaintServiceError(
      'El adjunto no existe o está fuera del alcance del usuario autenticado',
      COMPLAINT_ERROR_CODES.ATTACHMENT_NOT_FOUND,
      404,
      'adjunto-no-encontrado'
    )
  }

  private sanitizeFileName(rawName: string): string {
    return `${rawName}`
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.{2,}/g, '.')
      .slice(0, 100)
  }

  private toRow(record: ComplaintAttachment): ComplaintAttachmentRow {
    return {
      complaintAttachmentId: record.complaintAttachmentId,
      complaintId: record.complaintId,
      fileName: record.complaintAttachmentFileName,
      mimeType: record.complaintAttachmentMimeType,
      fileSize: record.complaintAttachmentFileSize,
      sanitized: record.complaintAttachmentSanitized,
      createdAt: this.toIso(record.complaintAttachmentCreatedAt),
      updatedAt: this.toIso(record.complaintAttachmentUpdatedAt),
    }
  }

  private toIso(value: unknown): string | null {
    if (value === null || value === undefined) return null
    if (DateTime.isDateTime(value)) return (value as DateTime).toISO()
    return null
  }
}
