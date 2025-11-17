import { HttpContext } from '@adonisjs/core/http'
import SystemSettingEmailService from '#services/system_setting_email_service'
import {
  createSystemSettingNotificationEmailValidator,
} from '#validators/system_setting_email'
import SystemSettingNotificationEmail from '#models/system_setting_notification_email'

/**
 * Controller for managing system setting notification emails
 * Handles CRUD operations for system setting notification email records
 */
export default class SystemSettingsNotificationEmailsController {
  /**
   * @swagger
   * /api/system-settings-notification-emails:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - SystemSettings NotificationEmails
   *     summary: Get all system setting notification emails
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
   *                   description: List of system setting notification emails
   *                   properties:
   *                     systemSettingNotificationEmails:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           systemSettingNotificationEmailId:
   *                             type: number
   *                             description: System setting notification email ID
   *                           systemSettingId:
   *                             type: number
   *                             description: System setting ID
   *                           email:
   *                             type: string
   *                             description: Notification email address
   *                           systemSettingNotificationEmailCreatedAt:
   *                             type: string
   *                             description: Creation date
   *                           systemSettingNotificationEmailUpdatedAt:
   *                             type: string
   *                             description: Last update date
   *                           systemSetting:
   *                             type: object
   *                             description: Related system setting information
   *       '500':
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
  async index({ response }: HttpContext) {
    try {
      const systemSettingEmailService = new SystemSettingEmailService()
      const systemSettingNotificationEmails = await systemSettingEmailService.index()

      response.status(200)
      return {
        type: 'success',
        title: 'SystemSettings NotificationEmails',
        message: 'System setting notification emails retrieved successfully',
        data: { systemSettingNotificationEmails },
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
   * /api/system-settings-notification-emails/{systemSettingId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - SystemSettings NotificationEmails
   *     summary: Get system setting notification emails by system setting ID
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: systemSettingId
   *         required: true
   *         schema:
   *           type: number
   *         description: System setting ID
   *         example: 3
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
   *                   description: List of system setting notification emails for the specified system setting
   *                   properties:
   *                     systemSettingNotificationEmails:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           systemSettingNotificationEmailId:
   *                             type: number
   *                             description: System setting notification email ID
   *                           systemSettingId:
   *                             type: number
   *                             description: System setting ID
   *                           email:
   *                             type: string
   *                             description: Notification email address
   *                           systemSettingNotificationEmailCreatedAt:
   *                             type: string
   *                             description: Creation date
   *                           systemSettingNotificationEmailUpdatedAt:
   *                             type: string
   *                             description: Last update date
   *                           systemSetting:
   *                             type: object
   *                             description: Related system setting information
   *       '404':
   *         description: System setting not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: warning
   *                 title:
   *                   type: string
   *                   example: System setting not found
   *                 message:
   *                   type: string
   *                   example: The system setting was not found with the entered ID
   *                 data:
   *                   type: object
   *                   description: System setting ID that was not found
   *                   properties:
   *                     systemSettingId:
   *                       type: number
   *       '500':
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
  async indexBySystemSetting({ params, response }: HttpContext) {
    try {
      const systemSettingId = params.systemSettingId

      if (!systemSettingId || Number.isNaN(Number(systemSettingId))) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Invalid parameter',
          message: 'The system setting ID must be a valid number',
          data: { systemSettingId },
        }
      }

      const systemSettingEmailService = new SystemSettingEmailService()
      const systemSettingNotificationEmails = await systemSettingEmailService.indexBySystemSetting(Number(systemSettingId))

      response.status(200)
      return {
        type: 'success',
        title: 'SystemSettings NotificationEmails',
        message: 'System setting notification emails retrieved successfully',
        data: { systemSettingNotificationEmails },
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
   * /api/system-settings-notification-emails:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - SystemSettings NotificationEmails
   *     summary: Create new system setting notification email
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               systemSettingId:
   *                 type: number
   *                 description: System setting ID
   *                 required: true
   *                 default: ''
   *               email:
   *                 type: string
   *                 description: Notification email address
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
  async store({ request, response }: HttpContext) {
    try {
      const systemSettingId = request.input('systemSettingId')
      const email = request.input('email')
      const systemSettingNotificationEmail = {
        systemSettingId: systemSettingId,
        email: email,
      } as SystemSettingNotificationEmail

      const systemSettingEmailService = new SystemSettingEmailService()
      const data = await request.validateUsing(createSystemSettingNotificationEmailValidator)

      const exist = await systemSettingEmailService.verifyInfoExist(systemSettingNotificationEmail)
      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...data },
        }
      }

      const verifyInfo = await systemSettingEmailService.verifyInfo(systemSettingNotificationEmail)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...data },
        }
      }

      const newSystemSettingNotificationEmail = await systemSettingEmailService.create(systemSettingNotificationEmail)
      if (newSystemSettingNotificationEmail) {
        response.status(201)
        return {
          type: 'success',
          title: 'SystemSettings NotificationEmails',
          message: 'The system setting notification email was created successfully',
          data: { systemSettingNotificationEmail: newSystemSettingNotificationEmail },
        }
      }
    } catch (error) {
      const messageError = error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
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
   * /api/system-settings-notification-emails/{systemSettingNotificationEmailId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - SystemSettings NotificationEmails
   *     summary: Delete system setting notification email
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: systemSettingNotificationEmailId
   *         schema:
   *           type: number
   *         description: System setting notification email ID
   *         required: true
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
  async delete({ request, response }: HttpContext) {
    try {
      const systemSettingNotificationEmailId = request.param('systemSettingNotificationEmailId')
      if (!systemSettingNotificationEmailId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The system setting notification email ID was not found',
          message: 'Missing data to process',
          data: { systemSettingNotificationEmailId },
        }
      }

      const currentSystemSettingNotificationEmail = await SystemSettingNotificationEmail.query()
        .whereNull('system_setting_notification_email_deleted_at')
        .where('system_setting_notification_email_id', systemSettingNotificationEmailId)
        .first()

      if (!currentSystemSettingNotificationEmail) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The system setting notification email was not found',
          message: 'The system setting notification email was not found with the entered ID',
          data: { systemSettingNotificationEmailId },
        }
      }

      const systemSettingEmailService = new SystemSettingEmailService()
      const deleteSystemSettingNotificationEmail = await systemSettingEmailService.delete(
        currentSystemSettingNotificationEmail
      )

      if (deleteSystemSettingNotificationEmail) {
        response.status(201)
        return {
          type: 'success',
          title: 'SystemSettings NotificationEmails',
          message: 'The system setting notification email was deleted successfully',
          data: { systemSettingNotificationEmail: deleteSystemSettingNotificationEmail },
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
