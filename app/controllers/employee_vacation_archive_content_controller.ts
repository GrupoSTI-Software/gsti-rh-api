import { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import UploadService from '#services/upload_service'
import EmployeeVacationArchiveContentService from '#services/employee_vacation_archive_content_service'
import { EMPLOYEE_VACATION_ARCHIVE_ERROR_CODES } from '../constants/employee_vacation_archive_error_codes.js'

export default class EmployeeVacationArchiveContentController {
  /**
   * @swagger
   * /api/employee-vacation-archives/{employeeVacationArchiveId}/contents:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Vacation Archive Contents
   *     summary: Subir evidencia (foto o PDF) al archivador
   *     description: "Sube un archivo al S3 y lo registra como contenido del archivador. Máximo 10MB. Tipos permitidos: jpg, jpeg, png, webp, pdf."
   *     parameters:
   *       - in: path
   *         name: employeeVacationArchiveId
   *         required: true
   *         schema:
   *           type: number
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               file:
   *                 type: string
   *                 format: binary
   *                 description: Archivo (imagen o PDF), máx. 5MB
   *               description:
   *                 type: string
   *                 description: Descripción opcional del archivo
   *               shiftExceptionIds:
   *                 type: array
   *                 items:
   *                   type: number
   *                 description: IDs de excepciones de turno (tipo vacation) a vincular a esta evidencia
   *     responses:
   *       '201':
   *         description: Archivo subido correctamente
   *       '400':
   *         description: Archivo no enviado, tipo no permitido o excede 5MB (VAC.ARCH.005, VAC.ARCH.006, VAC.ARCH.007)
   *       '404':
   *         description: Archivador no encontrado (VAC.ARCH.001)
   *       '500':
   *         description: Error al subir a S3 (SYS.CNFG.PRSS.016)
   */
  @inject()
  async store({ request, response }: HttpContext) {
    const employeeVacationArchiveId = Number(request.param('employeeVacationArchiveId'))
    if (!employeeVacationArchiveId) {
      return response.status(400).json({
        type: 'error',
        title: 'ID inválido',
        message: 'Se requiere employeeVacationArchiveId',
        errorCode: 'VAC.ARCH.VAL.002',
        data: null,
      })
    }

    const validationOptions = {
      types: ['image', 'document'],
      size: '5mb',
    }
    const file = request.file('file', validationOptions)
    const description = request.input('description') as string | undefined
    const rawIds = request.input('shiftExceptionIds')
    let shiftExceptionIds: number[] | undefined
    if (Array.isArray(rawIds)) {
      shiftExceptionIds = rawIds.map((id: unknown) => Number(id)).filter((n) => n > 0)
    } else if (typeof rawIds === 'string') {
      try {
        const parsed = JSON.parse(rawIds) as unknown
        shiftExceptionIds = Array.isArray(parsed)
          ? parsed.map((id: unknown) => Number(id)).filter((n) => n > 0)
          : undefined
      } catch {
        shiftExceptionIds = rawIds.split(',').map((s) => Number(s.trim())).filter((n) => n > 0)
      }
    }
    if (shiftExceptionIds?.length === 0) shiftExceptionIds = undefined

    const uploadService = new UploadService()
    const contentService = new EmployeeVacationArchiveContentService()

    const result = await contentService.createContent(
      employeeVacationArchiveId,
      file as any,
      description ?? null,
      uploadService,
      shiftExceptionIds
    )

    if (result.status !== 201) {
      return response.status(result.status).json({
        type: result.type,
        title: result.title,
        message: result.message,
        errorCode: result.errorCode,
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
   * /api/employee-vacation-archives/{employeeVacationArchiveId}/contents/{employeeVacationArchiveContentId}:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Vacation Archive Contents
   *     summary: Actualizar evidencia (contenido)
   *     description: "Actualiza un contenido existente. Se puede reemplazar el archivo, la descripción y/o las excepciones de turno vinculadas. Multipart: file (opcional), description (opcional), shiftExceptionIds (opcional)."
   *     parameters:
   *       - in: path
   *         name: employeeVacationArchiveId
   *         required: true
   *         schema:
   *           type: number
   *       - in: path
   *         name: employeeVacationArchiveContentId
   *         required: true
   *         schema:
   *           type: number
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             properties:
   *               file:
   *                 type: string
   *                 format: binary
   *               description:
   *                 type: string
   *               shiftExceptionIds:
   *                 type: array
   *                 items:
   *                   type: number
   *     responses:
   *       '200':
   *         description: Contenido actualizado
   *       '400':
   *         description: Validación (tipo/tamaño archivo o excepciones)
   *       '404':
   *         description: Contenido no encontrado (VAC.ARCH.008)
   *       '500':
   *         description: Error al subir a S3
   */
  async update({ request, response }: HttpContext) {
    const employeeVacationArchiveId = Number(request.param('employeeVacationArchiveId'))
    const employeeVacationArchiveContentId = Number(request.param('employeeVacationArchiveContentId'))
    if (!employeeVacationArchiveId || !employeeVacationArchiveContentId) {
      return response.status(400).json({
        type: 'error',
        title: 'ID inválido',
        message: 'Se requieren employeeVacationArchiveId y employeeVacationArchiveContentId',
        errorCode: 'VAC.ARCH.VAL.003',
        data: null,
      })
    }

    const validationOptions = { types: ['image', 'document'], size: '5mb' }
    const file = request.file('file', validationOptions)
    const description = request.input('description') as string | undefined
    const rawIds = request.input('shiftExceptionIds')
    let shiftExceptionIds: number[] | undefined
    if (Array.isArray(rawIds)) {
      shiftExceptionIds = rawIds.map((id: unknown) => Number(id)).filter((n) => n > 0)
    } else if (typeof rawIds === 'string') {
      try {
        const parsed = JSON.parse(rawIds) as unknown
        shiftExceptionIds = Array.isArray(parsed)
          ? parsed.map((id: unknown) => Number(id)).filter((n) => n > 0)
          : undefined
      } catch {
        shiftExceptionIds = rawIds.split(',').map((s) => Number(s.trim())).filter((n) => n > 0)
      }
    }
    if (shiftExceptionIds?.length === 0) shiftExceptionIds = undefined

    const uploadService = new UploadService()
    const contentService = new EmployeeVacationArchiveContentService()
    const result = await contentService.updateContent(
      employeeVacationArchiveId,
      employeeVacationArchiveContentId,
      {
        file: file as any,
        description: description !== undefined ? description : undefined,
        shiftExceptionIds,
      },
      uploadService
    )

    if (result.status !== 200) {
      return response.status(result.status).json({
        type: result.type,
        title: result.title,
        message: result.message,
        errorCode: result.errorCode,
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

  /**
   * @swagger
   * /api/employee-vacation-archives/{employeeVacationArchiveId}/contents:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Vacation Archive Contents
   *     summary: Listar contenidos (evidencias) del archivador
   *     parameters:
   *       - in: path
   *         name: employeeVacationArchiveId
   *         required: true
   *         schema:
   *           type: number
   *     responses:
   *       '200':
   *         description: Lista de contenidos
   *       '500':
   *         description: Error interno
   */
  async index({ request, response }: HttpContext) {
    const employeeVacationArchiveId = Number(request.param('employeeVacationArchiveId'))
    if (!employeeVacationArchiveId) {
      return response.status(400).json({
        type: 'error',
        title: 'ID inválido',
        message: 'Se requiere employeeVacationArchiveId',
        errorCode: 'VAC.ARCH.VAL.002',
        data: null,
      })
    }

    try {
      const contentService = new EmployeeVacationArchiveContentService()
      const contents = await contentService.listByArchiveId(employeeVacationArchiveId)
      return response.status(200).json({
        type: 'success',
        title: 'Contenidos del archivador',
        message: 'Lista de evidencias',
        data: contents,
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
   * /api/employee-vacation-archives/{employeeVacationArchiveId}/contents/{employeeVacationArchiveContentId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Vacation Archive Contents
   *     summary: Obtener un contenido por ID (con URL de descarga temporal)
   *     parameters:
   *       - in: path
   *         name: employeeVacationArchiveId
   *         required: true
   *         schema:
   *           type: number
   *       - in: path
   *         name: employeeVacationArchiveContentId
   *         required: true
   *         schema:
   *           type: number
   *     responses:
   *       '200':
   *         description: Contenido con downloadUrl temporal
   *       '404':
   *         description: Contenido no encontrado (VAC.ARCH.008)
   *       '500':
   *         description: Error interno
   */
  async show({ request, response }: HttpContext) {
    const contentId = Number(request.param('employeeVacationArchiveContentId'))
    if (!contentId) {
      return response.status(400).json({
        type: 'error',
        title: 'ID inválido',
        message: 'Se requiere employeeVacationArchiveContentId',
        errorCode: 'VAC.ARCH.VAL.003',
        data: null,
      })
    }

    const contentService = new EmployeeVacationArchiveContentService()
    const content = await contentService.findById(contentId)

    if (!content) {
      const err = EMPLOYEE_VACATION_ARCHIVE_ERROR_CODES.CONTENT_NOT_FOUND
      return response.status(404).json({
        type: 'error',
        title: err.message,
        message: err.description,
        errorCode: err.code,
        data: null,
      })
    }

    const uploadService = new UploadService()
    const downloadUrl = await contentService.getDownloadUrl(content, uploadService)

    return response.status(200).json({
      type: 'success',
      title: 'Contenido',
      message: 'Archivo de evidencia',
      data: {
        ...content.serialize(),
        downloadUrl: typeof downloadUrl === 'string' ? downloadUrl : null,
      },
    })
  }

  /**
   * @swagger
   * /api/employee-vacation-archives/{employeeVacationArchiveId}/contents/{employeeVacationArchiveContentId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Vacation Archive Contents
   *     summary: Eliminar evidencia (soft delete y borrado en S3)
   *     parameters:
   *       - in: path
   *         name: employeeVacationArchiveId
   *         required: true
   *         schema:
   *           type: number
   *       - in: path
   *         name: employeeVacationArchiveContentId
   *         required: true
   *         schema:
   *           type: number
   *     responses:
   *       '200':
   *         description: Contenido eliminado
   *       '404':
   *         description: Contenido no encontrado (VAC.ARCH.008)
   *       '500':
   *         description: Error al eliminar en S3 (SYS.CNFG.PRSS.017)
   */
  async destroy({ request, response }: HttpContext) {
    const contentId = Number(request.param('employeeVacationArchiveContentId'))
    if (!contentId) {
      return response.status(400).json({
        type: 'error',
        title: 'ID inválido',
        message: 'Se requiere employeeVacationArchiveContentId',
        errorCode: 'VAC.ARCH.VAL.003',
        data: null,
      })
    }

    const contentService = new EmployeeVacationArchiveContentService()
    const content = await contentService.findById(contentId)

    if (!content) {
      const err = EMPLOYEE_VACATION_ARCHIVE_ERROR_CODES.CONTENT_NOT_FOUND
      return response.status(404).json({
        type: 'error',
        title: err.message,
        message: err.description,
        errorCode: err.code,
        data: null,
      })
    }

    const uploadService = new UploadService()
    const result = await contentService.deleteContent(content, uploadService)

    if (result.status !== 200) {
      return response.status(result.status).json({
        type: result.type,
        title: result.title,
        message: result.message,
        errorCode: result.errorCode,
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
