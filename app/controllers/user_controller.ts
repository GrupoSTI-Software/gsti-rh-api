/* eslint-disable prettier/prettier */
import User from '../models/user.js'
import Ws from '#services/ws'
import { HttpContext } from '@adonisjs/core/http'
import ApiToken from '../models/api_token.js'
import { uuid } from 'uuidv4'
import mail from '@adonisjs/mail/services/main'
import env from '../../start/env.js'
import UserService from '#services/user_service'
import { createUserValidator, updateUserValidator } from '#validators/user'
import { UserFilterSearchInterface } from '../interfaces/user_filter_search_interface.js'
import { DateTime } from 'luxon'
import { LogStore } from '#models/MongoDB/log_store'
import { LogAuthentication } from '../interfaces/MongoDB/log_authentication.js'
import SystemSettingService from '#services/system_setting_service'
import SystemSetting from '#models/system_setting'
import { EmployeeAssignedFilterSearchInterface } from '../interfaces/employee_assigned_filter_search_interface.js'
import EmployeeDevice from '#models/employee_device'
import EmployeeDeviceService from '#services/employee_device_service'

export default class UserController {
  /**
   * @swagger
   * /api/auth/login:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Users
   *     summary: login
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               userEmail:
   *                 type: string
   *                 description: User email
   *                 default: ''
   *               userPassword:
   *                 type: string
   *                 description: User password
   *                 default: ''
   *               deviceToken:
   *                 type: string
   *                 description: Device token
   *                 default: ''
   *                 required: false
   *               deviceModel:
   *                 type: string
   *                 description: Device model
   *                 default: ''
   *                 required: false
   *               deviceBrand:
   *                 type: string
   *                 description: Device brand
   *                 default: ''
   *                 required: false
   *               deviceType:
   *                 type: string
   *                 description: Device type
   *                 default: ''
   *                 required: false
   *               deviceOs:
   *                 type: string
   *                 description: Device os
   *                 default: ''
   *                 required: false
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
  async login({ request, response, i18n }: HttpContext) {
    try {
      const deviceToken = request.input('deviceToken')
      const userEmail = request.input('userEmail')
      const userPassword = request.input('userPassword')
      const user = await User.query().where('user_email', userEmail).where('user_active', 1).first()

      if (!user) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Login',
          message: 'Incorrect email or password',
          data: { user: {} }
        }
      }

      if (deviceToken) {
        const currentUser = await User.query()
          .where('user_id', user.userId)
          .preload('person', (query) => query.preload('employee'))
          .first()

        const currentEmployee = currentUser?.person?.employee

        if (!currentEmployee) {
          response.status(400)
          return {
            type: 'warning',
            title: 'Login',
            message: 'Employee not found',
            data: { user: {} }
          }
        }

        const employeeDevice = await EmployeeDevice.query()
          .where('employee_device_token', deviceToken)
          .whereNull('employee_device_deleted_at')
          .first()

        if (employeeDevice && employeeDevice.employeeId !== currentEmployee.employeeId) {
          response.status(400)
          return {
            type: 'warning',
            title: 'Login',
            message: 'This device is already associated with another employee.',
            data: { user: {} }
          }
        }

        // Crear o verificar dispositivo si no existe
        if (!employeeDevice) {
          const deviceData = {
            employeeDeviceToken: deviceToken,
            employeeDeviceModel: request.input('deviceModel'),
            employeeDeviceBrand: request.input('deviceBrand'),
            employeeDeviceType: request.input('deviceType'),
            employeeDeviceOs: request.input('deviceOs'),
            employeeId: currentEmployee.employeeId
          } as EmployeeDevice

          const employeeDeviceService = new EmployeeDeviceService(i18n)
          const verifyInfo = await employeeDeviceService.verifyInfoExist(deviceData)

          if (verifyInfo.status !== 200) {
            response.status(verifyInfo.status)
            return {
              type: verifyInfo.type,
              title: verifyInfo.title,
              message: verifyInfo.message,
              data: { user: {} }
            }
          }

          await employeeDeviceService.create(deviceData)
        }
       }

      await ApiToken.query().where('tokenable_id', user.userId).delete()

      if (Ws.io) {
        try {
          Ws.io.emit(`user-forze-logout:${user.userEmail}`, {})
        } catch (error) {}
      }

      const userVerify = await User.verifyCredentials(userEmail, userPassword)
      const token = await User.accessTokens.create(user)

      if (userVerify && token && user.userBusinessAccess) {
        const userBusinessAccessArray = user.userBusinessAccess.split(',')
        const systemBussines = env.get('SYSTEM_BUSINESS')
        const systemBussinesArray = systemBussines?.toString().split(',')
        if (!systemBussinesArray) {
          response.status(404)
          return {
            type: 'warning',
            title: 'Login',
            message: 'Incorrect email or password',
            data: { user: {} },
          }
        }
        const systemBussinesMatches = systemBussinesArray.filter((value) =>
          userBusinessAccessArray.includes(value)
        )
        if (systemBussinesMatches.length === 0) {
          response.status(404)
          return {
            type: 'warning',
            title: 'Login',
            message: 'Incorrect email or password',
            data: { user: {} },
          }
        }
        const date = DateTime.local().setZone('utc').toISO()
        try {
          const rawHeaders = request.request.rawHeaders
          const userService = new UserService(i18n)
          const userAgent = userService.getHeaderValue(rawHeaders, 'User-Agent')
          const secChUaPlatform = userService.getHeaderValue(rawHeaders, 'sec-ch-ua-platform')
          const secChUa = userService.getHeaderValue(rawHeaders, 'sec-ch-ua')
          const origin = userService.getHeaderValue(rawHeaders, 'Origin')
          await LogStore.set('log_authentication', {
            user_agent: userAgent,
            sec_ch_ua_platform: secChUaPlatform,
            sec_ch_ua: secChUa,
            origin: origin,
            date: date ? date : '',
            user_id: user.userId,
          } as LogAuthentication)
        } catch (err) {}
        response.status(200)
        return {
          type: 'success',
          title: 'Login',
          message: 'You have successfully logged in',
          data: {
            user: user,
            token: token.value!.release(),
          },
        }
      } else {
        response.status(404)
        return {
          type: 'warning',
          title: 'Login',
          message: 'Incorrect email or password',
          data: { user: {} },
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
   * /api/auth/session:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Users
   *     summary: get auth user session
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
  async authUser({ auth, response }: HttpContext) {
    const userData = await auth.authenticateUsing(['api'])
    await auth.use('api').authenticate()

    const user = await User.query()
      .where('user_id', userData.userId)
      .preload('person', (query) => {
        query.preload('employee')
      })
      .preload('role')
      .first()

    response.status(200)
    return response.send(user)
  }

  /**
   * @swagger
   * /api/auth/logout:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Users
   *     summary: logout
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
  async logout({ auth, response }: HttpContext) {
    try {
      const user = await auth.authenticateUsing(['api'])
      await auth.use('api').authenticate()
      await ApiToken.query().where('tokenable_id', auth.user!.userId).delete()
      response.status(200)
      return {
        type: 'success',
        title: 'Logout',
        message: 'You have successfully logged out',
        data: { user: user },
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
   * /api/auth/recovery:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Users
   *     summary: password recovery
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               userEmail:
   *                 type: string
   *                 description: User email
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
  async recoveryPassword({ request, response }: HttpContext) {
    try {
      const url = request.header('origin')
      if (url) {
        const hostData = this.getUrlInfo(url)
        const user = await User.query()
          .where('user_email', request.all().userEmail)
          .whereNull('user_deleted_at')
          .preload('person')
          .first()
        const encrypted = uuid()
        if (!user) {
          response.status(404)
          return {
            type: 'warning',
            title: 'Password recovery',
            message: 'Email not found',
            data: {},
          }
        }
        user.userToken = encrypted
        user.save()
        let tradeName = 'BO'
        let backgroundImageLogo = `${env.get('BACKGROUND_IMAGE_LOGO')}`
        const systemSettingService = new SystemSettingService()
        const systemSettingActive = (await systemSettingService.getActive()) as unknown as SystemSetting
        if (systemSettingActive) {
          if ( systemSettingActive.systemSettingLogo) {
            backgroundImageLogo = systemSettingActive.systemSettingLogo
          }
          if ( systemSettingActive.systemSettingTradeName) {
            tradeName = systemSettingActive.systemSettingTradeName
          }
        }
        const emailData = {
          user,
          token: user.userToken,
          host_data: hostData,
          backgroundImageLogo,
        }
        const userEmail = env.get('SMTP_USERNAME')
        if (userEmail) {
          await mail.send((message) => {
            message
              .to(request.all().userEmail)
              .from(userEmail, tradeName)
              .subject('Recover password')
              .htmlView('emails/request_password', emailData)
          })
        }
        response.status(200)
        return {
          type: 'success',
          title: 'Password recovery',
          message: 'A link has been sent to your email successfully',
          data: { user: user },
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
   * /api/auth/request/verify/{token}:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Users
   *     summary: verify password recovery token
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: token
   *         schema:
   *           type: string
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
  async verifyRequestRecovery({ params, response }: HttpContext) {
    try {
      const user = await User.query()
        .where('user_token', params.token)
        .whereNull('user_deleted_at')
        .first()
      if (!user) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Token verification',
          message: 'Invalid token',
          data: {},
        }
      }
      response.status(200)
      return {
        type: 'success',
        title: 'Token verification',
        message: 'The token is valid',
        data: { user: user },
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
   * /api/auth/password/reset:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Users
   *     summary: password change
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               token:
   *                 type: string
   *                 description: Token
   *                 default: ''
   *               userPassword:
   *                 type: string
   *                 description: User new password
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
  async passwordReset({ request, response, i18n }: HttpContext) {
    try {
      const user = await User.query()
        .where('user_token', request.input('token'))
        .whereNull('user_deleted_at')
        .preload('person')
        .first()

      if (!user) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Password change with token',
          message: 'Invalid token',
          data: {},
        }
      }
      let userPassword = request.input('userPassword')
      const passwordArray = Array.isArray(userPassword)
      userPassword = passwordArray
        ? userPassword.map((item: string) => item).join(',')
        : userPassword
      user.userPassword = userPassword
      user.userToken = ''
      user.save()
      const url = request.header('origin')
      if (url) {
        const userService = new UserService(i18n)
        userService.sendNewPasswordEmail(url, user, userPassword)
      }
     
      response.status(200)
      return {
        type: 'success',
        title: 'Password change with token',
        message: 'The password has been changed successfully',
        data: { user: user },
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
   * /api/users:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Users
   *     summary: get all
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search
   *         schema:
   *           type: string
   *       - name: roleId
   *         in: query
   *         required: false
   *         description: Role id
   *         schema:
   *           type: integer
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
  async index({ request, response, i18n }: HttpContext) {
    try {
      const search = request.input('search')
      const roleId = request.input('roleId')
      const page = request.input('page', 1)
      const limit = request.input('limit', 100)
      const filters = {
        search: search,
        roleId: roleId,
        page: page,
        limit: limit,
      } as UserFilterSearchInterface
      const userService = new UserService(i18n)
      const users = await userService.index(filters)
      response.status(200)
      return {
        type: 'success',
        title: 'Users',
        message: 'The users were found successfully',
        data: {
          users,
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
   * /api/users:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Users
   *     summary: create new user
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               userEmail:
   *                 type: string
   *                 description: User email
   *                 required: true
   *                 default: ''
   *               userPassword:
   *                 type: string
   *                 description: User password
   *                 required: true
   *                 default: ''
   *               userActive:
   *                 type: boolean
   *                 description: User status
   *                 required: true
   *                 default: true
   *               roleId:
   *                 type: number
   *                 description: Role id
   *                 required: true
   *                 default: ''
   *               personId:
   *                 type: number
   *                 description: Person id
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
  async store({ auth, request, response, i18n }: HttpContext) {
    try {
      const userEmail = request.input('userEmail')
      let userPassword = request.input('userPassword')
      const passwordArray = Array.isArray(userPassword)
      userPassword = passwordArray
        ? userPassword.map((item: string) => item).join(',')
        : userPassword
      const userActive = request.input('userActive')
      const roleId = request.input('roleId')
      const personId = request.input('personId')
      const systemBussines = env.get('SYSTEM_BUSINESS')
      const user = {
        userEmail: userEmail,
        userPassword: userPassword,
        userActive: userActive,
        roleId: roleId,
        personId: personId,
        userBusinessAccess: systemBussines,
      } as User
      const userService = new UserService(i18n)
      const data = await request.validateUsing(createUserValidator)
      const exist = await userService.verifyInfoExist(user)
      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...data },
        }
      }
      const newUser = await userService.create(user)
      if (newUser) {
        const rawHeaders = request.request.rawHeaders
        const userId = auth.user?.userId
        if (userId) {
          const logUser = await userService.createActionLog(rawHeaders, 'store')
          logUser.user_id = userId
          logUser.record_current = JSON.parse(JSON.stringify(newUser))
          await userService.saveActionOnLog(logUser)
        }
        const url = request.header('origin')
        if (url) {
          userService.sendNewPasswordEmail(url, newUser, userPassword)
        }
        response.status(201)
        return {
          type: 'success',
          title: 'Users',
          message: 'The user was created successfully',
          data: { user: newUser },
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
   * /api/users/{userId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Users
   *     summary: update user
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: userId
   *         schema:
   *           type: number
   *         description: User id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               userEmail:
   *                 type: string
   *                 description: User email
   *                 required: true
   *                 default: ''
   *               userPassword:
   *                 type: string
   *                 description: User password
   *                 required: false
   *                 default: ''
   *               userActive:
   *                 type: boolean
   *                 description: User status
   *                 required: true
   *                 default: true
   *               roleId:
   *                 type: number
   *                 description: Role id
   *                 required: true
   *                 default: ''
   *               personId:
   *                 type: number
   *                 description: Person id
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
  async update({ auth, request, response, i18n }: HttpContext) {
    try {
      const input = request.all()
      const userId = request.param('userId')
      const userEmail = request.input('userEmail')
      let userPassword = request.input('userPassword')
      const passwordArray = Array.isArray(userPassword)
      userPassword = passwordArray
        ? userPassword.map((item: string) => item).join(',')
        : userPassword
      input.userPassword = userPassword
      request.updateBody(input)
      const userActive = request.input('userActive')
      const roleId = request.input('roleId')
      const personId = request.input('personId')
      const user = {
        userId: userId,
        userEmail: userEmail,
        userPassword: userPassword,
        userActive: userActive,
        roleId: roleId,
        personId: personId,
      } as User
      if (!userId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The user Id was not found',
          message: 'Missing data to process',
          data: { ...user },
        }
      }
      const currentUser = await User.query()
        .whereNull('user_deleted_at')
        .where('user_id', userId)
        .first()
      if (!currentUser) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The user was not found',
          message: 'The user was not found with the entered ID',
          data: { ...user },
        }
      }
      const previousUser = JSON.parse(JSON.stringify(currentUser))
      const userService = new UserService(i18n)
      const data = await request.validateUsing(updateUserValidator)
      const verifyInfo = await userService.verifyInfo(user)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...data },
        }
      }
      const updateUser = await userService.update(currentUser, user)
      if (updateUser) {
        const rawHeaders = request.request.rawHeaders
        const tokenUserId = auth.user?.userId
        if (tokenUserId) {
          const logUser = await userService.createActionLog(rawHeaders, 'update')
          logUser.user_id = tokenUserId
          logUser.record_current = JSON.parse(JSON.stringify(updateUser))
          logUser.record_previous = previousUser
          await userService.saveActionOnLog(logUser)
        }
        if (userPassword) {
          await updateUser.load('person')
          const url = request.header('origin')
          if (url) {
            userService.sendNewPasswordEmail(url, updateUser, userPassword)
          }
        }
        response.status(201)
        return {
          type: 'success',
          title: 'Users',
          message: 'The user was updated successfully',
          data: { user: updateUser },
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
   * /api/users/{userId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Users
   *     summary: delete user
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: userId
   *         schema:
   *           type: number
   *         description: User id
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
  async delete({ auth, request, response, i18n }: HttpContext) {
    try {
      const userId = request.param('userId')
      if (!userId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The user Id was not found',
          message: 'Missing data to process',
          data: { userId },
        }
      }
      const currentUser = await User.query()
        .whereNull('user_deleted_at')
        .where('user_id', userId)
        .first()
      if (!currentUser) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The user was not found',
          message: 'The user was not found with the entered ID',
          data: { userId },
        }
      }
      const userService = new UserService(i18n)
      const deleteUser = await userService.delete(currentUser)
      if (deleteUser) {
        const rawHeaders = request.request.rawHeaders
        const tokenUserId = auth.user?.userId
        if (tokenUserId) {
          const logUser = await userService.createActionLog(rawHeaders, 'delete')
          logUser.user_id = tokenUserId
          logUser.record_current = JSON.parse(JSON.stringify(deleteUser))
          await userService.saveActionOnLog(logUser)
        }
        response.status(201)
        return {
          type: 'success',
          title: 'User',
          message: 'The user was deleted successfully',
          data: { user: deleteUser },
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
   * /api/users/{userId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Users
   *     summary: get user by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: userId
   *         schema:
   *           type: number
   *         description: User id
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
      const userId = request.param('userId')
      if (!userId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The user Id was not found',
          message: 'Missing data to process',
          data: { userId },
        }
      }
      const userService = new UserService(i18n)
      const showUser = await userService.show(userId)
      if (!showUser) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The user was not found',
          message: 'The user was not found with the entered ID',
          data: { userId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Users',
          message: 'The user was found successfully',
          data: { user: showUser },
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
   * /api/users/has-access-department/{userId}/{departmentId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Users
   *     summary: get user has access to department by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: userId
   *         schema:
   *           type: number
   *         description: User id
   *         required: true
   *       - in: path
   *         name: departmentId
   *         schema:
   *           type: number
   *         description: DepartmentId
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
  async hasAccessDepartment({ request, response, i18n }: HttpContext) {
    try {
      const userId = request.param('userId')
      if (!userId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The user Id was not found',
          data: { userId },
        }
      }
      const departmentId = request.param('departmentId')
      if (!departmentId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The department Id was not found',
          data: { departmentId },
        }
      }
      const userService = new UserService(i18n)
      const userHasAccess = await userService.hasAccessDepartment(userId, departmentId)
      response.status(200)
      return {
        type: 'success',
        title: 'Users',
        message: 'The user was found successfully',
        data: { userHasAccess: userHasAccess },
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

  private getUrlInfo(url: string) {
    return {
      name: 'SAE BackOffice',
      host_uri: url,
      logo_path: 'https://sae.com.mx/wp-content/uploads/2024/03/logo_sae.svg',
      primary_color: '#0a3459',
    }
  }


  /**
   * @swagger
   * /api/users/{userId}/employees-assigned/{employeeId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get employees assigned by employee id
   *     parameters:
   *       - in: query
   *         name: userId
   *         schema:
   *           type: integer
   *         description: ID of the user to filter
   *         required: true
   *       - in: query
   *         name: employeeId
   *         schema:
   *           type: integer
   *         description: ID of the employee to filter
   *         required: false
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search
   *         schema:
   *           type: string
   *       - name: departmentId
   *         in: query
   *         required: false
   *         description: DepartmentId
   *         schema:
   *           type: integer
   *       - name: positionId
   *         in: query
   *         required: false
   *         description: PositionId
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
  async getEmployeesAssigned({ auth, request, response, i18n }: HttpContext) {
    try {
      await auth.check()
      const user = auth.user
      let userResponsibleId = null
      if (user) {
        await user.preload('role')
        if (user.role.roleSlug !== 'root') {
          userResponsibleId = user?.userId
        }
      }
      const employeeId = request.param('employeeId')
      const userId = request.param('userId')
      if (!userId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The user Id was not found',
          data: { userId },
        }
      }

      const userService = new UserService(i18n)
      const showUser = await userService.show(userId)

      if (!showUser) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The user was not found',
          message: 'The user was not found with the entered ID',
          data: { employeeId },
        }
      }
      const search = request.input('search')
      const departmentId = request.input('departmentId')
      const positionId = request.input('positionId')
      const filters = {
        search: search,
        departmentId: departmentId,
        positionId: positionId,
        userId: userId,
        employeeId: employeeId,
        userResponsibleId: userResponsibleId,
      } as EmployeeAssignedFilterSearchInterface
      const employeesAssigned = await userService.getEmployeesAssigned(filters)

      response.status(200)
      return {
        type: 'success',
        title: 'Users',
        message: 'The employees assigned were found successfully',
        data: { data: employeesAssigned },
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
