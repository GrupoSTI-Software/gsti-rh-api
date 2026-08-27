import { HttpContext } from '@adonisjs/core/http'
import { ProceedingFileTypePropertyFilterSearchInterface } from '../interfaces/proceeding_file_type_property_filter_search_interface.js'
import ProceedingFileTypePropertyService from '#services/proceeding_file_type_property_service'
import { ProceedingFileTypePropertyCategoryFilterInterface } from '../interfaces/proceeding_file_type_property_category_filter_interface.js'
import { createProceedingFileTypePropertyValidator, createMultipleProceedingFileTypePropertiesValidator } from '#validators/proceeding_file_type_property'
import ProceedingFile from '#models/proceeding_file'
import SystemSettingProceedingFile from '#models/system_setting_proceeding_file'

export default class ProceedingFileTypePropertyController {
  /**
   * @swagger
   * /api/proceeding-file-type-properties:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Proceeding File Type Properties
   *     summary: get all
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema:
   *           type: string
   *         description: Active business unit ID of the authenticated user (businessScope middleware)
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
   *         description: The resource could not be found, or the X-Business-Unit-Id header is invalid or out of the user's scope (key BU.NOT.001, businessScope middleware)
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
   *         description: The parameters entered are invalid or essential data is missing to process the request. Also returned when the X-Business-Unit-Id header is missing (key BU.VAL.000, businessScope middleware)
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
      } as ProceedingFileTypePropertyFilterSearchInterface
      const proceedingFileTypePropertyService = new ProceedingFileTypePropertyService()
      const proceedingFileTypeProperties = await proceedingFileTypePropertyService.index(filters)
      response.status(200)
      return {
        type: 'success',
        title: 'Proceeding file type properties',
        message: 'The proceeding file type properties were found successfully',
        data: {
          proceedingFileTypeProperties: proceedingFileTypeProperties,
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
   * /api/proceeding-file-type-properties/get-categories-by-employee:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema:
   *           type: string
   *         description: Active business unit ID of the authenticated user (businessScope middleware). Datos capturados por otra empresa nunca viajan; se devuelve la ficha en blanco (ver 200).
   *       - name: employeeId
   *         in: query
   *         required: true
   *         description: Employee id
   *         schema:
   *           type: number
   *       - name: proceedingFileId
   *         in: query
   *         required: true
   *         description: Proceeding file id
   *         schema:
   *           type: number
   *       - name: proceedingFileTypeId
   *         in: query
   *         required: true
   *         description: Proceeding file type id
   *         schema:
   *           type: number
   *     tags:
   *       - Proceeding File Type Properties
   *     summary: get all categories
   *     description: |
   *       If the employee or its proceeding file belongs to a business unit other than
   *       the active one, the response is still 200 and identical in shape to an
   *       existing-but-empty record: every property comes back with a single blank
   *       placeholder value. No data captured by another business unit is ever returned,
   *       and there is no way to distinguish "not found" from "not yours" (anti-IDOR).
   *     responses:
   *       '200':
   *         description: Resource processed successfully (blank placeholder values when the employee/proceeding file is out of the active business unit's scope)
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
   *         description: The resource could not be found, or the X-Business-Unit-Id header is invalid or out of the user's scope (key BU.NOT.001, businessScope middleware)
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
   *         description: The parameters entered are invalid or essential data is missing to process the request. Also returned when the X-Business-Unit-Id header is missing (key BU.VAL.000, businessScope middleware)
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
   *       '403':
   *         description: Forbidden by permission gate (key PERM.DENIED / PERM.UNRESOLVED)
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
  async getCategories({ request, response }: HttpContext) {
    try {
      const employeeId = request.input('employeeId')
      const proceedingFileId = request.input('proceedingFileId')
      const proceedingFileTypeId = request.input('proceedingFileTypeId')
      const proceedingFileTypePropertyService = new ProceedingFileTypePropertyService()
      const proceedingFileTypePropertyCategoryFilter = {
        employeeId,
        proceedingFileId,
        proceedingFileTypeId,
      } as ProceedingFileTypePropertyCategoryFilterInterface
      const proceedingFileTypePropertiesCategories =
        await proceedingFileTypePropertyService.getCategories(
          proceedingFileTypePropertyCategoryFilter
        )
      response.status(200)
      return {
        type: 'success',
        title: 'Proceeding file type properties',
        message: 'The proceeding file type property categories were found successfully',
        data: {
          proceedingFileTypePropertiesCategories: proceedingFileTypePropertiesCategories,
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
   * Categorías y valores para proceeding files vinculados a un system setting.
   * Query: systemSettingId, proceedingFileId, proceedingFileTypeId (todos obligatorios).
   *
   * @swagger
   * /api/proceeding-file-type-properties/get-categories-by-system-setting:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Proceeding File Type Properties
   *     summary: get all categories linked to a system setting proceeding file
   *     description: |
   *       If the proceeding file resolves outside the active business unit's scope,
   *       the response is still 200 with blank placeholder values (anti-IDOR); no data
   *       captured by another business unit is ever returned.
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema:
   *           type: string
   *         description: Active business unit ID of the authenticated user (businessScope middleware)
   *       - name: systemSettingId
   *         in: query
   *         required: true
   *         schema:
   *           type: number
   *       - name: proceedingFileId
   *         in: query
   *         required: true
   *         schema:
   *           type: number
   *       - name: proceedingFileTypeId
   *         in: query
   *         required: true
   *         schema:
   *           type: number
   *     responses:
   *       '200':
   *         description: Resource processed successfully (blank placeholder values when the proceeding file is out of the active business unit's scope)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *       '400':
   *         description: Missing/invalid query parameters, or the X-Business-Unit-Id header is missing (key BU.VAL.000, businessScope middleware)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *       '404':
   *         description: The system-setting/proceeding-file link or the proceeding file itself was not found, or the X-Business-Unit-Id header is invalid or out of the user's scope (key BU.NOT.001, businessScope middleware)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     error:
   *                       type: string
   */
  async getCategoriesBySystemSetting({ request, response }: HttpContext) {
    try {
      const systemSettingIdRaw = request.input('systemSettingId')
      const proceedingFileIdRaw = request.input('proceedingFileId')
      const proceedingFileTypeIdRaw = request.input('proceedingFileTypeId')

      const isMissingQuery = (value: unknown) =>
        value === undefined ||
        value === null ||
        (typeof value === 'string' && value.trim() === '') ||
        value === 'undefined'

      if (isMissingQuery(proceedingFileIdRaw)) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Falta proceedingFileId',
          message:
            'La query debe incluir proceedingFileId con un número, por ejemplo: proceedingFileId=45. No dejes el parámetro vacío (…&proceedingFileId&… es inválido). Obtén el id con GET /api/system-settings-proceeding-files?systemSettingId={id}&type={proceedingFileTypeId} (proceedingFileId en data.systemSettingProceedingFiles[].proceedingFile). Si aún no subiste el archivo, usa GET /api/proceeding-file-type-properties/by-proceeding-file-type/{proceedingFileTypeId} para listar solo las propiedades del tipo.',
          data: {
            systemSettingId: systemSettingIdRaw,
            proceedingFileId: proceedingFileIdRaw,
            proceedingFileTypeId: proceedingFileTypeIdRaw,
          },
        }
      }

      const systemSettingId = Number(systemSettingIdRaw)
      const proceedingFileId = Number(proceedingFileIdRaw)
      const proceedingFileTypeId = Number(proceedingFileTypeIdRaw)

      if (
        Number.isNaN(systemSettingId) ||
        systemSettingId <= 0 ||
        Number.isNaN(proceedingFileId) ||
        proceedingFileId <= 0 ||
        Number.isNaN(proceedingFileTypeId) ||
        proceedingFileTypeId <= 0
      ) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing or invalid query parameters',
          message:
            'Se requieren systemSettingId, proceedingFileId y proceedingFileTypeId numéricos válidos',
          data: {
            systemSettingId: systemSettingIdRaw,
            proceedingFileId: proceedingFileIdRaw,
            proceedingFileTypeId: proceedingFileTypeIdRaw,
          },
        }
      }

      const link = await SystemSettingProceedingFile.query()
        .whereNull('system_setting_proceeding_file_deleted_at')
        .where('system_setting_id', systemSettingId)
        .where('proceeding_file_id', proceedingFileId)
        .first()

      if (!link) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Relation not found',
          message: 'El proceeding file no está vinculado a ese system setting',
          data: { systemSettingId, proceedingFileId },
        }
      }

      const proceedingFile = await ProceedingFile.query()
        .whereNull('proceeding_file_deleted_at')
        .where('proceeding_file_id', proceedingFileId)
        .first()

      if (!proceedingFile) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Proceeding file not found',
          message: 'No se encontró el proceeding file',
          data: { proceedingFileId },
        }
      }

      if (proceedingFile.proceedingFileTypeId !== proceedingFileTypeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Type mismatch',
          message: 'proceedingFileTypeId no coincide con el tipo del archivo',
          data: {
            proceedingFileTypeId,
            actualProceedingFileTypeId: proceedingFile.proceedingFileTypeId,
          },
        }
      }

      const proceedingFileTypePropertyService = new ProceedingFileTypePropertyService()
      const proceedingFileTypePropertiesCategories =
        await proceedingFileTypePropertyService.getCategoriesBySystemSetting({
          proceedingFileId,
          proceedingFileTypeId,
        })

      response.status(200)
      return {
        type: 'success',
        title: 'Proceeding file type properties',
        message: 'The proceeding file type property categories were found successfully',
        data: {
          proceedingFileTypePropertiesCategories: proceedingFileTypePropertiesCategories,
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
   * /api/proceeding-file-type-properties:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Proceeding File Type Properties
   *     summary: create new proceeding file type property
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema:
   *           type: string
   *         description: Active business unit ID of the authenticated user (businessScope middleware)
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               proceedingFileTypePropertyName:
   *                 type: string
   *                 description: Property name
   *                 required: true
   *                 example: "Idioma/Nivel"
   *               proceedingFileTypePropertyType:
   *                 type: string
   *                 description: Property type
   *                 required: true
   *                 enum: [Text, File, Currency, Decimal, Number]
   *                 example: "Text"
   *               proceedingFileTypePropertyCategoryName:
   *                 type: string
   *                 description: Property category name (optional)
   *                 required: false
   *                 example: "Idiomas"
   *               proceedingFileTypeId:
   *                 type: number
   *                 description: Proceeding file type ID
   *                 required: true
   *                 example: 1
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
   *                     proceedingFileTypeProperty:
   *                       $ref: '#/components/schemas/ProceedingFileTypeProperty'
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request. Also returned when the X-Business-Unit-Id header is missing (key BU.VAL.000, businessScope middleware)
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
   *         description: Proceeding file type not found, or the X-Business-Unit-Id header is invalid or out of the user's scope (key BU.NOT.001, businessScope middleware)
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
   *       '403':
   *         description: Forbidden — requires 'tab-expediente-write' on the employees module (key PERM.DENIED / PERM.UNRESOLVED, permissionGate middleware)
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
      // Validar los datos de entrada
      const data = await request.validateUsing(createProceedingFileTypePropertyValidator)

      const proceedingFileTypePropertyService = new ProceedingFileTypePropertyService()
      const result = await proceedingFileTypePropertyService.store({
        proceedingFileTypePropertyName: data.proceedingFileTypePropertyName,
        proceedingFileTypePropertyType: data.proceedingFileTypePropertyType,
        proceedingFileTypePropertyCategoryName: data.proceedingFileTypePropertyCategoryName,
        proceedingFileTypeId: data.proceedingFileTypeId,
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
        title: 'Property created',
        message: 'The proceeding file type property was created successfully',
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
   * /api/proceeding-file-type-properties/create-multiple:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Proceeding File Type Properties
   *     summary: create multiple proceeding file type properties
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema:
   *           type: string
   *         description: Active business unit ID of the authenticated user (businessScope middleware)
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               proceedingFileTypeId:
   *                 type: number
   *                 description: Proceeding file type ID
   *                 required: true
   *                 example: 1
   *               properties:
   *                 type: array
   *                 items:
   *                   type: object
   *                   properties:
   *                     proceedingFileTypePropertyName:
   *                       type: string
   *                       description: Property name
   *                       example: "Idioma/Nivel"
   *                     proceedingFileTypePropertyType:
   *                       type: string
   *                       description: Property type
   *                       enum: [Text, File, Currency, Decimal, Number]
   *                       example: "Text"
   *                     proceedingFileTypePropertyCategoryName:
   *                       type: string
   *                       description: Property category name (optional)
   *                       example: "Idiomas"
   *                 description: Array of properties to create
   *                 required: true
   *                 minItems: 1
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
   *                     createdProperties:
   *                       type: array
   *                       items:
   *                         $ref: '#/components/schemas/ProceedingFileTypeProperty'
   *                     errors:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           propertyName:
   *                             type: string
   *                           error:
   *                             type: string
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request. Also returned when the X-Business-Unit-Id header is missing (key BU.VAL.000, businessScope middleware)
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
   *         description: Proceeding file type not found, or the X-Business-Unit-Id header is invalid or out of the user's scope (key BU.NOT.001, businessScope middleware)
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
   *       '403':
   *         description: Forbidden — requires 'tab-expediente-write' on the employees module (key PERM.DENIED / PERM.UNRESOLVED, permissionGate middleware)
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
  async storeMultiple({ request, response }: HttpContext) {
    try {
      // Validar los datos de entrada
      const data = await request.validateUsing(createMultipleProceedingFileTypePropertiesValidator)

      const proceedingFileTypePropertyService = new ProceedingFileTypePropertyService()
      const result = await proceedingFileTypePropertyService.storeMultiple({
        proceedingFileTypeId: data.proceedingFileTypeId,
        properties: data.properties,
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
        title: 'Properties created',
        message: 'The proceeding file type properties were created successfully',
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
   * /api/proceeding-file-type-properties/by-proceeding-file-type/{proceedingFileTypeId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Proceeding File Type Properties
   *     summary: get all properties by proceeding file type ID
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema:
   *           type: string
   *         description: Active business unit ID of the authenticated user (businessScope middleware)
   *       - in: path
   *         name: proceedingFileTypeId
   *         schema:
   *           type: number
   *         description: Proceeding file type ID
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
   *                   properties:
   *                     properties:
   *                       type: array
   *                       items:
   *                         $ref: '#/components/schemas/ProceedingFileTypeProperty'
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request. Also returned when the X-Business-Unit-Id header is missing (key BU.VAL.000, businessScope middleware)
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
   *         description: The X-Business-Unit-Id header is invalid or out of the user's scope (key BU.NOT.001, businessScope middleware)
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
  async getByProceedingFileTypeId({ request, response }: HttpContext) {
    try {
      const proceedingFileTypeId = request.param('proceedingFileTypeId')

      if (!proceedingFileTypeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The proceeding file type ID is required',
          data: { proceedingFileTypeId },
        }
      }

      const proceedingFileTypePropertyService = new ProceedingFileTypePropertyService()
      const result = await proceedingFileTypePropertyService.getByProceedingFileTypeId(proceedingFileTypeId)

      if (result.status !== 200) {
        response.status(result.status)
        return {
          type: result.type,
          title: result.title,
          message: result.message,
          data: result.data,
        }
      }

      response.status(200)
      return {
        type: 'success',
        title: 'Properties retrieved',
        message: 'The proceeding file type properties were retrieved successfully',
        data: result.data,
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
   * /api/proceeding-file-type-properties/{proceedingFileTypePropertyId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Proceeding File Type Properties
   *     summary: delete proceeding file type property
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema:
   *           type: string
   *         description: Active business unit ID of the authenticated user (businessScope middleware)
   *       - in: path
   *         name: proceedingFileTypePropertyId
   *         schema:
   *           type: number
   *         description: Proceeding file type property ID
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
   *                   properties:
   *                     proceedingFileTypeProperty:
   *                       $ref: '#/components/schemas/ProceedingFileTypeProperty'
   *       '404':
   *         description: Property not found, or the X-Business-Unit-Id header is invalid or out of the user's scope (key BU.NOT.001, businessScope middleware)
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
   *         description: The parameters entered are invalid or essential data is missing to process the request. Also returned when the X-Business-Unit-Id header is missing (key BU.VAL.000, businessScope middleware)
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
   *       '403':
   *         description: Forbidden — requires 'tab-expediente-delete' on the employees module (key PERM.DENIED / PERM.UNRESOLVED, permissionGate middleware)
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
      const proceedingFileTypePropertyId = request.param('proceedingFileTypePropertyId')

      if (!proceedingFileTypePropertyId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The proceeding file type property ID is required',
          data: { proceedingFileTypePropertyId },
        }
      }

      const proceedingFileTypePropertyService = new ProceedingFileTypePropertyService()
      const result = await proceedingFileTypePropertyService.delete(proceedingFileTypePropertyId)

      if (result.status !== 200) {
        response.status(result.status)
        return {
          type: result.type,
          title: result.title,
          message: result.message,
          data: result.data,
        }
      }

      response.status(200)
      return {
        type: 'success',
        title: 'Property deleted',
        message: 'The proceeding file type property was deleted successfully',
        data: result.data,
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
