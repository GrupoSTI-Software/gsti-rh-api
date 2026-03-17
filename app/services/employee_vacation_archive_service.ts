import EmployeeVacationArchive from '#models/employee_vacation_archive'
import EmployeeVacationArchiveContent from '#models/employee_vacation_archive_content'
import Employee from '#models/employee'
import VacationSetting from '#models/vacation_setting'
import UploadService from '#services/upload_service'
import { EMPLOYEE_VACATION_ARCHIVE_ERROR_CODES } from '../constants/employee_vacation_archive_error_codes.js'

/** Tamaño máximo de archivo: 5MB */
export const EMPLOYEE_VACATION_ARCHIVE_MAX_FILE_SIZE = 5 * 1024 * 1024

/** Extensiones permitidas: imágenes y PDF */
export const EMPLOYEE_VACATION_ARCHIVE_ALLOWED_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'pdf',
]

export default class EmployeeVacationArchiveService {
  /**
   * Crea un archivador de vacaciones (contenedor para evidencias).
   */
  async create(payload: { employeeId: number; vacationSettingId: number }) {
    const validation = await this.validateArchivePayload(payload)
    if (validation.status !== 200) {
      return validation
    }

    const archive = await EmployeeVacationArchive.create({
      employeeId: payload.employeeId,
      vacationSettingId: payload.vacationSettingId,
    })

    return {
      status: 201,
      type: 'success',
      title: 'Archivador creado',
      message: 'El archivador de vacaciones fue creado correctamente',
      data: archive,
    }
  }

  /**
   * Valida empleado y configuración de vacaciones.
   */
  async validateArchivePayload(payload: { employeeId: number; vacationSettingId: number }) {
    const employee = await Employee.query()
      .where('employee_id', payload.employeeId)
      .whereNull('employee_deleted_at')
      .first()

    if (!employee) {
      const err = EMPLOYEE_VACATION_ARCHIVE_ERROR_CODES.EMPLOYEE_NOT_FOUND
      return {
        status: 404,
        type: 'error',
        title: err.message,
        message: err.description,
        errorCode: err.code,
        data: null,
      }
    }

    const vacationSetting = await VacationSetting.find(payload.vacationSettingId)
    if (!vacationSetting) {
      const err = EMPLOYEE_VACATION_ARCHIVE_ERROR_CODES.VACATION_SETTING_NOT_FOUND
      return {
        status: 404,
        type: 'error',
        title: err.message,
        message: err.description,
        errorCode: err.code,
        data: null,
      }
    }

    return {
      status: 200,
      type: 'success',
      title: 'Validación correcta',
      message: 'Validación correcta',
      data: payload,
    }
  }

  /**
   * Obtiene un archivador por ID (con contenidos y sus excepciones de turno vinculadas).
   */
  async findById(employeeVacationArchiveId: number) {
    const archive = await EmployeeVacationArchive.query()
      .whereNull('employee_vacation_archive_deleted_at')
      .where('employee_vacation_archive_id', employeeVacationArchiveId)
      .preload('employee')
      .preload('vacationSetting')
      .preload('contents', (q) => {
        q.whereNull('employee_vacation_archive_content_deleted_at').preload('shiftExceptions', (sq) => {
          sq.whereNull('shift_exceptions_deleted_at').preload('exceptionType')
        })
      })
      .first()

    return archive
  }

  /**
   * Lista archivadores (filtros opcionales: employeeId, vacationSettingId, shiftExceptionId).
   * shiftExceptionId: archivadores que tienen al menos un contenido vinculado a esa excepción.
   */
  async list(filters?: {
    employeeId?: number
    vacationSettingId?: number
    shiftExceptionId?: number
  }) {
    let query = EmployeeVacationArchive.query().whereNull(
      'employee_vacation_archive_deleted_at'
    )

    if (filters?.employeeId) {
      query = query.where('employee_id', filters.employeeId)
    }
    if (filters?.vacationSettingId) {
      query = query.where('vacation_setting_id', filters.vacationSettingId)
    }
    if (filters?.shiftExceptionId) {
      query = query.whereHas('contents', (q) => {
        q.whereNull('employee_vacation_archive_content_deleted_at').whereHas(
          'shiftExceptions',
          (sq) => sq.where('shiftExceptionId', filters!.shiftExceptionId!)
        )
      })
    }

    const archives = await query
      .preload('employee')
      .preload('vacationSetting')
      .preload('contents', (q) => {
        q.whereNull('employee_vacation_archive_content_deleted_at').preload('shiftExceptions', (sq) => {
          sq.whereNull('shift_exceptions_deleted_at').preload('exceptionType')
        })
      })
      .orderBy('employee_vacation_archive_created_at', 'desc')

    return archives
  }

  /**
   * Elimina un archivador (soft delete) y toda la información relacionada:
   * - Por cada contenido: detach excepciones de turno, borrar archivo en S3, soft delete contenido
   * - Archivador: soft delete
   */
  async deleteById(employeeVacationArchiveId: number, uploadService: UploadService) {
    const archive = await EmployeeVacationArchive.query()
      .whereNull('employee_vacation_archive_deleted_at')
      .where('employee_vacation_archive_id', employeeVacationArchiveId)
      .first()

    if (!archive) {
      const err = EMPLOYEE_VACATION_ARCHIVE_ERROR_CODES.ARCHIVE_NOT_FOUND
      return {
        status: 404,
        type: 'error',
        title: err.message,
        message: err.description,
        errorCode: err.code,
        data: null,
      }
    }

    const contents = await EmployeeVacationArchiveContent.query()
      .whereNull('employee_vacation_archive_content_deleted_at')
      .where('employee_vacation_archive_id', employeeVacationArchiveId)

    for (const content of contents) {
      await content.related('shiftExceptions').detach()
      const fileKey = content.employeeVacationArchiveContentFile
      if (fileKey) {
        await uploadService.deleteFile(fileKey)
      }
      await content.delete()
    }

    await archive.delete()

    return {
      status: 200,
      type: 'success',
      title: 'Archivador eliminado',
      message: 'El archivador de vacaciones y toda su información relacionada fueron eliminados correctamente',
      data: archive,
    }
  }
}
