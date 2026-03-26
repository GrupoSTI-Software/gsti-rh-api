import { HttpContext } from '@adonisjs/core/http'
import { createPositionCompetencyValidator } from '#validators/position_competency'
import PositionCompetency from '#models/position_competency'
import PositionCompetencyService from '#services/position_competency_service'

export default class PositionSpecificFunctionController {
  /**
   * @swagger
   * /api/position-competencies:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Competencies
   *     summary: create new position competency
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
   *               weightId:
   *                 type: number
   *                 description: Weight id
   *                 required: true
   *                 default: ''
   *               positionCompetencyName:
   *                 type: string
   *                 description: Position competency name
   *                 required: true
   *                 default: ''
   *               positionCompetencyType:
   *                 type: string
   *                 description: Position competency type
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

      await request.validateUsing(createPositionCompetencyValidator)
      const positionCompetencyService = new PositionCompetencyService()
      const positionId = request.input('positionId')
      const weightId = request.input('weightId')
      const positionCompetencyName = request.input('positionCompetencyName')
      const positionCompetencyType = request.input('positionCompetencyType')
      const positionCompetency = {
        positionId: positionId,
        weightId: weightId,
        positionCompetencyName: positionCompetencyName,
        positionCompetencyType: positionCompetencyType,
      } as PositionCompetency

      const newPositionCompetency = await positionCompetencyService.create(positionCompetency)
      await newPositionCompetency.load('weight')
      response.status(201)
      return {
        type: 'success',
        title: t('resource'),
        message: t('resource_was_created_successfully'),
        data: { positionCompetency: newPositionCompetency },
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
   * /api/position-competencies/{positionCompetencyId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Competencies
   *     summary: update position competency
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: positionCompetencyId
   *         schema:
   *           type: number
   *         description: Position competency id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               weightId:
   *                 type: number
   *                 description: Weight id
   *                 required: true
   *                 default: ''
   *               positionCompetencyName:
   *                 type: string
   *                 description: Position competency name
   *                 required: true
   *                 default: ''
   *               positionCompetencyType:
   *                 type: string
   *                 description: Position competency type
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
      const positionCompetencyId = request.param('positionCompetencyId')
      const weightId = request.input('weightId')
      const positionCompetencyName = request.input('positionCompetencyName')
      const positionCompetencyType = request.input('positionCompetencyType')

      const positionCompetency = {
        positionCompetencyId: positionCompetencyId,
        weightId: weightId,
        positionCompetencyName: positionCompetencyName,
        positionCompetencyType: positionCompetencyType,
      } as PositionCompetency
      if (!positionCompetencyId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The position competency Id was not found',
          message: 'Missing data to process',
          data: { ...positionCompetency },
        }
      }
      const currentPositionCompetency = await PositionCompetency.query()
        .whereNull('position_competency_deleted_at')
        .where('position_competency_id', positionCompetencyId)
        .first()
      if (!currentPositionCompetency) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The position competency was not found',
          message: 'The position competency was not found with the entered ID',
          data: { ...positionCompetency },
        }
      }
      const positionCompetencyService = new PositionCompetencyService()
      const updatePositionCompetency = await positionCompetencyService.update(currentPositionCompetency, positionCompetency)
      await updatePositionCompetency.load('weight')
      if (updatePositionCompetency) {
        response.status(200)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_updated_successfully'),
          data: { positionCompetency: updatePositionCompetency },
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
   * /api/position-competencies/{positionCompetencyId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Competencies
   *     summary: delete position competency
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: positionCompetencyId
   *         schema:
   *           type: number
   *         description: Position competency id
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
      const positionCompetencyId = request.param('positionCompetencyId')
      if (!positionCompetencyId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The position competency Id was not found',
          message: 'Missing data to process',
          data: { positionCompetencyId },
        }
      }
      const currentPositionCompetency = await PositionCompetency.query()
        .whereNull('position_competency_deleted_at')
        .where('position_competency_id', positionCompetencyId)
        .first()
      if (!currentPositionCompetency) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The position competency was not found',
          message: 'The position competency was not found with the entered ID',
          data: { positionCompetencyId },
        }
      }
      const positionCompetencyService = new PositionCompetencyService()
      const deletePositionCompetency = await positionCompetencyService.delete(currentPositionCompetency)
      if (deletePositionCompetency) {
        response.status(200)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_deleted_successfully'),
          data: { positionCompetency: deletePositionCompetency },
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
   * /api/position-competencies/distinct-names:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Competencies
   *     summary: get distinct position competency names
   *     produces:
   *       - application/json
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
   async getDistinctNames({ response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const positionCompetencyService = new PositionCompetencyService()
      const positionCompetencyNames = await positionCompetencyService.getDistinctNames()

      response.status(200)
      return {
        type: 'success',
        title: t('resource'),
        message: t('resource_was_found_successfully'),
        data: { positionCompetencyNames },
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
   * /api/position-competencies/get-by-position/{positionId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Competencies
   *     summary: get position competencies by position id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: positionId
   *         schema:
   *           type: integer
   *         description: Position Identifier
   *         required: true
   *       - in: query
   *         name: positionCompetencyType
   *         schema:
   *           type: string
   *         description: Position competency type (technical, functional, value)
   *         required: false
   *         default: 'technical'
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
  async getByPosition({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const positionId = request.param('positionId')
      const positionCompetencyType = request.input('positionCompetencyType')
      if (!positionId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The position id was not found',
          data: { positionId },
        }
      }
      const positionCompetencyService = new PositionCompetencyService()
      const positionCompetencies = await positionCompetencyService.getByPosition(positionId, positionCompetencyType)
      if (!positionCompetencies) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The position competencies were not found',
          message: 'The position competencies were not found with the entered id',
          data: { positionId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: t('resources'),
          message: t('resources_were_found_successfully'),
          data: { positionCompetencies },
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
