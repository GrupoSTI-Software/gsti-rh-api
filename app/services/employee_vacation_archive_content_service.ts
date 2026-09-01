import UploadService from '#services/upload_service'
import type { IncomingFile } from '#services/file_intake_service'
import EmployeeVacationArchiveContent from '#models/employee_vacation_archive_content'
import EmployeeVacationArchive from '#models/employee_vacation_archive'
import ShiftException from '#models/shift_exception'
import ExceptionType from '#models/exception_type'
import { EMPLOYEE_VACATION_ARCHIVE_ERROR_CODES } from '../constants/employee_vacation_archive_error_codes.js'
import { SYSTEM_SETTING_ERROR_CODES } from '../constants/system_setting_error_codes.js'
import {
  EMPLOYEE_VACATION_ARCHIVE_MAX_FILE_SIZE,
  EMPLOYEE_VACATION_ARCHIVE_ALLOWED_EXTENSIONS,
} from '#services/employee_vacation_archive_service'

const VACATION_EXCEPTION_TYPE_SLUG = 'vacation'

export type CreateContentResult =
  | { status: number; type: string; title: string; message: string; errorCode?: string; data: null }
  | {
      status: number
      type: string
      title: string
      message: string
      errorCode?: string
      data: EmployeeVacationArchiveContent
    }

export default class EmployeeVacationArchiveContentService {
  /**
   * Sube un archivo al S3 y crea el registro de contenido del archivador.
   * Opcionalmente vincula excepciones de turno (tipo vacation) a este contenido/evidencia.
   * Límite: 5MB. Tipos: imágenes (jpg, jpeg, png, gif, webp) y PDF.
   */
  async createContent(
    employeeVacationArchiveId: number,
    file: IncomingFile,
    description: string | null,
    uploadService: UploadService,
    shiftExceptionIds?: number[]
  ): Promise<CreateContentResult> {
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

    if (!file || !file.tmpPath) {
      const err = EMPLOYEE_VACATION_ARCHIVE_ERROR_CODES.FILE_NOT_PROVIDED
      return {
        status: 400,
        type: 'error',
        title: err.message,
        message: err.description,
        errorCode: err.code,
        data: null,
      }
    }

    if (file.size > EMPLOYEE_VACATION_ARCHIVE_MAX_FILE_SIZE) {
      const err = EMPLOYEE_VACATION_ARCHIVE_ERROR_CODES.FILE_TOO_LARGE
      return {
        status: 400,
        type: 'error',
        title: err.message,
        message: err.description,
        errorCode: err.code,
        data: null,
      }
    }

    const ext = (file.extname || '').toLowerCase()
    if (!EMPLOYEE_VACATION_ARCHIVE_ALLOWED_EXTENSIONS.includes(ext)) {
      const err = EMPLOYEE_VACATION_ARCHIVE_ERROR_CODES.INVALID_FILE_TYPE
      return {
        status: 400,
        type: 'error',
        title: err.message,
        message: err.description,
        errorCode: err.code,
        data: null,
      }
    }

    const folderName = `employee-vacation-archives/${employeeVacationArchiveId}`

    const fileUrlOrKey = await uploadService.fileUpload(file, 'employee-record-document', folderName)

    if (fileUrlOrKey === 'file_not_found' || fileUrlOrKey === 'S3Producer.fileUpload') {
      const err = SYSTEM_SETTING_ERROR_CODES.UPLOAD_ERROR
      return {
        status: 500,
        type: 'error',
        title: err.message,
        message: err.description,
        errorCode: err.code,
        data: null,
      }
    }

    const content = await EmployeeVacationArchiveContent.create({
      employeeVacationArchiveId,
      employeeVacationArchiveContentDescription: description || '',
      employeeVacationArchiveContentFile: fileUrlOrKey,
      employeeVacationArchiveContentActive: true,
    })

    if (shiftExceptionIds?.length) {
      const validation = await this.validateAndAttachShiftExceptions(
        content.employeeVacationArchiveContentId,
        archive.employeeId,
        shiftExceptionIds
      )
      if (validation.status !== 200) {
        await content.delete()
        await uploadService.deleteFile(fileUrlOrKey)
        return validation as CreateContentResult
      }
      await content.load('shiftExceptions', (q) => q.preload('exceptionType'))
    }

    return {
      status: 201,
      type: 'success',
      title: 'Evidencia subida',
      message: 'El archivo de evidencia fue subido correctamente',
      data: content,
    }
  }

  /**
   * Valida que los shiftExceptionIds existan, sean tipo vacation y del mismo empleado; luego los vincula al contenido.
   */
  async validateAndAttachShiftExceptions(
    employeeVacationArchiveContentId: number,
    employeeId: number,
    shiftExceptionIds: number[]
  ): Promise<
    | { status: 200; type: string; title: string; message: string; data: null }
    | { status: number; type: string; title: string; message: string; errorCode: string; data: null }
  > {
    const vacationType = await ExceptionType.query()
      .where('exceptionTypeSlug', VACATION_EXCEPTION_TYPE_SLUG)
      .first()

    if (!vacationType) {
      const err = EMPLOYEE_VACATION_ARCHIVE_ERROR_CODES.SHIFT_EXCEPTION_NOT_VACATION_TYPE
      return {
        status: 400,
        type: 'error',
        title: err.message,
        message: 'No existe el tipo de excepción "vacation" en el sistema.',
        errorCode: err.code,
        data: null,
      }
    }

    for (const shiftExceptionId of shiftExceptionIds) {
      const shiftException = await ShiftException.query()
        .whereNull('shift_exceptions_deleted_at')
        .where('shiftExceptionId', shiftExceptionId)
        .preload('exceptionType')
        .first()

      if (!shiftException) {
        const err = EMPLOYEE_VACATION_ARCHIVE_ERROR_CODES.SHIFT_EXCEPTION_NOT_FOUND
        return {
          status: 404,
          type: 'error',
          title: err.message,
          message: err.description,
          errorCode: err.code,
          data: null,
        }
      }

      if (shiftException.exceptionType.exceptionTypeSlug !== VACATION_EXCEPTION_TYPE_SLUG) {
        const err = EMPLOYEE_VACATION_ARCHIVE_ERROR_CODES.SHIFT_EXCEPTION_NOT_VACATION_TYPE
        return {
          status: 400,
          type: 'error',
          title: err.message,
          message: err.description,
          errorCode: err.code,
          data: null,
        }
      }

      if (shiftException.employeeId !== employeeId) {
        const err = EMPLOYEE_VACATION_ARCHIVE_ERROR_CODES.SHIFT_EXCEPTION_NOT_FOUND
        return {
          status: 400,
          type: 'error',
          title: err.message,
          message: 'La excepción de turno no pertenece al empleado del archivador.',
          errorCode: err.code,
          data: null,
        }
      }
    }

    const content = await EmployeeVacationArchiveContent.findOrFail(employeeVacationArchiveContentId)
    await content.related('shiftExceptions').attach(shiftExceptionIds)
    return {
      status: 200,
      type: 'success',
      title: 'Vinculado',
      message: 'Excepciones de turno vinculadas a la evidencia',
      data: null,
    }
  }

  /**
   * Actualiza un contenido: reemplaza archivo (opcional), descripción y/o excepciones de turno vinculadas.
   */
  async updateContent(
    employeeVacationArchiveId: number,
    employeeVacationArchiveContentId: number,
    payload: {
      file?: IncomingFile
      description?: string | null
      shiftExceptionIds?: number[]
    },
    uploadService: UploadService
  ): Promise<CreateContentResult> {
    const content = await EmployeeVacationArchiveContent.query()
      .whereNull('employee_vacation_archive_content_deleted_at')
      .where('employee_vacation_archive_content_id', employeeVacationArchiveContentId)
      .where('employee_vacation_archive_id', employeeVacationArchiveId)
      .preload('employeeVacationArchive')
      .first()

    if (!content) {
      const err = EMPLOYEE_VACATION_ARCHIVE_ERROR_CODES.CONTENT_NOT_FOUND
      return {
        status: 404,
        type: 'error',
        title: err.message,
        message: err.description,
        errorCode: err.code,
        data: null,
      }
    }

    const archive = content.employeeVacationArchive

    if (payload.file?.tmpPath) {
      if (payload.file.size > EMPLOYEE_VACATION_ARCHIVE_MAX_FILE_SIZE) {
        const err = EMPLOYEE_VACATION_ARCHIVE_ERROR_CODES.FILE_TOO_LARGE
        return {
          status: 400,
          type: 'error',
          title: err.message,
          message: err.description,
          errorCode: err.code,
          data: null,
        }
      }
      const ext = (payload.file.extname || '').toLowerCase()
      if (!EMPLOYEE_VACATION_ARCHIVE_ALLOWED_EXTENSIONS.includes(ext)) {
        const err = EMPLOYEE_VACATION_ARCHIVE_ERROR_CODES.INVALID_FILE_TYPE
        return {
          status: 400,
          type: 'error',
          title: err.message,
          message: err.description,
          errorCode: err.code,
          data: null,
        }
      }
      const folderName = `employee-vacation-archives/${employeeVacationArchiveId}`
      const newKey = await uploadService.fileUpload(payload.file, 'employee-record-document', folderName)
      if (newKey === 'file_not_found' || newKey === 'S3Producer.fileUpload') {
        const err = SYSTEM_SETTING_ERROR_CODES.UPLOAD_ERROR
        return {
          status: 500,
          type: 'error',
          title: err.message,
          message: err.description,
          errorCode: err.code,
          data: null,
        }
      }
      const oldKey = content.employeeVacationArchiveContentFile
      if (oldKey) await uploadService.deleteFile(oldKey)
      content.employeeVacationArchiveContentFile = newKey
    }

    if (payload.description !== undefined) {
      content.employeeVacationArchiveContentDescription = payload.description ?? ''
    }

    if (payload.shiftExceptionIds !== undefined) {
      await content.related('shiftExceptions').detach()
      if (payload.shiftExceptionIds.length > 0) {
        const validation = await this.validateAndAttachShiftExceptions(
          content.employeeVacationArchiveContentId,
          archive.employeeId,
          payload.shiftExceptionIds
        )
        if (validation.status !== 200) {
          return validation as CreateContentResult
        }
      }
    }

    await content.save()
    await content.load('shiftExceptions', (q) => q.preload('exceptionType'))

    return {
      status: 200,
      type: 'success',
      title: 'Evidencia actualizada',
      message: 'El contenido fue actualizado correctamente',
      data: content,
    }
  }

  /**
   * Obtiene un contenido por ID
   */
  async findById(employeeVacationArchiveContentId: number) {
    return await EmployeeVacationArchiveContent.query()
      .whereNull('employee_vacation_archive_content_deleted_at')
      .where('employee_vacation_archive_content_id', employeeVacationArchiveContentId)
      .preload('employeeVacationArchive')
      .preload('shiftExceptions', (q) => q.whereNull('shift_exceptions_deleted_at').preload('exceptionType'))
      .first()
  }

  /**
   * Lista contenidos de un archivador
   */
  async listByArchiveId(employeeVacationArchiveId: number) {
    return await EmployeeVacationArchiveContent.query()
      .whereNull('employee_vacation_archive_content_deleted_at')
      .where('employee_vacation_archive_id', employeeVacationArchiveId)
      .preload('shiftExceptions', (q) => q.whereNull('shift_exceptions_deleted_at').preload('exceptionType'))
      .orderBy('employee_vacation_archive_content_created_at', 'desc')
  }

  /**
   * Elimina un contenido (soft delete) y opcionalmente el archivo en S3
   */
  async deleteContent(
    content: EmployeeVacationArchiveContent,
    uploadService: UploadService
  ): Promise<{
    status: number
    type: string
    title: string
    message: string
    errorCode?: string
    data: EmployeeVacationArchiveContent | null
  }> {
    await content.related('shiftExceptions').detach()
    const fileKey = content.employeeVacationArchiveContentFile
    if (fileKey) {
      const deleteResult = await uploadService.deleteFile(fileKey)
      if (deleteResult.status !== 200 && deleteResult.status !== 404) {
        const err = SYSTEM_SETTING_ERROR_CODES.DELETE_ERROR
        await content.delete()
        return {
          status: 500,
          type: 'warning',
          title: err.message,
          message: err.description,
          errorCode: err.code,
          data: content,
        }
      }
    }
    await content.delete()
    return {
      status: 200,
      type: 'success',
      title: 'Evidencia eliminada',
      message: 'El archivo de evidencia fue eliminado correctamente',
      data: content,
    }
  }

  /**
   * Genera URL temporal de descarga para un contenido (archivo privado en S3)
   */
  async getDownloadUrl(
    content: EmployeeVacationArchiveContent,
    uploadService: UploadService,
    expireSeconds = 60 * 60 * 24
  ) {
    const url = await uploadService.getDownloadLink(
      content.employeeVacationArchiveContentFile,
      expireSeconds
    )
    return url
  }
}
