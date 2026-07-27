import { HttpContext } from '@adonisjs/core/http'
import PositionApprovalHistoryService from '#services/position_approval_history_service'
import PositionApprovalHistory from '#models/position_approval_history'
import { createPositionApprovalHistoryValidator } from '#validators/position_approval_history'
import { PositionApprovalHistoryError } from '#exceptions/position_approval_history_error'

export default class PositionApprovalHistoryController {
  /**
   * @swagger
   * /api/position-approval-histories:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Approval Histories
   *     summary: create new position approval history
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
   *               positionApprovalHistoryDate:
   *                 type: string
   *                 format: date-time
   *                 description: Position approval history date
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

      await request.validateUsing(createPositionApprovalHistoryValidator)
      const positionApprovalHistoryService = new PositionApprovalHistoryService()
      const positionId = request.input('positionId')
      const positionApprovalHistoryDate = request.input('positionApprovalHistoryDate')
      const positionApprovalHistory = {
        positionId: positionId,
        positionApprovalHistoryDate: new Date(positionApprovalHistoryDate),
      } as PositionApprovalHistory

      const newPositionApprovalHistory = await positionApprovalHistoryService.create(positionApprovalHistory)
      response.status(201)
      return {
        type: 'success',
        title: t('resource'),
        message: t('resource_was_created_successfully'),
        data: { positionApprovalHistory: newPositionApprovalHistory },
      }
    } catch (error) {
      // USRH1784259058555: puesto ajeno o inexistente → 404 uniforme, nunca "prohibido".
      if (error instanceof PositionApprovalHistoryError) {
        response.status(error.httpStatus)
        return {
          type: 'warning',
          title: t('resource'),
          message: error.message,
          data: null,
        }
      }
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
   * /api/position-approval-histories/last/{positionId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Approval Histories
   *     summary: get last position approval history by position id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: positionId
   *         schema:
   *           type: number
   *         description: Position id
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
  async getLast({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const positionId = request.param('positionId')
      if (!positionId) {
        response.status(400)
        return {
          type: 'warning',
          title: t('resource'),
          message: t('resource_id_was_not_found'),
          data: { positionId },
        }
        }
      const positionApprovalHistoryService = new PositionApprovalHistoryService()
      const showPositionApprovalHistory = await positionApprovalHistoryService.getLast(positionId)
     
      response.status(200)
      return {
        type: 'success',
        title: t('resource'),
        message: t('resource_was_found_successfully'),
        data: { positionApprovalHistory: showPositionApprovalHistory },
      }
      
    } catch (error) {
      // USRH1784259058555: puesto ajeno o inexistente → 404 uniforme, nunca "prohibido".
      if (error instanceof PositionApprovalHistoryError) {
        response.status(error.httpStatus)
        return {
          type: 'warning',
          title: t('resource'),
          message: error.message,
          data: null,
        }
      }
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
