import { DateTime } from 'luxon'
import { cuid } from '@adonisjs/core/helpers'
import db from '@adonisjs/lucid/services/db'
import UploadService from '#services/upload_service'
import Employee from '#models/employee'
import Certification from '#models/certification'
import EmployeeCertification from '#models/employee_certification'
import { EC_ERROR_CODES } from '../constants/employee_certification_error_codes.js'
import { EmployeeCertificationError } from '../exceptions/employee_certification_error.js'

const MAX_FILE_BYTES = 10 * 1024 * 1024
const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png']
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
]
const S3_FOLDER = 'employee-certifications'

export type UploadRow = {
  employeeCertificationId: number
  employeeId: number
  certificationId: number
  compliedAt: string
  expiresAt: string | null
  documentUrl: string
  isCurrent: boolean
}

export default class EmployeeCertificationUploadService {
  /**
   * Sube un archivo de acreditación a S3 y persiste la fila en employee_certifications.
   * Calcula employee_certification_expires_at automáticamente.
   */
  async upload(
    employeeId: number,
    certificationId: number,
    file: any,
    compliedAt: DateTime
  ): Promise<UploadRow> {
    const employee = await this.ensureEmployee(employeeId)
    const certification = await this.ensureCertification(certificationId)

    this.assertApplicable(employee, certification)
    this.assertFileValid(file)
    this.assertDateNotFuture(compliedAt)

    const s3Key = await this.uploadToS3(file, employeeId, certificationId)

    const expiresAt = certification.renewalPeriodDays
      ? compliedAt.plus({ days: certification.renewalPeriodDays })
      : null

    const record = new EmployeeCertification()
    record.employeeId = employeeId
    record.certificationId = certificationId
    record.employeeCertificationCompliedAt = compliedAt
    record.employeeCertificationExpiresAt = expiresAt
    record.employeeCertificationDocumentUrl = s3Key
    record.employeeCertificationCreatedAt = DateTime.now()
    record.employeeCertificationUpdatedAt = DateTime.now()
    await record.save()

    return {
      employeeCertificationId: record.employeeCertificationId,
      employeeId: record.employeeId,
      certificationId: record.certificationId,
      compliedAt: compliedAt.toISODate()!,
      expiresAt: expiresAt ? expiresAt.toISODate()! : null,
      documentUrl: s3Key,
      isCurrent: true,
    }
  }

  /**
   * Devuelve el historial completo de uploads para el par empleado/certificación,
   * ordenado por fecha de cumplimiento descendente. El más reciente lleva isCurrent = true.
   */
  async getHistory(employeeId: number, certificationId: number): Promise<UploadRow[]> {
    await this.ensureEmployee(employeeId)
    await this.ensureCertification(certificationId)

    const rows = await EmployeeCertification.query()
      .whereNull('employee_certification_deleted_at')
      .where('employee_id', employeeId)
      .where('certification_id', certificationId)
      .orderBy('employee_certification_complied_at', 'desc')
      .orderBy('employee_certification_id', 'desc')

    return rows.map((r, idx) => ({
      employeeCertificationId: r.employeeCertificationId,
      employeeId: r.employeeId,
      certificationId: r.certificationId,
      compliedAt: r.employeeCertificationCompliedAt.toISODate()!,
      expiresAt: r.employeeCertificationExpiresAt
        ? r.employeeCertificationExpiresAt.toISODate()!
        : null,
      documentUrl: r.employeeCertificationDocumentUrl ?? '',
      isCurrent: idx === 0,
    }))
  }

  /**
   * Genera una URL pre-firmada temporal (5 min) para descargar el archivo desde S3.
   */
  async getDownloadUrl(s3Key: string): Promise<string> {
    const uploadService = new UploadService()
    const url = await uploadService.getDownloadLink(s3Key, 5 * 60)
    if (typeof url !== 'string') {
      throw new EmployeeCertificationError(
        'No se pudo generar el enlace de descarga.',
        EC_ERROR_CODES.S3_UPLOAD_FAILED,
        500
      )
    }
    return url
  }

  /**
   * Soft delete del cumplimiento. Solo permite borrar el más reciente del par.
   */
  async remove(
    employeeId: number,
    certificationId: number,
    employeeCertificationId: number
  ): Promise<void> {
    await this.ensureEmployee(employeeId)
    await this.ensureCertification(certificationId)

    const record = await EmployeeCertification.query()
      .whereNull('employee_certification_deleted_at')
      .where('employee_id', employeeId)
      .where('certification_id', certificationId)
      .where('employee_certification_id', employeeCertificationId)
      .first()

    if (!record) {
      throw new EmployeeCertificationError(
        'El cumplimiento no existe o no pertenece a este empleado y certificación.',
        EC_ERROR_CODES.UPLOAD_NOT_FOUND,
        404
      )
    }

    // Verificar que sea el más reciente
    const latest = await db
      .from('employee_certifications')
      .whereNull('employee_certification_deleted_at')
      .where('employee_id', employeeId)
      .where('certification_id', certificationId)
      .orderBy('employee_certification_complied_at', 'desc')
      .orderBy('employee_certification_id', 'desc')
      .first()

    if (!latest || latest.employee_certification_id !== employeeCertificationId) {
      throw new EmployeeCertificationError(
        'Solo se puede borrar el cumplimiento más reciente.',
        EC_ERROR_CODES.DELETE_NOT_LATEST,
        403
      )
    }

    await record.delete()
  }

  private async uploadToS3(
    file: any,
    employeeId: number,
    certificationId: number
  ): Promise<string> {
    const sanitizedName = (file.clientName as string)
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.{2,}/g, '.')
      .slice(0, 100)

    const fileName = `${S3_FOLDER}/${employeeId}/${certificationId}/${cuid()}-${sanitizedName}`

    const uploadService = new UploadService()
    const result = await uploadService.fileUpload(file, '', fileName, 'private')

    if (!result || result === 'file_not_found' || result === 'S3Producer.fileUpload') {
      throw new EmployeeCertificationError(
        'Error al subir el archivo a S3.',
        EC_ERROR_CODES.S3_UPLOAD_FAILED,
        500
      )
    }

    return result
  }

  private assertFileValid(file: any) {
    if (!file) {
      throw new EmployeeCertificationError(
        'No se recibió ningún archivo.',
        EC_ERROR_CODES.INVALID_FILE_TYPE,
        400
      )
    }

    const ext = (file.extname ?? '').toLowerCase()
    const mime = `${file.type ?? ''}/${file.subtype ?? ''}`.toLowerCase()

    if (!ALLOWED_EXTENSIONS.includes(ext) || !ALLOWED_MIME_TYPES.includes(mime)) {
      throw new EmployeeCertificationError(
        'Tipo de archivo no permitido. Solo PDF, JPG o PNG.',
        EC_ERROR_CODES.INVALID_FILE_TYPE,
        415
      )
    }

    if (file.size > MAX_FILE_BYTES) {
      throw new EmployeeCertificationError(
        'El archivo excede el tamaño máximo de 10 MB.',
        EC_ERROR_CODES.FILE_TOO_LARGE,
        413
      )
    }
  }

  private assertDateNotFuture(date: DateTime) {
    if (date.startOf('day') > DateTime.now().startOf('day')) {
      throw new EmployeeCertificationError(
        'La fecha de cumplimiento no puede ser futura.',
        EC_ERROR_CODES.FUTURE_DATE,
        422
      )
    }
  }

  private assertApplicable(employee: Employee, certification: Certification) {
    const units = certification.businessUnits ?? []
    if (units.length === 0) return

    const unitIds = units.map((u) => u.businessUnitId)
    if (employee.positionId === null) return

    if (!unitIds.includes(employee.businessUnitId)) {
      throw new EmployeeCertificationError(
        'Esta certificación está acotada a unidades de negocio distintas a la del puesto del empleado.',
        EC_ERROR_CODES.CERTIFICATION_NOT_APPLICABLE,
        422
      )
    }
  }

  private async ensureEmployee(employeeId: number): Promise<Employee> {
    const emp = await Employee.query()
      .whereNull('employee_deleted_at')
      .where('employee_id', employeeId)
      .first()

    if (!emp) {
      throw new EmployeeCertificationError(
        'El empleado no existe o fue dado de baja.',
        EC_ERROR_CODES.EMPLOYEE_NOT_FOUND,
        404
      )
    }
    return emp
  }

  private async ensureCertification(certificationId: number): Promise<Certification> {
    const cert = await Certification.query()
      .where('certification_id', certificationId)
      .preload('businessUnits', (q) => q.whereNull('business_unit_deleted_at'))
      .first()

    if (!cert) {
      throw new EmployeeCertificationError(
        `La certificación con id ${certificationId} no existe.`,
        EC_ERROR_CODES.CERTIFICATION_NOT_FOUND,
        404
      )
    }
    return cert
  }
}
