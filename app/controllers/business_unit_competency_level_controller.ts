import { HttpContext } from '@adonisjs/core/http'
import { createBusinessUnitCompetencyLevelValidator, updateBusinessUnitCompetencyLevelValidator } from '#validators/business_unit_competency_level'
import { BusinessUnitCompetencyLevelFilterInterface } from 'app/interfaces/business_unit_competency_level_filter_interface.js'
import BusinessUnitCompetencyLevelService from '#services/business_unit_competency_level_service'
import BusinessUnitCompetencyLevel from '#models/business_unit_competency_level'

export default class BusinessUnitCompetencyLevelController {
  /**
   * @swagger
   * /api/business-unit-competency-levels:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Business Unit Competency Levels
   *     summary: get all
   *     parameters:
   *       - name: businessUnitId
   *         in: query
   *         required: true
   *         description: Business unit id
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
  async index({ response, i18n, request }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    const businessUnitId = request.input('businessUnitId')
    try {
      const filters = {
        businessUnitId: businessUnitId,
      } as BusinessUnitCompetencyLevelFilterInterface
      const businessUnitCompetencyLevelService = new BusinessUnitCompetencyLevelService(i18n)
      const businessUnitCompetencyLevels = await businessUnitCompetencyLevelService.index(filters)
      response.status(200)
      return {
        type: 'success',
        title: t('resources'),
        message: t('resources_were_found_successfully'),
        data: {
          businessUnitCompetencyLevels,
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

 /**
   * @swagger
   * /api/business-unit-competency-levels:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Business Unit Competency Levels
   *     summary: create new business unit competency level
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               businessUnitCompetencyLevelLabel:
   *                 type: string
   *                 description: Business unit competency level label
   *                 required: true
   *                 default: ''
   *               businessUnitCompetencyLevelPosition:
   *                 type: number
   *                 description: Business unit competency level position
   *                 required: true
   *                 default: ''
   *               businessUnitId:
   *                 type: number
   *                 description: Business unit id
   *                 required: true
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
 async store({ request, response, i18n }: HttpContext) {
  const t = i18n.formatMessage.bind(i18n)
  try {
    await request.validateUsing(createBusinessUnitCompetencyLevelValidator)
    const businessUnitCompetencyLevelService = new BusinessUnitCompetencyLevelService(i18n)
    const businessUnitId = request.input('businessUnitId')
    const businessUnitCompetencyLevelLabel = request.input('businessUnitCompetencyLevelLabel')
    const businessUnitCompetencyLevelPosition = request.input('businessUnitCompetencyLevelPosition')
    const businessUnitCompetencyLevel = {
      businessUnitId: businessUnitId,
      businessUnitCompetencyLevelLabel: businessUnitCompetencyLevelLabel,
      businessUnitCompetencyLevelPosition: businessUnitCompetencyLevelPosition,
    } as BusinessUnitCompetencyLevel

    const existInfoDate = await businessUnitCompetencyLevelService.verifyInfoExist(businessUnitCompetencyLevel)
    if (existInfoDate.status !== 200) {
      response.status(existInfoDate.status)
      return {
        type: existInfoDate.type,
        title: existInfoDate.title,
        message: existInfoDate.message,
        data: { ...businessUnitCompetencyLevel },
      }
    }
    const verifyInfo = await businessUnitCompetencyLevelService.verifyInfo(businessUnitCompetencyLevel)
    if (verifyInfo.status !== 200) {
      response.status(verifyInfo.status)
      return {
        type: verifyInfo.type,
        title: verifyInfo.title,
        message: verifyInfo.message,
        data: { ...businessUnitCompetencyLevel },
      }
    }
    const newBusinessUnitCompetencyLevel = await businessUnitCompetencyLevelService.create(businessUnitCompetencyLevel)
    response.status(201)
    return {
      type: 'success',
      title: t('resource'),
      message: t('resource_was_created_successfully'),
      data: { businessUnitCompetencyLevel: newBusinessUnitCompetencyLevel },
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
   * /api/business-unit-competency-levels/{businessUnitCompetencyLevelId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Business Unit Competency Levels
   *     summary: update business unit competency level
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: businessUnitCompetencyLevelId
   *         schema:
   *           type: number
   *         description: Business unit competency level id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               businessUnitCompetencyLevelLabel:
   *                 type: string
   *                 description: Business unit competency level label
   *                 required: true
   *               businessUnitCompetencyLevelPosition:
   *                 type: number
   *                 description: Business unit competency level position
   *                 required: true
   *               businessUnitId:
   *                 type: number
   *                 description: Business unit id
   *                 required: true
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
  async update({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      await request.validateUsing(updateBusinessUnitCompetencyLevelValidator)
      const businessUnitCompetencyLevelId = request.param('businessUnitCompetencyLevelId')
      const businessUnitId = request.input('businessUnitId')
      const businessUnitCompetencyLevelLabel = request.input('businessUnitCompetencyLevelLabel')
      const businessUnitCompetencyLevelPosition = request.input('businessUnitCompetencyLevelPosition')
      const businessUnitCompetencyLevel = {
        businessUnitCompetencyLevelId: businessUnitCompetencyLevelId,
        businessUnitId: businessUnitId,
        businessUnitCompetencyLevelLabel: businessUnitCompetencyLevelLabel,
        businessUnitCompetencyLevelPosition: businessUnitCompetencyLevelPosition,
      } as BusinessUnitCompetencyLevel
      if (!businessUnitCompetencyLevelId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The business unit competency level Id was not found',
          message: 'Missing data to process',
          data: { ...businessUnitCompetencyLevel },
        }
      }
      const currentBusinessUnitCompetencyLevel = await BusinessUnitCompetencyLevel.query()
        .whereNull('business_unit_competency_level_deleted_at')
        .where('business_unit_competency_level_id', businessUnitCompetencyLevelId)
        .first()
      if (!currentBusinessUnitCompetencyLevel) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The business unit competency level was not found',
          message: 'The business unit competency level was not found with the entered ID',
          data: { ...businessUnitCompetencyLevel },
        }
      }
      const businessUnitCompetencyLevelService = new BusinessUnitCompetencyLevelService(i18n)
      const verifyInfo = await businessUnitCompetencyLevelService.verifyInfo(businessUnitCompetencyLevel)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...businessUnitCompetencyLevel },
        }
      }
      const updateBusinessUnitCompetencyLevel = await businessUnitCompetencyLevelService.update(currentBusinessUnitCompetencyLevel, businessUnitCompetencyLevel)
      if (updateBusinessUnitCompetencyLevel) {
        response.status(200)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_updated_successfully'),
          data: { businessUnitCompetencyLevel: updateBusinessUnitCompetencyLevel },
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
   * /api/business-unit-competency-levels/delete/{businessUnitCompetencyLevelId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Business Unit Competency Levels
   *     summary: delete business unit competency level
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: businessUnitCompetencyLevelId
   *         schema:
   *           type: number
   *         description: Business unit competency level id
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
  async delete({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const businessUnitCompetencyLevelId = request.param('businessUnitCompetencyLevelId')
      if (!businessUnitCompetencyLevelId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The business unit competency level Id was not found',
          message: 'Missing data to process',
          data: { businessUnitCompetencyLevelId },
        }
      }
      const currentBusinessUnitCompetencyLevel = await BusinessUnitCompetencyLevel.query()
        .whereNull('business_unit_competency_level_deleted_at')
        .where('business_unit_competency_level_id', businessUnitCompetencyLevelId)
        .first()
      if (!currentBusinessUnitCompetencyLevel) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The business unit competency level was not found',
          message: 'The business unit competency level was not found with the entered ID',
          data: { businessUnitCompetencyLevelId },
        }
      }
      const businessUnitCompetencyLevelService = new BusinessUnitCompetencyLevelService(i18n)
      const verifyInfoQuantity = await businessUnitCompetencyLevelService.verifyInfoQuantity(currentBusinessUnitCompetencyLevel)
      if (verifyInfoQuantity.status !== 200) {
        response.status(verifyInfoQuantity.status)
        return {
          type: verifyInfoQuantity.type,
          title: verifyInfoQuantity.title,
          message: verifyInfoQuantity.message,
          data: { ...currentBusinessUnitCompetencyLevel },
        }
      }
      const deleteBusinessUnitCompetencyLevel = await businessUnitCompetencyLevelService.delete(currentBusinessUnitCompetencyLevel)
      if (deleteBusinessUnitCompetencyLevel) {
        response.status(200)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_deleted_successfully'),
          data: { businessUnitCompetencyLevel: deleteBusinessUnitCompetencyLevel },
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
   * /api/business-unit-competency-levels/{businessUnitCompetencyLevelId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Business Unit Competency Levels
   *     summary: get business unit competency level by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: businessUnitCompetencyLevelId
   *         schema:
   *           type: number
   *         description: Business unit competency level id
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
  async show({ request, response, i18n }: HttpContext) {
    try {
      const businessUnitCompetencyLevelId = request.param('businessUnitCompetencyLevelId')
      if (!businessUnitCompetencyLevelId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The business unit competency level Id was not found',
          message: 'Missing data to process',
          data: { businessUnitCompetencyLevelId },
        }
      }

      const businessUnitCompetencyLevelService = new BusinessUnitCompetencyLevelService(i18n)
      const showBusinessUnitCompetencyLevel = await businessUnitCompetencyLevelService.show(businessUnitCompetencyLevelId)
      if (!showBusinessUnitCompetencyLevel) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The business unit competency level was not found',
          message: 'The business unit competency level was not found with the entered ID',
          data: { businessUnitCompetencyLevelId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Business unit competency level',
          message: 'The business unit competency level was found successfully',
          data: { businessUnitCompetencyLevel: showBusinessUnitCompetencyLevel },
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
}
