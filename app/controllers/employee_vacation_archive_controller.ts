import { HttpContext } from '@adonisjs/core/http'
import EmployeeVacationArchiveService from '#services/employee_vacation_archive_service'
import UploadService from '#services/upload_service'
import { EMPLOYEE_VACATION_ARCHIVE_ERROR_CODES } from '../constants/employee_vacation_archive_error_codes.js'

export default class EmployeeVacationArchiveController {
  /**
   * @swagger
   * /api/employee-vacation-archives:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Vacation Archives
   *     summary: Crear archivador de vacaciones
   *     description: Crea un archivador (contenedor) para subir después evidencias (fotos/PDF) de vacaciones del empleado.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - employeeId
   *               - vacationSettingId
   *             properties:
   *               employeeId:
   *                 type: number
   *               vacationSettingId:
   *                 type: number
   *     responses:
   *       '201':
   *         description: Archivador creado correctamente
   *       '404':
   *         description: Empleado o configuración no encontrados (VAC.ARCH.002, VAC.ARCH.004)
   *       '500':
   *         description: Error interno
   */
  async store({ request, response }: HttpContext) {
    const body = request.only(['employeeId', 'vacationSettingId'])
    const employeeId = Number(body.employeeId)
    const vacationSettingId = Number(body.vacationSettingId)

    if (!employeeId || !vacationSettingId) {
      return response.status(400).json({
        type: 'error',
        title: 'Datos incompletos',
        message: 'Se requieren employeeId y vacationSettingId',
        errorCode: 'VAC.ARCH.VAL.001',
        data: null,
      })
    }

    const service = new EmployeeVacationArchiveService()
    const result = await service.create({
      employeeId,
      vacationSettingId,
    })

    if (result.status !== 201) {
      return response.status(result.status).json({
        type: result.type,
        title: result.title,
        message: result.message,
        errorCode: (result as { errorCode?: string }).errorCode,
        data: result.data,
      })
    }

    return response.status(201).json({
      type: result.type,
      title: result.title,
      message: result.message,
      data: result.data,
    })
  }

  /**
   * @swagger
   * /api/employee-vacation-archives:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Vacation Archives
   *     summary: Listar archivadores de vacaciones
   *     parameters:
   *       - in: query
   *         name: employeeId
   *         schema:
   *           type: number
   *       - in: query
   *         name: vacationSettingId
   *         schema:
   *           type: number
   *       - in: query
   *         name: shiftExceptionId
   *         schema:
   *           type: number
   *         description: Archivadores que contienen esta excepción de turno
   *     responses:
   *       '200':
   *         description: Lista de archivadores
   *       '500':
   *         description: Error interno
   */
  async index({ request, response }: HttpContext) {
    try {
      const employeeId = request.input('employeeId') ? Number(request.input('employeeId')) : undefined
      const vacationSettingId = request.input('vacationSettingId')
        ? Number(request.input('vacationSettingId'))
        : undefined
      const shiftExceptionId = request.input('shiftExceptionId')
        ? Number(request.input('shiftExceptionId'))
        : undefined

      const service = new EmployeeVacationArchiveService()
      const archives = await service.list({
        employeeId,
        vacationSettingId,
        shiftExceptionId,
      })

      return response.status(200).json({
        type: 'success',
        title: 'Archivadores',
        message: 'Lista de archivadores de vacaciones',
        data: archives,
      })
    } catch (error) {
      return response.status(500).json({
        type: 'error',
        title: 'Error del servidor',
        message: 'Ocurrió un error inesperado',
        data: { error: (error as Error).message },
      })
    }
  }

  /**
   * @swagger
   * /api/employee-vacation-archives/{employeeVacationArchiveId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Vacation Archives
   *     summary: Obtener archivador por ID (con contenidos y excepciones de turno vinculadas)
   *     parameters:
   *       - in: path
   *         name: employeeVacationArchiveId
   *         required: true
   *         schema:
   *           type: number
   *     responses:
   *       '200':
   *         description: Archivador con sus contenidos
   *       '404':
   *         description: Archivador no encontrado (VAC.ARCH.001)
   *       '500':
   *         description: Error interno
   */
  async show({ request, response }: HttpContext) {
    const id = Number(request.param('employeeVacationArchiveId'))
    if (!id) {
      return response.status(400).json({
        type: 'error',
        title: 'ID inválido',
        message: 'Se requiere employeeVacationArchiveId',
        errorCode: 'VAC.ARCH.VAL.002',
        data: null,
      })
    }

    const service = new EmployeeVacationArchiveService()
    const archive = await service.findById(id)

    if (!archive) {
      const err = EMPLOYEE_VACATION_ARCHIVE_ERROR_CODES.ARCHIVE_NOT_FOUND
      return response.status(404).json({
        type: 'error',
        title: err.message,
        message: err.description,
        errorCode: err.code,
        data: null,
      })
    }

    return response.status(200).json({
      type: 'success',
      title: 'Archivador',
      message: 'Archivador de vacaciones',
      data: archive,
    })
  }

  /**
   * @swagger
   * /api/employee-vacation-archives/{employeeVacationArchiveId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Vacation Archives
   *     summary: Eliminar archivador de vacaciones
   *     description: Elimina el archivador (soft delete) y toda la información relacionada: contenidos (evidencias) con sus archivos en S3 y relaciones pivote con excepciones de turno.
   *     parameters:
   *       - in: path
   *         name: employeeVacationArchiveId
   *         required: true
   *         schema:
   *           type: number
   *     responses:
   *       '200':
   *         description: Archivador eliminado
   *       '404':
   *         description: Archivador no encontrado (VAC.ARCH.001)
   *       '500':
   *         description: Error interno
   */
  async destroy({ request, response }: HttpContext) {
    const id = Number(request.param('employeeVacationArchiveId'))
    if (!id) {
      return response.status(400).json({
        type: 'error',
        title: 'ID inválido',
        message: 'Se requiere employeeVacationArchiveId',
        errorCode: 'VAC.ARCH.VAL.002',
        data: null,
      })
    }

    const service = new EmployeeVacationArchiveService()
    const uploadService = new UploadService()
    const result = await service.deleteById(id, uploadService)

    if (result.status !== 200) {
      return response.status(result.status).json({
        type: result.type,
        title: result.title,
        message: result.message,
        errorCode: (result as { errorCode?: string }).errorCode,
        data: result.data,
      })
    }

    return response.status(200).json({
      type: result.type,
      title: result.title,
      message: result.message,
      data: result.data,
    })
  }
}
