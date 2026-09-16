import { HttpContext } from '@adonisjs/core/http'
import AircraftProceedingFile from '../models/aircraft_proceeding_file.js'
import {
  createAircraftProceedingFileValidator,
  updateAircraftProceedingFileValidator,
} from '../validators/aircraft_proceeding_file.js'
import { formatResponse } from '../helpers/responseFormatter.js'
import AircraftProceedingFileService from '#services/aircraft_proceeding_file_service'
import { AircraftProceedingFileFilterInterface } from '../interfaces/aircraft_proceeding_file_filter_interface.js'

export default class AircraftProceedingFileController {
  /**
   * @swagger
   * tags:
   *   - name: Aircrafts Proceeding Files
   *     description: Operations related to aircrafts proceeding files
   *
   * /api/aircraft-proceeding-files:
   *   get:
   *     tags:
   *       - Aircrafts Proceeding Files
   *     summary: Obtener todos los registros de archivos de procedimientos de aeronaves
   *     responses:
   *       200:
   *         description: Lista de archivos de procedimientos de aeronaves
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: success
   *                 data:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/AircraftProceedingFile'
   */
  async index({ response }: HttpContext) {
    const files = await AircraftProceedingFile.all()
    return response.json({
      status: 'success',
      data: files,
    })
  }
  /**
   * @swagger
   * /api/aircraft-proceeding-files:
   *   post:
   *     tags:
   *       - Aircrafts Proceeding Files
   *     summary: Crear un nuevo archivo de procedimiento de aeronave
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/CreateAircraftProceedingFile'
   *     responses:
   *       200:
   *         description: Archivo de procedimiento de aeronave creado exitosamente
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: success
   *                 message:
   *                   type: string
   *                   example: Aircraft proceeding file created successfully.
   *                 data:
   *                   $ref: '#/components/schemas/AircraftProceedingFile'
   */
  async store({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const data = await request.validateUsing(createAircraftProceedingFileValidator)
      const aircraftId = request.input('aircraftId')
      const proceedingFileId = request.input('proceedingFileId')
      const aircraftProceedingFile = {
        aircraftId: aircraftId,
        proceedingFileId: proceedingFileId,
      } as AircraftProceedingFile
      const aircraftProceedingFileService = new AircraftProceedingFileService()
      const exist = await aircraftProceedingFileService.verifyInfoExist(aircraftProceedingFile)
      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...data },
        }
      }
      const verifyInfo = await aircraftProceedingFileService.verifyInfo(aircraftProceedingFile)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...data },
        }
      }
      const newAircraftProceedingFile =
        await aircraftProceedingFileService.create(aircraftProceedingFile)
      if (newAircraftProceedingFile) {
        response.status(201)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_created_successfully'),
          data: { aircraftProceedingFile: newAircraftProceedingFile },
        }
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: messageError,
      }
    }
  }
  /**
   * @swagger
   * /api/aircraft-proceeding-files/{id}:
   *   get:
   *     tags:
   *       - Aircrafts Proceeding Files
   *     summary: Mostrar un archivo de procedimiento de aeronave por ID
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Archivo de procedimiento de aeronave encontrado
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: success
   *                 data:
   *                   $ref: '#/components/schemas/AircraftProceedingFile'
   */
  async show({ params, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const aircraftProceedingFileId = params.id
      if (!aircraftProceedingFileId) {
        response.status(400)
        return {
          type: 'warning',
          title: t('resource'),
          message: t('resource_id_was_not_found'),
          data: { aircraftProceedingFileId },
        }
      }
      const aircraftProceedingFileService = new AircraftProceedingFileService()
      const showAircraftProceedingFile =
        await aircraftProceedingFileService.show(aircraftProceedingFileId)
      if (!showAircraftProceedingFile) {
        response.status(404)
        return {
          type: 'warning',
          title: t('resource'),
          message: t('resource_was_not_found_with_the_entered_id'),
          data: { aircraftProceedingFileId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_deleted_successfully'),
          data: { aircraftProceedingFile: showAircraftProceedingFile },
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }
  /**
   * @swagger
   * /api/aircraft-proceeding-files/{id}:
   *   put:
   *     tags:
   *       - Aircrafts Proceeding Files
   *     summary: Actualizar un archivo de procedimiento de aeronave por ID
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/UpdateAircraftProceedingFile'
   *     responses:
   *       200:
   *         description: Archivo de procedimiento de aeronave actualizado exitosamente
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: success
   *                 message:
   *                   type: string
   *                   example: Aircraft proceeding file updated successfully.
   *                 data:
   *                   $ref: '#/components/schemas/AircraftProceedingFile'
   */
  async update({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const aircraftProceedingFileId = request.input('aircraftProceedingFileId')
      const aircraftId = request.input('aircraftId')
      const proceedingFileId = request.input('proceedingFileId')
      const aircraftProceedingFile = {
        aircraftProceedingFileId: aircraftProceedingFileId,
        aircraftId: aircraftId,
        proceedingFileId: proceedingFileId,
      } as AircraftProceedingFile
      if (!aircraftProceedingFileId) {
        response.status(400)
        return {
          type: 'warning',
          title: t('resource'),
          message: t('resource_id_was_not_found'),
          data: { ...aircraftProceedingFile },
        }
      }
      const currentAircraftProceedingFile = await AircraftProceedingFile.query()
        .whereNull('aircraft_proceeding_file_deleted_at')
        .where('aircraft_proceeding_file_id', aircraftProceedingFileId)
        .first()
      if (!currentAircraftProceedingFile) {
        response.status(404)
        return {
          type: 'warning',
          title: t('resource'),
          message: t('resource_was_not_found_with_the_entered_id'),
          data: { ...aircraftProceedingFile },
        }
      }
      const aircraftProceedingFileService = new AircraftProceedingFileService()
      const data = await request.validateUsing(updateAircraftProceedingFileValidator)
      const exist = await aircraftProceedingFileService.verifyInfoExist(aircraftProceedingFile)
      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...data },
        }
      }
      const verifyInfo = await aircraftProceedingFileService.verifyInfo(aircraftProceedingFile)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...data },
        }
      }
      const updateAircraftProceedingFile = await aircraftProceedingFileService.update(
        currentAircraftProceedingFile,
        aircraftProceedingFile
      )
      if (updateAircraftProceedingFile) {
        response.status(200)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_updated_successfully'),
          data: { aircraftProceedingFile: updateAircraftProceedingFile },
        }
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: messageError,
      }
    }
  }
  /**
   * @swagger
   * /api/aircraft-proceeding-files/{id}:
   *   delete:
   *     tags:
   *       - Aircrafts Proceeding Files
   *     summary: Eliminar un archivo de procedimiento de aeronave por ID
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Archivo de procedimiento de aeronave eliminado exitosamente
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: success
   *                 message:
   *                   type: string
   *                   example: Aircraft proceeding file deleted successfully.
   */
  async destroy({ params, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    const file = await AircraftProceedingFile.findOrFail(params.id)
    await file.delete()

    return response.json({
      status: 'success',
      message: t('resource_was_deleted_successfully'),
    })
  }

  /**
   * @swagger
   * /api/aircraft-proceeding-files/{aircraftId}/proceeding-files:
   *   get:
   *     tags:
   *       - Aircrafts Proceeding Files
   *     summary: Obtener archivos de procedimiento de aeronave
   *     parameters:
   *       - in: path
   *         name: aircraftId
   *         required: true
   *         description: ID de la aeronave para la que se desean obtener los archivos de procedimiento.
   *         schema:
   *           type: string
   *           example: "12345"  # Reemplaza con un ID de aeronave de ejemplo
   *       - in: query
   *         name: page
   *         required: false
   *         description: Número de página para la paginación de resultados.
   *         schema:
   *           type: integer
   *           default: 1
   *       - in: query
   *         name: limit
   *         required: false
   *         description: Número de resultados por página.
   *         schema:
   *           type: integer
   *           default: 10
   *       - in: query
   *         name: type
   *         required: false
   *         description: Proceeding file type id to show only files with the type
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Archivos de procedimiento de aeronave obtenidos exitosamente
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: success
   *                 message:
   *                   type: string
   *                   example: Proceeding files fetched successfully.
   *                 data:
   *                   type: object
   *                   properties:
   *                     total:
   *                       type: integer
   *                       example: 2
   *                     per_page:
   *                       type: integer
   *                       example: 10
   *                     current_page:
   *                       type: integer
   *                       example: 1
   *                     last_page:
   *                       type: integer
   *                       example: 1
   *                     data:
   *                       type: array
   *                       items:
   *                         $ref: '#/components/schemas/AircraftProceedingFile'  # Asegúrate de definir este esquema en tu documentación
   *       400:
   *         description: Error de solicitud, ID de aeronave no proporcionado
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: warning
   *                 message:
   *                   type: string
   *                   example: Aircraft ID not found
   *                 data:
   *                   type: object
   *                   properties:
   *                     aircraftId:
   *                       type: string
   *                       example: null
   *       404:
   *         description: No se encontraron archivos de procedimiento
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: warning
   *                 message:
   *                   type: string
   *                   example: No proceeding files found
   *                 data:
   *                   type: object
   *                   properties:
   *                     aircraftId:
   *                       type: string
   *                       example: "12345"
   *       500:
   *         description: Error en el servidor
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: error
   *                 message:
   *                   type: string
   *                   example: Server error
   *                 data:
   *                   type: object
   *                   properties:
   *                     error:
   *                       type: string
   *                       example: Unexpected error occurred on the server.
   */
  async getAircraftProceedingFiles({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const aircraftId = request.param('aircraftId')
      const fileType = request.input('type')

      if (!aircraftId) {
        response.status(400)
        return formatResponse('warning', t('resource'), t('resource_id_was_not_found'), {
          aircraftId,
        })
      }

      const page = request.input('page', 1)
      const limit = request.input('limit', 10)

      const mainQuery = AircraftProceedingFile.query()
        .whereNull('deletedAt')
        .where('aircraftId', aircraftId)
        .whereHas('proceedingFile', (fileQuery) => {
          fileQuery.if(fileType, (query) => {
            query.where('proceedingFileTypeId', fileType)
          })
        })
        .preload('proceedingFile', (fileQuery) => {
          fileQuery.preload('proceedingFileType')
          fileQuery.if(fileType, (query) => {
            query.where('proceedingFileTypeId', fileType)
          })
        })
        .orderBy('aircraftProceedingFileCreatedAt', 'desc')

      const aircraftProceedingFiles = await mainQuery.paginate(page, limit)

      return response
        .status(200)
        .json(
          formatResponse(
            'success',
            t('resources'),
            t('resources_were_found_successfully'),
            aircraftProceedingFiles.toJSON()
          )
        )
    } catch (error) {
      response.status(500)
      return formatResponse(
        'error',
        t('server_error'),
        t('an_unexpected_error_has_occurred_on_the_server'),
        { error: error.message }
      )
    }
  }

  /**
   * @swagger
   * /api/aircraft-proceeding-files/get-expired-and-expiring:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Aircrafts Proceeding Files
   *     summary: get expired and expiring proceeding files by date
   *     produces:
   *       - application/json
   *     parameters:
   *       - name: dateStart
   *         in: query
   *         required: false
   *         description: Date start (YYYY-MM-DD)
   *         format: date
   *         schema:
   *           type: string
   *       - name: dateEnd
   *         in: query
   *         required: false
   *         description: Date end (YYYY-MM-DD)
   *         format: date
   *         schema:
   *           type: string
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async getExpiresAndExpiring({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const dateStart = request.input('dateStart')
      const dateEnd = request.input('dateEnd')
      const filters = {
        dateStart: dateStart,
        dateEnd: dateEnd,
      } as AircraftProceedingFileFilterInterface
      const aircraftProceddingFileService = new AircraftProceedingFileService()
      const aircraftProceedingFiles =
        await aircraftProceddingFileService.getExpiredAndExpiring(filters)
      response.status(200)
      return {
        type: 'success',
        title: t('resources'),
        message: t('resources_were_found_successfully'),
        data: {
          aircraftProceedingFiles: aircraftProceedingFiles,
        },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }
}
