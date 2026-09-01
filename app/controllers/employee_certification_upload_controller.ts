import type { HttpContext } from '@adonisjs/core/http'
import { isFileIntakeError, respondFileIntakeError } from '#helpers/file_intake_api_error'
import { DateTime } from 'luxon'
import EmployeeCertificationUploadService from '#services/employee_certification_upload_service'
import { EmployeeCertificationError } from '../exceptions/employee_certification_error.js'
import { EC_ERROR_CODES } from '../constants/employee_certification_error_codes.js'

export default class EmployeeCertificationUploadController {
  /**
   * @swagger
   * /api/employees/{employeeId}/certifications/{certificationId}/uploads:
   *   post:
   *     summary: Subir comprobante de certificación de un empleado
   *     description: |
   *       Recibe un archivo (PDF/JPG/JPEG/PNG, máx 10 MB) y la fecha de cumplimiento.
   *       Sube el archivo a S3 con ruta privada y persiste la fila en employee_certifications.
   *       Calcula employee_certification_expires_at automáticamente si la certificación
   *       tiene renewal_period_days.
   *     tags: [EmployeeCertificationUploads]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: certificationId
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required: [file, compliedAt]
   *             properties:
   *               file:
   *                 type: string
   *                 format: binary
   *                 description: Archivo PDF, JPG, JPEG o PNG (máx 10 MB)
   *               compliedAt:
   *                 type: string
   *                 format: date
   *                 description: Fecha de cumplimiento YYYY-MM-DD (no puede ser futura)
   *     responses:
   *       '201':
   *         description: Comprobante subido y fila persistida
   *       '400':
   *         description: Validación o archivo faltante
   *       '404':
   *         description: Empleado o certificación inexistente
   *       '413':
   *         description: Archivo supera 10 MB
   *       '415':
   *         description: Tipo de archivo no permitido
   *       '422':
   *         description: Fecha futura o certificación no aplicable a la BU del puesto
   */
  async store({ auth, params, request, response }: HttpContext) {
    try {
      const employeeId = this.parseId(params.employeeId)
      const certificationId = this.parseId(params.certificationId)

      const compliedAtRaw = request.input('compliedAt') as string | undefined
      if (!compliedAtRaw) {
        throw new EmployeeCertificationError(
          'El campo compliedAt es obligatorio.',
          EC_ERROR_CODES.VAL_INPUT,
          400
        )
      }

      const compliedAt = DateTime.fromISO(compliedAtRaw)
      if (!compliedAt.isValid) {
        throw new EmployeeCertificationError(
          'El campo compliedAt debe ser una fecha válida en formato YYYY-MM-DD.',
          EC_ERROR_CODES.VAL_INPUT,
          400
        )
      }

      const file = request.file('file')

      const service = new EmployeeCertificationUploadService()
      const result = await service.upload(employeeId, certificationId, file, compliedAt)

      await this.logAction(auth, request, 'store', employeeId, certificationId, result.employeeCertificationId)

      return response.status(201).json({
        type: 'success',
        title: 'Comprobante de certificación',
        message: 'Comprobante subido correctamente',
        data: { employeeCertification: result },
      })
    } catch (error) {
      return this.respondError(error, response)
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/certifications/{certificationId}/uploads:
   *   get:
   *     summary: Historial de comprobantes de una certificación del empleado
   *     description: |
   *       Devuelve todos los uploads activos (no borrados) del par empleado/certificación,
   *       ordenados por fecha de cumplimiento descendente.
   *       El campo isCurrent=true identifica el cumplimiento vigente (el más reciente).
   *       Los documentUrl son llaves S3 privadas; para descargar, usar el endpoint
   *       GET /uploads/:employeeCertificationId/download-url.
   *     tags: [EmployeeCertificationUploads]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: certificationId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200':
   *         description: Historial de cumplimientos
   *       '404':
   *         description: Empleado o certificación inexistente
   */
  async index({ params, response }: HttpContext) {
    try {
      const employeeId = this.parseId(params.employeeId)
      const certificationId = this.parseId(params.certificationId)

      const service = new EmployeeCertificationUploadService()
      const history = await service.getHistory(employeeId, certificationId)

      return response.status(200).json({
        type: 'success',
        title: 'Historial de comprobantes',
        message: 'Historial obtenido correctamente',
        data: { employeeCertificationUploads: history },
      })
    } catch (error) {
      return this.respondError(error, response)
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/certifications/{certificationId}/uploads/{employeeCertificationId}/download-url:
   *   get:
   *     summary: Obtener URL pre-firmada de descarga (5 min de expiración)
   *     tags: [EmployeeCertificationUploads]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: certificationId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: employeeCertificationId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200':
   *         description: URL temporal de descarga
   *       '404':
   *         description: Cumplimiento no encontrado
   */
  async downloadUrl({ params, response }: HttpContext) {
    try {
      const employeeId = this.parseId(params.employeeId)
      const certificationId = this.parseId(params.certificationId)
      const employeeCertificationId = this.parseId(params.employeeCertificationId)

      const history = await new EmployeeCertificationUploadService().getHistory(
        employeeId,
        certificationId
      )
      const record = history.find((r) => r.employeeCertificationId === employeeCertificationId)

      if (!record) {
        throw new EmployeeCertificationError(
          'El cumplimiento no existe o no pertenece a este empleado y certificación.',
          EC_ERROR_CODES.UPLOAD_NOT_FOUND,
          404
        )
      }

      const service = new EmployeeCertificationUploadService()
      const url = await service.getDownloadUrl(record.documentUrl)

      return response.status(200).json({
        type: 'success',
        title: 'URL de descarga',
        message: 'URL generada correctamente (válida 5 minutos)',
        data: { downloadUrl: url },
      })
    } catch (error) {
      return this.respondError(error, response)
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/certifications/{certificationId}/uploads/{employeeCertificationId}:
   *   delete:
   *     summary: Borrar (soft delete) un comprobante de certificación
   *     description: |
   *       Solo permite borrar el cumplimiento más reciente (no borrado) del par
   *       empleado/certificación. Si se intenta borrar uno anterior responde 403.
   *       Al borrar, el cumplimiento anterior automáticamente vuelve a ser el vigente.
   *     tags: [EmployeeCertificationUploads]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: certificationId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: employeeCertificationId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '204':
   *         description: Sin cuerpo
   *       '403':
   *         description: No es el cumplimiento más reciente
   *       '404':
   *         description: Cumplimiento no encontrado
   */
  async destroy({ auth, params, response }: HttpContext) {
    try {
      const employeeId = this.parseId(params.employeeId)
      const certificationId = this.parseId(params.certificationId)
      const employeeCertificationId = this.parseId(params.employeeCertificationId)

      const service = new EmployeeCertificationUploadService()
      await service.remove(employeeId, certificationId, employeeCertificationId)

      await this.logAction(
        auth,
        null,
        'delete',
        employeeId,
        certificationId,
        employeeCertificationId
      )

      return response.noContent()
    } catch (error) {
      return this.respondError(error, response)
    }
  }

  private parseId(raw: string | number): number {
    const id = Number(raw)
    if (Number.isNaN(id) || id <= 0) {
      throw new EmployeeCertificationError(
        'El identificador proporcionado es inválido.',
        EC_ERROR_CODES.VAL_INPUT,
        400
      )
    }
    return id
  }

  private respondError(error: unknown, response: HttpContext['response']) {
    // El rechazo de un archivo es 422 con triplete: sin esta rama el resolver
    // del modulo lo degrada a un 500 genérico y el usuario nunca sabe que su
    // archivo fue rechazado ni por que.
    if (isFileIntakeError(error)) {
      return respondFileIntakeError(response, error)
    }

    if (error instanceof EmployeeCertificationError) {
      return response.status(error.httpStatus).json({
        type: 'error',
        title: 'Error',
        message: error.message,
        errorCode: error.errorCode,
        data: null,
      })
    }
    const err = error as { message?: string }
    return response.status(500).json({
      type: 'error',
      title: 'Error',
      message: err?.message ?? 'Error inesperado',
      errorCode: EC_ERROR_CODES.SYS_UNHANDLED,
      data: null,
    })
  }

  private async logAction(
    auth: HttpContext['auth'],
    request: HttpContext['request'] | null,
    verb: string,
    employeeId: number,
    certificationId: number,
    employeeCertificationId: number
  ) {
    const userId = auth.user?.userId
    if (!userId) return
    try {
      const { LogStore } = await import('#models/MongoDB/log_store')
      const rawHeaders = request?.request?.rawHeaders ?? []
      const getHeader = (name: string) => {
        const i = rawHeaders.indexOf(name)
        return i !== -1 ? rawHeaders[i + 1] : ''
      }
      await LogStore.set('log_employee_certification_uploads', {
        user_id: userId,
        action: verb,
        user_agent: getHeader('User-Agent'),
        sec_ch_ua_platform: getHeader('sec-ch-ua-platform'),
        sec_ch_ua: getHeader('sec-ch-ua'),
        origin: getHeader('Origin'),
        date: DateTime.local().setZone('utc').toISO() ?? '',
        record_current: { employeeId, certificationId, employeeCertificationId },
      })
    } catch {
      //
    }
  }
}
