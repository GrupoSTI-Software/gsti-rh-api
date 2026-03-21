import { HttpContext } from '@adonisjs/core/http'
import { createPositionSpecificFunctionValidator } from '#validators/position_specific_function'
import PositionSpecificFunctionService from '#services/position_specific_function_service'
import PositionSpecificFunction from '#models/position_specific_function'

export default class PositionSpecificFunctionController {
  /**
   * @swagger
   * /api/position-specific-functions:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Specific Functions
   *     summary: create new position specific function
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               positionId:
   *                 type: number
   *                 description: Position id
   *                 required: true
   *                 default: ''
   *               positionSpecificFunctionName:
   *                 type: string
   *                 description: Position specific function name
   *                 required: true
   *                 default: ''
   *               positionSpecificFunctionType:
   *                 type: string
   *                 description: Position specific function type
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
  async store({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {

      await request.validateUsing(createPositionSpecificFunctionValidator)
      const positionSpecificFunctionService = new PositionSpecificFunctionService()
      const positionId = request.input('positionId')
      const positionSpecificFunctionName = request.input('positionSpecificFunctionName')
      const positionSpecificFunctionType = request.input('positionSpecificFunctionType')
      const positionSpecificFunction = {
        positionId: positionId,
        positionSpecificFunctionName: positionSpecificFunctionName,
        positionSpecificFunctionType: positionSpecificFunctionType,
      } as PositionSpecificFunction

      const newPositionSpecificFunction = await positionSpecificFunctionService.create(positionSpecificFunction)
      response.status(201)
      return {
        type: 'success',
        title: t('resource'),
        message: t('resource_was_created_successfully'),
        data: { positionSpecificFunction: newPositionSpecificFunction },
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
   * /api/position-specific-functions/{positionSpecificFunctionId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Specific Functions
   *     summary: update position specific function
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: positionSpecificFunctionId
   *         schema:
   *           type: number
   *         description: Position specific function id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               positionSpecificFunctionName:
   *                 type: string
   *                 description: Position specific function name
   *                 required: true
   *                 default: ''
   *               positionSpecificFunctionType:
   *                 type: string
   *                 description: Position specific function type
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
  async update({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const positionSpecificFunctionId = request.param('positionSpecificFunctionId')
      const positionSpecificFunctionName = request.input('positionSpecificFunctionName')
      const positionSpecificFunctionType = request.input('positionSpecificFunctionType')

      const positionSpecificFunction = {
        positionSpecificFunctionId: positionSpecificFunctionId,
        positionSpecificFunctionName: positionSpecificFunctionName,
        positionSpecificFunctionType: positionSpecificFunctionType,
      } as PositionSpecificFunction
      if (!positionSpecificFunctionId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The position Id was not found',
          message: 'Missing data to process',
          data: { ...positionSpecificFunction },
        }
      }
      const currentPositionSpecificFunction = await PositionSpecificFunction.query()
        .whereNull('position_specific_function_deleted_at')
        .where('position_specific_function_id', positionSpecificFunctionId)
        .first()
      if (!currentPositionSpecificFunction) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The position specific function was not found',
          message: 'The position specific function was not found with the entered ID',
          data: { ...positionSpecificFunction },
        }
      }
      const positionSpecificFunctionService = new PositionSpecificFunctionService()
      const updatePositionSpecificFunction = await positionSpecificFunctionService.update(currentPositionSpecificFunction, positionSpecificFunction)
      if (updatePositionSpecificFunction) {
        response.status(200)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_updated_successfully'),
          data: { positionSpecificFunction: updatePositionSpecificFunction },
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
   * /api/position-specific-functions/{positionSpecificFunctionId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Specific Functions
   *     summary: delete position specific function
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: positionSpecificFunctionId
   *         schema:
   *           type: number
   *         description: Position specific function id
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
      const positionSpecificFunctionId = request.param('positionSpecificFunctionId')
      if (!positionSpecificFunctionId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The position specific function Id was not found',
          message: 'Missing data to process',
          data: { positionSpecificFunctionId },
        }
      }
      // Buscar la posición actual
      const currentPositionSpecificFunction = await PositionSpecificFunction.query()
        .whereNull('position_deleted_at')
        .where('position_specific_function_id', positionSpecificFunctionId)
        .first()
      if (!currentPositionSpecificFunction) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The position specific function was not found',
          message: 'The position specific function was not found with the entered ID',
          data: { positionSpecificFunctionId },
        }
      }
      const positionSpecificFunctionService = new PositionSpecificFunctionService()
      const deletePositionSpecificFunction = await positionSpecificFunctionService.delete(currentPositionSpecificFunction)
      if (deletePositionSpecificFunction) {
        response.status(200)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_deleted_successfully'),
          data: { positionSpecificFunction: deletePositionSpecificFunction },
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
