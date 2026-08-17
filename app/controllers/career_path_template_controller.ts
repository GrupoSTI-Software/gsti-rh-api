import { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import CareerPathTemplate from '#models/career_path_template'
import { createCareerPathTemplateValidator } from '#validators/career_path_template'
import { updateCareerPathTemplateValidator } from '#validators/career_path_template'
import CareerPathTemplateService from '#services/career_path_template_service'
import ScopeDeniedLogService from '#services/scope_denied_log_service'
import { CAREER_PATH_TEMPLATE_ERROR_CODES } from '#constants/career_path_template_error_codes'
import { CareerPathTemplateFilterSearchInterface } from 'app/interfaces/career_path_template_filter_search_interface.js'

/** 404 uniforme (no revela "no existe" vs "no es tuyo") — regla 5, USRH1786595131484. */
function careerPathTemplateNotFoundResponse(response: HttpContext['response']) {
  return response.status(404).json({
    title: 'Recurso no encontrado',
    detail: 'El recurso solicitado no existe o está fuera de tu alcance.',
    key: 'recurso-no-encontrado',
    code: CAREER_PATH_TEMPLATE_ERROR_CODES.NOT_FOUND,
  })
}

/**
 * Traduce un error inesperado a 500. Conserva el comportamiento legacy para
 * `E_VALIDATION_ERROR` (message inocuo) pero deja de repetir `error.message`
 * para cualquier otro error (R-3, USRH1786595131484): el `@beforeCreate` del
 * modelo lanza textos que contienen "no está en tu alcance". El detalle
 * interno de esos casos solo va al logger.
 */
function unexpectedErrorResponse(
  error: unknown,
  response: HttpContext['response'],
  t: (key: string) => string
) {
  const isValidationError =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'E_VALIDATION_ERROR'

  if (isValidationError) {
    const messages = (error as unknown as { messages: Array<{ message: string }> }).messages
    response.status(500)
    return {
      type: 'error',
      title: t('server_error'),
      message: t('an_unexpected_error_has_occurred_on_the_server'),
      error: messages[0].message,
    }
  }

  logger.error({ err: error }, 'career_path_template: error inesperado')
  response.status(500)
  return {
    type: 'error',
    title: t('server_error'),
    message: t('an_unexpected_error_has_occurred_on_the_server'),
  }
}

export default class CareerPathTemplateController {
  /**
   * @swagger
   * /api/career-path-templates:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Career Path Templates
   *     summary: get all
   *     parameters:
   *       - originPositionId: origin position id
   *         in: query
   *         required: false
   *         description: Origin position id
   *         schema:
   *           type: number
   *       - targetPositionId: target position id
   *         in: query
   *         required: false
   *         description: Target position id
   *         schema:
   *           type: number
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
  async index({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const originPositionId = request.input('originPositionId')
      const targetPositionId = request.input('targetPositionId')
     
      const careerPathTemplateService = new CareerPathTemplateService(i18n)
      const filters = {
        originPositionId: originPositionId,
        targetPositionId: targetPositionId,
      } as CareerPathTemplateFilterSearchInterface
      const careerPathTemplates = await careerPathTemplateService.index(filters)
      response.status(200)
      return {
        type: 'success',
        title: t('resources'),
        message: t('resources_were_found_successfully'),
        data: {
          careerPathTemplates,
        },
      }
    } catch (error) {
      return unexpectedErrorResponse(error, response, t)
    }
  }

  /**
   * @swagger
   * /api/career-path-templates:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Career Path Templates
   *     summary: create new career path template
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               companyId:
   *                 type: number
   *                 description: >
   *                   Ignorado. La empresa la estampa el servidor desde la unidad
   *                   activa de la sesión (header X-Business-Unit-Id).
   *                 required: false
   *                 default: ''
   *               originPositionId:
   *                 type: number
   *                 description: Origin position id
   *                 required: true
   *                 default: ''
   *               targetPositionId:
   *                 type: number
   *                 description: Target position id
   *                 required: true
   *                 default: ''
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
  async store({ request, response, i18n, auth, businessUnitScope }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const [companyId] = businessUnitScope
      const originPositionId = request.input('originPositionId')
      const targetPositionId = request.input('targetPositionId')
      const createdBy = auth.user?.userId
      const updatedBy = auth.user?.userId
      const careerPathTemplate = {
        companyId: companyId,
        originPositionId: originPositionId,
        targetPositionId: targetPositionId,
        createdBy: createdBy,
        updatedBy: updatedBy,
      } as CareerPathTemplate
      const careerPathTemplateService = new CareerPathTemplateService(i18n)
      const data = await request.validateUsing(createCareerPathTemplateValidator)
      const exist = await careerPathTemplateService.verifyInfoExist(careerPathTemplate)
      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...data },
        }
      }
      const verifyInfo = await careerPathTemplateService.verifyInfo(careerPathTemplate)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...data },
        }
      }
      const newCareerPathTemplate = await careerPathTemplateService.create(careerPathTemplate)
      if (newCareerPathTemplate) {
        response.status(201)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_created_successfully'),
          data: { careerPathTemplate: newCareerPathTemplate },
        }
      }
    } catch (error) {
      return unexpectedErrorResponse(error, response, t)
    }
  }

  /**
   * @swagger
   * /api/career-path-templates/{careerPathTemplateId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Career Path Templates
   *     summary: update career path template
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: careerPathTemplateId
   *         schema:
   *           type: number
   *         description: Career path template id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               companyId:
   *                 type: number
   *                 description: >
   *                   Ignorado. La empresa la estampa el servidor desde la unidad
   *                   activa de la sesión (header X-Business-Unit-Id).
   *                 required: false
   *                 default: ''
   *               originPositionId:
   *                 type: number
   *                 description: Origin position id
   *                 required: true
   *                 default: ''
   *               targetPositionId:
   *                 type: number
   *                 description: Target position id
   *                 required: true
   *                 default: ''
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
  async update({ request, response, i18n, auth, businessUnitScope }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const careerPathTemplateId = request.param('careerPathTemplateId')
      const originPositionId = request.input('originPositionId')
      const targetPositionId = request.input('targetPositionId')
      const updatedBy = auth.user?.userId
      const careerPathTemplate = {
        careerPathTemplateId: careerPathTemplateId,
        originPositionId: originPositionId,
        targetPositionId: targetPositionId,
        updatedBy: updatedBy,
      } as CareerPathTemplate
      if (!careerPathTemplateId) {
        response.status(400)
        return {
          type: 'warning',
          title: t('resource'),
          message: t('resource_id_was_not_found'),
          data: { ...careerPathTemplate },
        }
      }
      const currentCareerPathTemplate = await CareerPathTemplate.query()
        .whereNull('career_path_template_deleted_at')
        .where('career_path_template_id', careerPathTemplateId)
        .first()
      if (!currentCareerPathTemplate) {
        await ScopeDeniedLogService.log({
          domain: 'career_path_template',
          action: 'update',
          requestedId: careerPathTemplateId,
          actorUserId: auth.user?.userId ?? null,
          businessUnitScope,
        })
        return careerPathTemplateNotFoundResponse(response)
      }
      careerPathTemplate.companyId = currentCareerPathTemplate.companyId
      const careerPathTemplateService = new CareerPathTemplateService(i18n)
      const data = await request.validateUsing(updateCareerPathTemplateValidator)
      const exist = await careerPathTemplateService.verifyInfoExist(careerPathTemplate)
      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...data },
        }
      }
      const verifyInfo = await careerPathTemplateService.verifyInfo(careerPathTemplate)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...data },
        }
      }
      const updateCareerPathTemplate = await careerPathTemplateService.update(
        currentCareerPathTemplate,
        careerPathTemplate
      )
      if (updateCareerPathTemplate) {
        response.status(200)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_updated_successfully'),
          data: { careerPathTemplate: updateCareerPathTemplate },
        }
      }
    } catch (error) {
      return unexpectedErrorResponse(error, response, t)
    }
  }

  /**
   * @swagger
   * /api/career-path-templates/{careerPathTemplateId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Career Path Templates
   *     summary: delete career path template
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: careerPathTemplateId
   *         schema:
   *           type: number
   *         description: Career path template id
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
  async delete({ request, response, i18n, auth, businessUnitScope }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const careerPathTemplateId = request.param('careerPathTemplateId')
      if (!careerPathTemplateId) {
        response.status(400)
        return {
          type: 'warning',
          title: t('resource'),
          message: t('resource_id_was_not_found'),
          data: { careerPathTemplateId },
        }
      }
      const currentCareerPathTemplate = await CareerPathTemplate.query()
        .whereNull('career_path_template_deleted_at')
        .where('career_path_template_id', careerPathTemplateId)
        .first()
      if (!currentCareerPathTemplate) {
        await ScopeDeniedLogService.log({
          domain: 'career_path_template',
          action: 'delete',
          requestedId: careerPathTemplateId,
          actorUserId: auth.user?.userId ?? null,
          businessUnitScope,
        })
        return careerPathTemplateNotFoundResponse(response)
      }
      const careerPathTemplateService = new CareerPathTemplateService(i18n)
      const deleteCareerPathTemplate =
        await careerPathTemplateService.delete(currentCareerPathTemplate)
      if (deleteCareerPathTemplate) {
        response.status(200)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_deleted_successfully'),
          data: { careerPathTemplate: deleteCareerPathTemplate },
        }
      }
    } catch (error) {
      return unexpectedErrorResponse(error, response, t)
    }
  }

  /**
   * @swagger
   * /api/career-path-templates/{careerPathTemplateId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Career Path Templates
   *     summary: get relation career path template by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: careerPathTemplateId
   *         schema:
   *           type: number
   *         description: Career path template id
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
  async show({ request, response, i18n, auth, businessUnitScope }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const careerPathTemplateId = request.param('careerPathTemplateId')
      if (!careerPathTemplateId) {
        response.status(400)
        return {
          type: 'warning',
          title: t('resource'),
          message: t('resource_id_was_not_found'),
          data: { careerPathTemplateId },
        }
      }
      const careerPathTemplateService = new CareerPathTemplateService(i18n)
      const showCareerPathTemplate = await careerPathTemplateService.show(careerPathTemplateId)
      if (!showCareerPathTemplate) {
        await ScopeDeniedLogService.log({
          domain: 'career_path_template',
          action: 'show',
          requestedId: careerPathTemplateId,
          actorUserId: auth.user?.userId ?? null,
          businessUnitScope,
        })
        return careerPathTemplateNotFoundResponse(response)
      }
      response.status(200)
      return {
        type: 'success',
        title: t('resource'),
        message: t('resource_was_found_successfully'),
        data: { careerPathTemplate: showCareerPathTemplate },
      }
    } catch (error) {
      return unexpectedErrorResponse(error, response, t)
    }
  }
}
