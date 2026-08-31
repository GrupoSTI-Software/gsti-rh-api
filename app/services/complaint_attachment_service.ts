import { DateTime } from 'luxon'
import Complaint from '#models/complaint'
import ComplaintAttachment from '#models/complaint_attachment'
import Employee from '#models/employee'
import User from '#models/user'
import UploadService from '#services/upload_service'
import FileIntakeService from '#services/file_intake_service'
import { COMPLAINT_ERROR_CODES } from '#constants/complaint_error_codes'
import {
  COMPLAINT_ATTACHMENT_S3_FOLDER,
  COMPLAINT_ATTACHMENT_SIGNED_URL_EXPIRES_SECONDS,
} from '#constants/complaint_attachment'
import { FILE_INTAKE_ERROR_CODES } from '#constants/file_intake_error_codes'
import { FileIntakeError } from '#exceptions/file_intake_error'
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
  private readonly fileIntake = new FileIntakeService()

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
      throw ComplaintServiceError.withMessageKey(
        'complaint_attachment_download_failed',
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
    const intake = await this.acceptAttachment(file)

    const s3RelativeKey = `${COMPLAINT_ATTACHMENT_S3_FOLDER}/${complaint.businessUnitId}/${complaint.complaintId}/${intake.storageFileName}`

    const uploadService = new UploadService()
    const s3Key = await uploadService.uploadPrivateBuffer(
      s3RelativeKey,
      intake.buffer,
      intake.mimeType
    )

    if (!s3Key) {
      throw ComplaintServiceError.withMessageKey(
        'complaint_attachment_upload_failed',
        COMPLAINT_ERROR_CODES.S3_OPERATION_FAILED,
        500,
        'complaint-attachment-upload-failed'
      )
    }

    const record = await ComplaintAttachment.create({
      complaintId: complaint.complaintId,
      complaintAttachmentFileName: intake.storageFileName,
      complaintAttachmentFilePath: s3Key,
      complaintAttachmentMimeType: intake.mimeType,
      complaintAttachmentFileSize: intake.fileSize,
      complaintAttachmentSanitized: true,
    })

    return this.toRow(record)
  }

  private async findComplaintByFolioForEmployee(folio: string, user: User): Promise<Complaint> {
    await user.load('person')

    if (!user.person?.personId) {
      throw ComplaintServiceError.withMessageKey(
        'complaint_person_not_found',
        COMPLAINT_ERROR_CODES.EMPLOYEE_NOT_FOUND,
        403,
        'AUTH.COMPLAINT.PERSON_NOT_FOUND'
      )
    }

    const employee = await Employee.query()
      .where('personId', user.person.personId)
      .whereNull('employee_deleted_at')
      .first()

    if (!employee) {
      throw ComplaintServiceError.withMessageKey(
        'complaint_employee_not_found',
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
      throw ComplaintServiceError.withMessageKey(
        'complaint_case_not_found_for_employee',
        COMPLAINT_ERROR_CODES.STATUS_NOT_FOUND,
        404,
        'case-not-found'
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

  /**
   * Delega la validacion y sanitizacion al servicio transversal y traduce su
   * rechazo al contrato de error del buzon, que el frontend ya consume.
   */
  private async acceptAttachment(file: unknown) {
    try {
      return await this.fileIntake.accept(
        file as Parameters<FileIntakeService['accept']>[0],
        'complaint-attachment'
      )
    } catch (error) {
      throw this.invalidFileError(resolveComplaintAttachmentMessageKey(error))
    }
  }

  private invalidFileError(messageKey: string) {
    return ComplaintServiceError.withMessageKey(
      messageKey,
      COMPLAINT_ERROR_CODES.INVALID_FILE,
      422,
      'invalid-file'
    )
  }

  private complaintNotFoundError() {
    return ComplaintServiceError.withMessageKey(
      'complaint_not_found',
      COMPLAINT_ERROR_CODES.STATUS_NOT_FOUND,
      404,
      'complaint-not-found'
    )
  }

  private attachmentNotFoundError() {
    return ComplaintServiceError.withMessageKey(
      'complaint_attachment_not_found',
      COMPLAINT_ERROR_CODES.ATTACHMENT_NOT_FOUND,
      404,
      'attachment-not-found'
    )
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

/**
 * Mapea el rechazo del intake a la clave i18n que el buzon ya usaba, para que
 * el contrato de error del modulo no cambie con la unificacion.
 */
function resolveComplaintAttachmentMessageKey(error: unknown): string {
  if (!(error instanceof FileIntakeError)) {
    return 'complaint_attachment_file_type_invalid'
  }

  switch (error.errorCode) {
    case FILE_INTAKE_ERROR_CODES.FILE_MISSING:
      return 'complaint_attachment_file_missing'
    case FILE_INTAKE_ERROR_CODES.EXTENSION_BLOCKED:
    case FILE_INTAKE_ERROR_CODES.EXTENSION_NOT_ALLOWED:
      return 'complaint_attachment_extension_blocked'
    case FILE_INTAKE_ERROR_CODES.FILE_TOO_LARGE:
      return 'complaint_attachment_file_too_large'
    default:
      return 'complaint_attachment_file_type_invalid'
  }
}
