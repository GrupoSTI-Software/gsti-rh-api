import { HttpContext } from '@adonisjs/core/http'
import UserFcmToken from '#models/user_fcm_token'
import UserFcmTokenService from '#services/user_fcm_token_service'
import { createdUserFcmTokenValidator } from '#validators/user_fcm_token'
import { DateTime } from 'luxon'

export default class UserFcmTokenController {
  /**
   * @swagger
   * /api/user-fcm-tokens:
   *   post: 
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - User FCM Tokens
   *     summary: register or update user fcm token
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               userId:
   *                 type: number
   *                 description: User id
   *                 required: true
   *                 default: ''
   *               userFcmToken:
   *                 type: string
   *                 description: User FCM token
   *                 required: true
   *                 default: ''
   *               userFcmTokenActive:
   *                 type: number
   *                 description: User FCM token active
   *                 required: true
   *                 default: '1'
   *               userFcmTokenPlatform:
   *                 type: string
   *                 description: User FCM token platform (android, ios, web, etc.)
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
  async registerOrUpdate({ request, response }: HttpContext) {
    try {
      const userId = request.input('userId')
      const userFcmToken = request.input('userFcmToken')
      const userFcmTokenActive = request.input('userFcmTokenActive')
      const userFcmTokenPlatform = request.input('userFcmTokenPlatform')
      const userFcmTokenData = {
        userId: userId,
        userFcmToken: userFcmToken,
        userFcmTokenActive: userFcmTokenActive,
        userFcmTokenPlatform: userFcmTokenPlatform,
        userFcmTokenLastSeenAt: DateTime.now().toISO(),
      } as UserFcmToken
      const userFcmTokenService = new UserFcmTokenService()
      const data = await request.validateUsing(createdUserFcmTokenValidator)
      const exist = await userFcmTokenService.verifyInfoExist(userFcmTokenData)
      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...data },
        }
      }

      // verificar si ya existe solo se actualiza
      const existUserFcmToken = await userFcmTokenService.show(userFcmTokenData)
      if (existUserFcmToken) {
        const updateUserFcmToken = await userFcmTokenService.update(existUserFcmToken, userFcmTokenData)
        response.status(200)
        return {
          type: 'success',
          title: 'User FCM Tokens',
          message: 'The user fcm token was updated successfully',
          data: { userFcmToken: updateUserFcmToken },
        }
        } else {
          const newUserFcmToken = await userFcmTokenService.create(userFcmTokenData)
          response.status(201)
          return {
            type: 'success',
            title: 'User FCM Tokens',
            message: 'The user fcm token was created successfully',
            data: { userFcmToken: newUserFcmToken },
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

}
