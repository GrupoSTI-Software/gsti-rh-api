import { HttpContext } from '@adonisjs/core/http'
import PositionKpiService from '#services/position_kpi_service'
import PositionKpi from '#models/position_kpi'
import { createPositionKpiValidator, updatePositionKpiValidator } from '#validators/position_kpi'

export default class PositionSpecificFunctionController {
  /**
   * @swagger
   * /api/position-kpis:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position KPIs
   *     summary: create new position KPI
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
   *               positionKpiName:
   *                 type: string
   *                 description: Position KPI name
   *                 required: true
   *                 default: ''
   *               positionKpiMin:
   *                 type: number
   *                 description: Position KPI min
   *                 required: true
   *                 default: ''
   *               positionKpiMax:
   *                 type: number
   *                 description: Position KPI max
   *                 required: true
   *                 default: ''
   *               positionKpiIdeal:
   *                 type: string
   *                 description: Position KPI ideal
   *                 required: true
   *                 default: ''
   *               positionKpiScale:
   *                 type: enum
   *                 enum: ['mayor-es-mejor', 'menor-es-mejor', 'si', 'no']
   *                 description: Position KPI scale
   *                 required: true
   *                 default: ''
   *               positionKpiType:
   *                 type: enum
   *                 enum: ['numerico', 'porcentaje', 'dinero', 'booleano']
   *                 description: Position KPI type
   *                 required: true
   *                 default: ''
   *               positionKpiFrequency:
   *                 type: enum
   *                 enum: ['sin-especificar', 'diario', 'semanal', 'cada-2-semanas', 'mensual', 'trimestral', 'semestral', 'anual']
   *                 description: Position KPI frequency
   *                 required: true
   *                 default: ''
   *               positionKpiDurationDays:
   *                 type: number
   *                 description: Position KPI duration days
   *                 required: true
   *                 default: ''
   *               positionKpiStartDay:
   *                 type: number
   *                 description: Position KPI start day
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

      await request.validateUsing(createPositionKpiValidator)
      const positionKpiService = new PositionKpiService()
      const positionId = request.input('positionId')
      const positionKpiName = request.input('positionKpiName')
      const positionKpiMin = request.input('positionKpiMin')
      const positionKpiMax = request.input('positionKpiMax')
      const positionKpiIdeal = request.input('positionKpiIdeal')
      const positionKpiScale = request.input('positionKpiScale')
      const positionKpiType = request.input('positionKpiType')
      const positionKpiFrequency = request.input('positionKpiFrequency')
      const positionKpiDurationDays = request.input('positionKpiDurationDays')
      const positionKpiStartDay = request.input('positionKpiStartDay')
      const positionKpi = {
        positionId: positionId,
        positionKpiName: positionKpiName,
        positionKpiMin: positionKpiMin,
        positionKpiMax: positionKpiMax,
        positionKpiIdeal: positionKpiIdeal,
        positionKpiScale: positionKpiScale,
        positionKpiType: positionKpiType,
        positionKpiFrequency: positionKpiFrequency,
        positionKpiDurationDays: positionKpiDurationDays,
        positionKpiStartDay: positionKpiStartDay,
      } as PositionKpi

      const newPositionKpi = await positionKpiService.create(positionKpi)
      response.status(201)
      return {
        type: 'success',
        title: t('resource'),
        message: t('resource_was_created_successfully'),
        data: { positionKpi: newPositionKpi },
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
   * /api/position-kpis/{positionKpiId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position KPIs
   *     summary: update position KPI
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: positionKpiId
   *         schema:
   *           type: number
   *         description: Position KPI id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               positionKpiName:
   *                 type: string
   *                 description: Position KPI name
   *                 required: true
   *                 default: ''
   *               positionKpiMin:
   *                 type: number
   *                 description: Position KPI min
   *                 required: true
   *                 default: ''
   *               positionKpiMax:
   *                 type: number
   *                 description: Position KPI max
   *                 required: true
   *                 default: ''
   *               positionKpiIdeal:
   *                 type: string
   *                 description: Position KPI ideal
   *                 required: true
   *                 default: ''
   *               positionKpiScale:
   *                 type: enum
   *                 enum: ['mayor-es-mejor', 'menor-es-mejor', 'si', 'no']
   *                 description: Position KPI scale
   *                 required: true
   *                 default: ''
   *               positionKpiType:
   *                 type: enum
   *                 enum: ['numerico', 'porcentaje', 'dinero', 'booleano']
   *                 description: Position KPI type
   *                 required: true
   *                 default: ''
   *               positionKpiFrequency:
   *                 type: enum
   *                 enum: ['sin-especificar', 'diario', 'semanal', 'cada-2-semanas', 'mensual', 'trimestral', 'semestral', 'anual']
   *                 description: Position KPI frequency
   *                 required: true
   *                 default: ''
   *               positionKpiDurationDays:
   *                 type: number
   *                 description: Position KPI duration days
   *                 required: true
   *                 default: ''
   *               positionKpiStartDay:
   *                 type: number
   *                 description: Position KPI start day
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
      await request.validateUsing(updatePositionKpiValidator)
      const positionKpiId = request.param('positionKpiId')
      const positionKpiName = request.input('positionKpiName')
      const positionKpiType = request.input('positionKpiType')
      const positionKpiMin = request.input('positionKpiMin')
      const positionKpiMax = request.input('positionKpiMax')
      const positionKpiIdeal = request.input('positionKpiIdeal')
      const positionKpiScale = request.input('positionKpiScale')
      const positionKpiFrequency = request.input('positionKpiFrequency')
      const positionKpiDurationDays = request.input('positionKpiDurationDays')
      const positionKpiStartDay = request.input('positionKpiStartDay')
      const positionKpi = {
        positionKpiId: positionKpiId,
        positionKpiName: positionKpiName,
        positionKpiType: positionKpiType,
        positionKpiMin: positionKpiMin,
        positionKpiMax: positionKpiMax,
        positionKpiIdeal: positionKpiIdeal,
        positionKpiScale: positionKpiScale,
        positionKpiFrequency: positionKpiFrequency,
        positionKpiDurationDays: positionKpiDurationDays,
        positionKpiStartDay: positionKpiStartDay,
      } as PositionKpi
      if (!positionKpiId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The position KPI Id was not found',
          message: 'Missing data to process',
          data: { ...positionKpi },
        }
      }
      const currentPositionKpi = await PositionKpi.query()
        .whereNull('position_kpi_deleted_at')
        .where('position_kpi_id', positionKpiId)
        .first()
      if (!currentPositionKpi) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The position KPI was not found',
          message: 'The position KPI was not found with the entered ID',
          data: { ...positionKpi },
        }
      }
      const positionKpiService = new PositionKpiService()
      const updatePositionKpi = await positionKpiService.update(currentPositionKpi, positionKpi)
      if (updatePositionKpi) {
        response.status(200)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_updated_successfully'),
          data: { positionKpi: updatePositionKpi },
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
   * /api/position-kpis/delete/{positionKpiId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position KPIs
   *     summary: delete position KPI
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: positionKpiId
   *         schema:
   *           type: number
   *         description: Position KPI id
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
      const positionKpiId = request.param('positionKpiId')
      if (!positionKpiId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The position KPI Id was not found',
          message: 'Missing data to process',
          data: { positionKpiId },
        }
      }
      const currentPositionKpi = await PositionKpi.query()
        .whereNull('position_kpi_deleted_at')
        .where('position_kpi_id', positionKpiId)
        .first()
      if (!currentPositionKpi) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The position KPI was not found',
          message: 'The position KPI was not found with the entered ID',
          data: { positionKpiId },
        }
      }
      const positionKpiService = new PositionKpiService()
      const deletePositionKpi = await positionKpiService.delete(currentPositionKpi)
      if (deletePositionKpi) {
        response.status(200)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_deleted_successfully'),
          data: { positionKpi: deletePositionKpi },
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
   * /api/position-kpis/distinct-names:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position KPIs
   *     summary: get distinct position KPI names
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
      const positionKpiService = new PositionKpiService()
      const positionKpiNames = await positionKpiService.getDistinctNames()

      response.status(200)
      return {
        type: 'success',
        title: t('resource'),
        message: t('resource_was_found_successfully'),
        data: { positionKpiNames },
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
   * /api/position-kpis/get-by-position/{positionId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position KPIs
   *     summary: get position KPIs by position id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: positionId
   *         schema:
   *           type: integer
   *         description: Position Identifier
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
  async getByPosition({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const positionId = request.param('positionId')
      if (!positionId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The position id was not found',
          data: { positionId },
        }
      }
      const positionKpiService = new PositionKpiService()
      const positionKpis = await positionKpiService.getByPosition(positionId)
      if (!positionKpis) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The position KPIs were not found',
          message: 'The position KPIs were not found with the entered id',
          data: { positionId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: t('resources'),
          message: t('resources_were_found_successfully'),
          data: { positionKpis },
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
