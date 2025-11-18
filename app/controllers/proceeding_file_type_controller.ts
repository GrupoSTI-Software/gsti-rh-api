import { HttpContext } from '@adonisjs/core/http'
import { ProceedingFileTypeFilterSearchInterface } from '../interfaces/proceeding_file_type_filter_search_interface.js'
import ProceedingFileTypeService from '#services/proceeding_file_type_service'
import ProceedingFileType from '#models/proceeding_file_type'
import { createProceedingFileTypeValidator, createEmployeeProceedingFileTypeValidator } from '#validators/proceeding_file_type'

export default class ProceedingFileTypeController {
  /**
   * @swagger
   * /api/proceeding-file-types:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Proceeding File Types
   *     summary: get all
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search
   *         schema:
   *           type: string
   *       - name: page
   *         in: query
   *         required: true
   *         description: The page number for pagination
   *         default: 1
   *         schema:
   *           type: integer
   *       - name: limit
   *         in: query
   *         required: true
   *         description: The number of records per page
   *         default: 100
   *         schema:
   *           type: integer
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
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Object processed
   *       '404':
   *         description: The resource could not be found
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
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request.
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
   *                   description: Response message
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
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async index({ request, response }: HttpContext) {
    try {
      const search = request.input('search')
      const page = request.input('page', 1)
      const limit = request.input('limit', 100)
      const filters = {
        search: search,
        page: page,
        limit: limit,
      } as ProceedingFileTypeFilterSearchInterface
      const proceedingFileTypeService = new ProceedingFileTypeService()
      const proceedingFileTypes = await proceedingFileTypeService.index(filters)
      response.status(200)
      return {
        type: 'success',
        title: 'Proceeding file types',
        message: 'The proceeding file types were found successfully',
        data: {
          proceedingFileTypes,
        },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/proceeding-file-types/by-area/{areaToUse}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Proceeding File Types
   *     summary: get proceeding file types by area to use
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: areaToUse
   *         schema:
   *           type: string
   *         description: Proceeding file type area to use
   *         required: true
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
  async indexByArea({ request, response }: HttpContext) {
    try {
      const areaToUse = request.param('areaToUse')
      if (!areaToUse) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The proceeding file type area to use was not found',
          data: { areaToUse },
        }
      }
      const proceedingFileTypeService = new ProceedingFileTypeService()
      const proceedingFileTypes = await proceedingFileTypeService.indexByArea(areaToUse)
      response.status(200)
      return {
        type: 'success',
        title: 'Proceeding file types',
        message: 'The proceeding file types were found successfully',
        data: {
          proceedingFileTypes,
        },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/proceeding-file-types:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Proceeding File Types
   *     summary: create new proceeding file type
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *        multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               proceedingFileTypeName:
   *                 type: string
   *                 description: Proceeding file type name
   *                 required: true
   *                 default: ''
   *               proceedingFileTypeSlug:
   *                 type: string
   *                 description: Proceeding file type slug
   *                 required: true
   *                 default: ''
   *               proceedingFileTypeAreaToUse:
   *                 type: string
   *                 description: Proceeding file type area to use
   *                 required: true
   *                 default: ''
   *                 enum: [employee, pilot, customer, aircraft, flight-attendant]
   *               proceedingFileTypeActive:
   *                 type: boolean
   *                 description: Proceeding file type status
   *                 required: true
   *                 default: true
   *     responses:
   *       '201':
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
  async store({ request, response }: HttpContext) {
    try {
      const proceedingFileTypeName = request.input('proceedingFileTypeName')
      const proceedingFileTypeSlug = request.input('proceedingFileTypeSlug')
      const proceedingFileTypeAreaToUse = request.input('proceedingFileTypeAreaToUse')
      const proceedingFileTypeActive = request.input('proceedingFileTypeActive')
      const proceedingFileType = {
        proceedingFileTypeName: proceedingFileTypeName,
        proceedingFileTypeSlug: proceedingFileTypeSlug,
        proceedingFileTypeAreaToUse: proceedingFileTypeAreaToUse,
        proceedingFileTypeActive:
          proceedingFileTypeActive &&
          (proceedingFileTypeActive === 'true' || Number.parseInt(proceedingFileTypeActive) === 1)
            ? 1
            : 0,
      } as ProceedingFileType
      const proceedingFileTypeService = new ProceedingFileTypeService()
      const data = await request.validateUsing(createProceedingFileTypeValidator)
      const valid = await proceedingFileTypeService.verifyInfo(proceedingFileType)
      if (valid && valid.status !== 200) {
        response.status(valid.status)
        return {
          type: valid.type,
          title: valid.title,
          message: valid.message,
          data: { ...data },
        }
      }
      const newProceedingFileType = await proceedingFileTypeService.store(proceedingFileType)
      response.status(201)
      return {
        type: 'success',
        title: 'Proceeding file types',
        message: 'The proceeding file type was created successfully',
        data: { proceedingFileType: newProceedingFileType },
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/proceeding-file-types/create-employee-type:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Proceeding File Types
   *     summary: create new employee proceeding file type with automatic slug generation and business units
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               proceedingFileTypeName:
   *                 type: string
   *                 description: Proceeding file type name (slug will be auto-generated)
   *                 required: true
   *                 example: "Documentos de Contratación"
   *               proceedingFileTypeBusinessUnits:
   *                 type: string
   *                 description: Business units for the proceeding file type (automatically set from SYSTEM_BUSINESS environment variable)
   *                 required: false
   *                 example: "sae,sae-siler,sae-quorum"
   *               parentId:
   *                 type: number
   *                 description: Parent proceeding file type ID (optional)
   *                 required: false
   *                 example: 1
   *               proceedingFileTypeActive:
   *                 type: boolean
   *                 description: Proceeding file type status
   *                 required: false
   *                 default: true
   *     responses:
   *       '201':
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
   *                   properties:
   *                     proceedingFileType:
   *                       $ref: '#/components/schemas/ProceedingFileType'
   *                     proceedingFileTypeProperty:
   *                       $ref: '#/components/schemas/ProceedingFileTypeProperty'
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
   *       '404':
   *         description: Parent proceeding file type not found
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
  async createEmployeeType({ request, response }: HttpContext) {
    try {
      // Validar los datos de entrada
      const data = await request.validateUsing(createEmployeeProceedingFileTypeValidator)

      const proceedingFileTypeService = new ProceedingFileTypeService()
      const result = await proceedingFileTypeService.createEmployeeType({
        proceedingFileTypeName: data.proceedingFileTypeName,
        parentId: data.parentId,
        proceedingFileTypeActive: data.proceedingFileTypeActive,
      })

      if (result.status !== 201) {
        response.status(result.status)
        return {
          type: result.type,
          title: result.title,
          message: result.message,
          data: result.data,
        }
      }

      response.status(201)
      return {
        type: 'success',
        title: 'Proceeding file type created',
        message: 'The employee proceeding file type was created successfully with its default property',
        data: result.data,
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/proceeding-file-types/{proceedingFileTypeId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Proceeding File Types
   *     summary: update proceeding file types
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: proceedingFileTypeId
   *         schema:
   *           type: number
   *         description: proceeding file type id
   *         required: true
   *     requestBody:
   *       content:
   *        multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               proceedingFileTypeName:
   *                 type: string
   *                 description: Proceeding file type name
   *                 required: true
   *                 default: ''
   *               proceedingFileTypeSlug:
   *                 type: string
   *                 description: Proceeding file type slug
   *                 required: true
   *                 default: ''
   *               proceedingFileTypeAreaToUse:
   *                 type: string
   *                 description: Proceeding file type area to use
   *                 required: true
   *                 default: ''
   *                 enum: [employee, pilot, customer, aircraft, flight-attendant]
   *               proceedingFileTypeActive:
   *                 type: boolean
   *                 description: Proceeding file type status
   *                 required: true
   *                 default: true
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
  async update({ request, response }: HttpContext) {
    try {
      const proceedingFileTypeId = request.param('proceedingFileTypeId')
      const proceedingFileTypeName = request.input('proceedingFileTypeName')
      const proceedingFileTypeSlug = request.input('proceedingFileTypeSlug')
      const proceedingFileTypeAreaToUse = request.input('proceedingFileTypeAreaToUse')
      const proceedingFileTypeActive = request.input('proceedingFileTypeActive')
      const proceedingFileType = {
        proceedingFileTypeId: proceedingFileTypeId,
        proceedingFileTypeName: proceedingFileTypeName,
        proceedingFileTypeSlug: proceedingFileTypeSlug,
        proceedingFileTypeAreaToUse: proceedingFileTypeAreaToUse,
        proceedingFileTypeActive:
          proceedingFileTypeActive &&
          (proceedingFileTypeActive === 'true' || Number.parseInt(proceedingFileTypeActive) === 1)
            ? 1
            : 0,
      } as ProceedingFileType
      if (!proceedingFileTypeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The proceeding file type Id was not found',
          data: { ...proceedingFileType },
        }
      }
      const currentProceedingFileType = await ProceedingFileType.query()
        .whereNull('proceeding_file_type_deleted_at')
        .where('proceeding_file_type_id', proceedingFileTypeId)
        .first()
      if (!currentProceedingFileType) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The proceeding file type was not found',
          message: 'The proceeding file type was not found with the entered ID',
          data: { ...proceedingFileType },
        }
      }
      const proceedingFileTypeService = new ProceedingFileTypeService()
      const data = await request.validateUsing(createProceedingFileTypeValidator)
      const valid = await proceedingFileTypeService.verifyInfo(proceedingFileType)
      if (valid && valid.status !== 200) {
        response.status(valid.status)
        return {
          type: valid.type,
          title: valid.title,
          message: valid.message,
          data: { ...data },
        }
      }
      const updateProceedingFileType = await proceedingFileTypeService.update(
        currentProceedingFileType,
        proceedingFileType
      )
      response.status(200)
      return {
        type: 'success',
        title: 'Proceeding file types',
        message: 'The proceeding file type was updated successfully',
        data: { proceedingFileType: updateProceedingFileType },
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/proceeding-file-types/{proceedingFileTypeId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Proceeding File Types
   *     summary: delete proceeding file type
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: proceedingFileTypeId
   *         schema:
   *           type: number
   *         description: proceeding file type id
   *         required: true
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
  async delete({ request, response }: HttpContext) {
    try {
      const proceedingFileTypeId = request.param('proceedingFileTypeId')
      if (!proceedingFileTypeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The proceeding file type Id was not found',
          data: { proceedingFileTypeId },
        }
      }
      const currentProceedingFileType = await ProceedingFileType.query()
        .whereNull('proceeding_file_type_deleted_at')
        .where('proceeding_file_type_id', proceedingFileTypeId)
        .first()
      if (!currentProceedingFileType) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The proceeding file type was not found',
          message: 'The proceeding file type was not found with the entered ID',
          data: { proceedingFileTypeId },
        }
      }
      const proceedingFileTypeService = new ProceedingFileTypeService()
      const deleteProceedingFileType =
        await proceedingFileTypeService.delete(currentProceedingFileType)
      if (deleteProceedingFileType) {
        response.status(200)
        return {
          type: 'success',
          title: 'Proceeding file types',
          message: 'The proceeding file type was deleted successfully',
          data: { proceedingFileType: deleteProceedingFileType },
        }
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/proceeding-file-types/{proceedingFileTypeId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Proceeding File Types
   *     summary: get proceeding file type by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: proceedingFileTypeId
   *         schema:
   *           type: number
   *         description: proceeding file type id
   *         required: true
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
  async show({ request, response }: HttpContext) {
    try {
      const proceedingFileTypeId = request.param('proceedingFileTypeId')
      if (!proceedingFileTypeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The proceeding file type Id was not found',
          data: { proceedingFileTypeId },
        }
      }
      const proceedingFileTypeService = new ProceedingFileTypeService()
      const showProceedingFileType = await proceedingFileTypeService.show(proceedingFileTypeId)
      if (!showProceedingFileType) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The proceeding file type was not found',
          message: 'The proceeding file type was not found with the entered ID',
          data: { proceedingFileTypeId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Proceeding file types',
          message: 'The proceeding file type was found successfully',
          data: { proceedingFileType: showProceedingFileType },
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/proceeding-file-types/{proceedingFileTypeId}/get-legacy-emails:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Proceeding File Types
   *     summary: get legacy emails to proceeding file type by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: proceedingFileTypeId
   *         schema:
   *           type: number
   *         description: proceeding file type id
   *         required: true
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
  async getLegacyEmails({ request, response }: HttpContext) {
    try {
      const proceedingFileTypeId = request.param('proceedingFileTypeId')
      if (!proceedingFileTypeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The proceeding file type Id was not found',
          data: { proceedingFileTypeId },
        }
      }
      const proceedingFileTypeService = new ProceedingFileTypeService()
      const proceedingFileTypeEmails =
        await proceedingFileTypeService.getLegacyEmails(proceedingFileTypeId)
      response.status(200)
      return {
        type: 'success',
        title: 'Proceeding file types',
        message: 'The proceeding file type email were found successfully',
        data: { proceedingFileTypeEmails: proceedingFileTypeEmails },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }
}
