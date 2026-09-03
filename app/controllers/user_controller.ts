/* eslint-disable prettier/prettier */
import User from '../models/user.js'
import Ws from '#services/ws'
import { HttpContext } from '@adonisjs/core/http'
import ApiToken from '../models/api_token.js'
import { uuid } from 'uuidv4'
import mail from '@adonisjs/mail/services/main'
import { resolveMailSender } from '#helpers/resolve_mail_sender'
import UserService from '#services/user_service'
import { createUserValidator, updateUserValidator } from '#validators/user'
import { UserFilterSearchInterface } from '../interfaces/user_filter_search_interface.js'
import { DateTime } from 'luxon'
import { LogStore } from '#models/MongoDB/log_store'
import { LogAuthentication } from '../interfaces/MongoDB/log_authentication.js'
import { EmployeeAssignedFilterSearchInterface } from '../interfaces/employee_assigned_filter_search_interface.js'
import EmployeeDevice from '#models/employee_device'
import EmployeeDeviceService from '#services/employee_device_service'
import Person from '#models/person'
import Employee from '#models/employee'
import BusinessUnit from '#models/business_unit'
import AuthTokenService from '#services/auth_token_service'
import AuthMailService, { type AuthMailLanguage } from '#services/auth_mail_service'
import RoleService from '#services/role_service'
import { AUTH_LOGIN_ERRORS } from '#constants/auth_login_error_codes'
import { respondRefreshTokenUnauthorized } from '../helpers/auth_token_response.js'
import i18nManager from '@adonisjs/i18n/services/main'
import logger from '@adonisjs/core/services/logger'
import { resolveMailLocale } from '#constants/mail_locale'
import { isValidPassword } from '#helpers/password_policy'
import { PASSWORD_RECOVERY_PIN_VALIDITY_MINUTES } from '#constants/password_recovery'
import { secureRandomInt } from '#helpers/csprng_string'
import {
  buildInvitationTokenExpiresAt,
  generateInvitationToken,
  generateProvisionalPassword,
} from '#helpers/user_invitation_credentials'
import { USER_INVITATION_LOGIN_ERRORS, USER_INVITATION_RESEND_ERRORS } from '#constants/user_invitation_error_codes'
import {
  isSensitiveDataWriteError,
  respondSensitiveDataWriteDenial,
} from '#helpers/sensitive_data_write_api_error'
import { normalizeToken } from '#helpers/employee_termination_record'
import { SensitiveAccessContext } from '#utils/sensitive_access_context'
import { SENSITIVE_DATA_WRITE_ERROR_CODES } from '#constants/sensitive_data_write_error_codes'
import { SensitiveDataWriteError } from '#exceptions/sensitive_data_write_error'

/**
 * CSPRNG (USRH1786458240779): mismo rango 100000-999999 y misma vigencia
 * de siempre; solo cambia la fuente de aleatoriedad — `crypto.randomInt`
 * ya es uniforme y sin sesgo de módulo, así que no hace falta reimplementar
 * el muestreo con rechazo (helper compartido con USRH1783115930049).
 */
function generateRecoveryPin(): string {
  return String(secureRandomInt(100000, 1000000))
}

async function dispatchUserInvitationEmail(user: User): Promise<void> {
  await user.load('person')
  const empleadoRole = await new RoleService().findRoleBySlug('empleado')
  const canAccessBackoffice = !empleadoRole || user.roleId !== empleadoRole.roleId
  const authMailService = new AuthMailService()
  await authMailService.sendUserInvitation({
    to: user.userEmail,
    firstName: user.person?.personFirstname || user.userEmail,
    invitationToken: user.userToken,
    language: 'es',
    canAccessBackoffice,
  })
}

/**
 * Verifica el permiso de categoría `contacto` ANTES de crear/actualizar el `User`,
 * para no dejar un `User` huérfano si `Person.personEmail` cambiaría y el actor
 * no tiene `sensitive-contacto-write` (hallazgo Important 1, revisión final de
 * sensitive-write-by-category).
 */
function assertContactoEmailWriteAllowed(
  currentEmail: string | null | undefined,
  newEmail: string | null | undefined
): void {
  if (!SensitiveAccessContext.isActive() || SensitiveAccessContext.isUnguarded()) return
  if (normalizeToken(currentEmail) === normalizeToken(newEmail)) return

  const decision = SensitiveAccessContext.writeDecision('contacto')
  if (decision === 'allowed') return
  if (decision === 'unresolved') {
    throw new SensitiveDataWriteError(SENSITIVE_DATA_WRITE_ERROR_CODES.UNRESOLVED)
  }
  throw new SensitiveDataWriteError(SENSITIVE_DATA_WRITE_ERROR_CODES.FORBIDDEN, 'contacto')
}

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
   *     description: |
   *       Autentica al usuario validando email, contraseña, `user_active = 1` y `user_deleted_at IS NULL`.
   *       Desde la introducción de la tabla pivote `business_unit_users`, este endpoint ya no realiza
   *       intersección estática de unidades de negocio: el alcance multi-tenant se evalúa en cada operación
   *       posterior a través de las unidades de negocio asociadas al usuario (scope dinámico).
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
   *               deviceOrigin:
   *                 type: string
   *                 description: Device origin
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
   *       '403':
   *         description: Acceso denegado (empleado en web o cuenta pendiente de activar)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                 code:
   *                   type: string
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
      // el tipo de token es el tipo de dispositivo que se esta usando se debe sacar del origin
      const deviceOrigin = request.input('deviceOrigin')
      const origin = deviceOrigin === 'app' ? 'app' : 'web'
      const deviceToken = request.input('deviceToken')
      const userEmail = request.input('userEmail')
      const userPassword = request.input('userPassword')
      const user = await User.query()
        .where('user_email', userEmail)
        .where('user_active', 1)
        .preload('person', (personQuery) =>
          personQuery.preload('employee', (employeeQuery) => {
            employeeQuery.preload('position', (positionQuery) =>
              positionQuery.whereNull('position_deleted_at')
            )
            // La app cliente necesita el UUID público de la unidad de negocio
            // para enviarlo en el header x-business-unit-id de las siguientes
            // solicitudes; el login es el único punto sin ese header.
            employeeQuery.preload('businessUnit')
          })
        )
        .first()

      if (!user) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Login',
          message: 'Incorrect email or password',
          data: { user: {} },
        }
      }

      if (user.userPasswordSetAt === null) {
        const err = USER_INVITATION_LOGIN_ERRORS.PENDING_ACTIVATION
        response.status(err.status)
        return {
          title: err.title,
          detail: err.detail,
          key: err.key,
          code: err.code,
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
            title: AUTH_LOGIN_ERRORS.EMPLOYEE_NOT_FOUND.title,
            message: AUTH_LOGIN_ERRORS.EMPLOYEE_NOT_FOUND.detail,
            detail: AUTH_LOGIN_ERRORS.EMPLOYEE_NOT_FOUND.detail,
            key: AUTH_LOGIN_ERRORS.EMPLOYEE_NOT_FOUND.key,
            data: { user: {} },
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
            title: AUTH_LOGIN_ERRORS.DEVICE_TAKEN.title,
            message: AUTH_LOGIN_ERRORS.DEVICE_TAKEN.detail,
            detail: AUTH_LOGIN_ERRORS.DEVICE_TAKEN.detail,
            key: AUTH_LOGIN_ERRORS.DEVICE_TAKEN.key,
            data: { user: {} },
          }
        }

        if (
          employeeDevice &&
          employeeDevice.employeeDeviceActive !== 1 &&
          employeeDevice.employeeId === currentEmployee.employeeId
        ) {
          response.status(400)
          return {
            type: 'warning',
            title: 'Login',
            message: 'This device is not active.',
            data: { user: {} },
          }
        }

        // Crear o verificar dispositivo si no existe
        if (!employeeDevice) {
          // const employeeDeviceActive = await EmployeeDevice.query()
          //   .where('employee_id', currentEmployee.employeeId)
          //   .where('employeeDeviceActive', 1)
          //   .whereNull('employee_device_deleted_at')
          //   .first()

          // if (employeeDeviceActive) {
          //   response.status(400)
          //   return {
          //     type: 'warning',
          //     title: 'Login',
          //     message: 'This account is already registered on another device. Please contact your manager to activate access on this new device.',
          //     data: { user: {} }
          //   }
          // }

          const deviceData = {
            employeeDeviceToken: deviceToken,
            employeeDeviceModel: request.input('deviceModel') || 'Unknown',
            employeeDeviceBrand: request.input('deviceBrand') || 'Unknown',
            employeeDeviceType: request.input('deviceType') || 'Unknown',
            employeeDeviceOs: request.input('deviceOs') || 'Unknown',
            employeeId: currentEmployee.employeeId,
          } as EmployeeDevice

          const employeeDeviceService = new EmployeeDeviceService(i18n)
          const verifyInfo = await employeeDeviceService.verifyInfoExist(deviceData)

          if (verifyInfo.status !== 200) {
            response.status(verifyInfo.status)
            return {
              type: verifyInfo.type,
              title: verifyInfo.title,
              message: verifyInfo.message,
              data: { user: {} },
            }
          }

          await employeeDeviceService.create(deviceData)
        }
      }

      let userVerify = false
      try {
        await User.verifyCredentials(userEmail, userPassword)
        userVerify = true
      } catch (error) {
        if (error.code !== 'E_INVALID_CREDENTIALS') {
          throw error
        }
      }

      if (!userVerify) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Login',
          message: 'Incorrect email or password',
          data: { user: {} },
        }
      }

      if (origin === 'web') {
        const roleService = new RoleService()
        const employeeRole = await roleService.findRoleBySlug('empleado')
        if (employeeRole && user.roleId === employeeRole.roleId) {
          response.status(403)
          return {
            title: AUTH_LOGIN_ERRORS.BACKOFFICE_FORBIDDEN.title,
            detail: AUTH_LOGIN_ERRORS.BACKOFFICE_FORBIDDEN.detail,
            key: AUTH_LOGIN_ERRORS.BACKOFFICE_FORBIDDEN.key,
          }
        }
      }

      await ApiToken.query().where('tokenable_id', user.userId).where('origin', origin).delete()

      if (Ws.io) {
        try {
          Ws.io.emit(`user-forze-logout:${user.userEmail}:${origin}`, {})
        } catch (error) {}
      }

      const authTokenService = new AuthTokenService()
      const { accessToken, refreshToken } = await authTokenService.issueTokenPair(user, origin)

      const date = DateTime.local().setZone('utc').toISO()
      try {
        const rawHeaders = request.request.rawHeaders
        const userService = new UserService(i18n)
        const userAgent = userService.getHeaderValue(rawHeaders, 'User-Agent')
        const secChUaPlatform = userService.getHeaderValue(rawHeaders, 'sec-ch-ua-platform')
        const secChUa = userService.getHeaderValue(rawHeaders, 'sec-ch-ua')
        const originHeader = userService.getHeaderValue(rawHeaders, 'Origin')
        await LogStore.set('log_authentication', {
          user_agent: userAgent,
          sec_ch_ua_platform: secChUaPlatform,
          sec_ch_ua: secChUa,
          origin: originHeader,
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
          token: accessToken,
          refreshToken,
        },
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
   * /api/auth/refresh:
   *   post:
   *     tags:
   *       - Users
   *     summary: Renovar access token usando refresh token
   *     description: |
   *       Valida el refresh token opaco, rota el par completo (access + refresh)
   *       y mantiene sesión única por origin. Responde 401 si el refresh token
   *       es inválido, expirado o pertenece a un usuario inactivo.
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - refreshToken
   *             properties:
   *               refreshToken:
   *                 type: string
   *                 description: Refresh token opaco emitido en login o signup
   *     responses:
   *       '200':
   *         description: Par de tokens renovado exitosamente
   *       '400':
   *         description: Refresh token no enviado
   *       '401':
   *         description: Refresh token inválido o expirado
   */
  async refresh({ request, response }: HttpContext) {
    try {
      const refreshTokenValue = request.input('refreshToken')

      if (!refreshTokenValue || typeof refreshTokenValue !== 'string') {
        response.status(400)
        return {
          type: 'error',
          title: 'Error de validación',
          message: 'El refresh token es requerido',
          data: null,
        }
      }

      const authTokenService = new AuthTokenService()
      const verified = await authTokenService.verifyRefreshToken(refreshTokenValue)

      if (verified.status === 'error') {
        return respondRefreshTokenUnauthorized(response, verified.code)
      }

      const { accessToken, refreshToken } = await authTokenService.rotateTokenPair(
        verified.user,
        verified.origin
      )

      response.status(200)
      return {
        type: 'success',
        title: 'Refresh',
        message: 'Tokens renovados exitosamente',
        data: {
          token: accessToken,
          refreshToken,
        },
      }
    } catch (error: any) {
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
        query.preload('employee', (employeeQuery) => {
          employeeQuery.preload('position', (positionQuery) =>
            positionQuery.whereNull('position_deleted_at')
          )
          // La app cliente lee businessUnitPublicId de aquí para el header
          // x-business-unit-id; /auth/session no exige ese header.
          employeeQuery.preload('businessUnit')
        })
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
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               deviceOrigin:
   *                 type: string
   *                 description: Device origin
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
  async logout({ auth, request, response }: HttpContext) {
    try {
      const user = await auth.authenticateUsing(['api'])
      const deviceOrigin = request.input('deviceOrigin')
      const origin = deviceOrigin === 'app' ? 'app' : 'web'

      // Revoca access + refresh del origin: el delete no filtra por `type`.
      await ApiToken.query().where('tokenable_id', user.userId).where('origin', origin).delete()

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
   *               isApp:
   *                 type: boolean
   *                 description: Is app
   *                 default: false
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
  async recoveryPassword({ request, response }: HttpContext) {
    const languageInput = request.input('language', 'es')
    const language: AuthMailLanguage = languageInput === 'en' ? 'en' : 'es'
    const i18n = i18nManager.locale(language)

    try {
      const userEmail = request.input('userEmail')
      const isApp = !!request.all().isApp

      if (!userEmail || typeof userEmail !== 'string' || !userEmail.includes('@')) {
        response.status(200)
        return {
          type: 'success',
          title: i18n.formatMessage('password_recovery_title'),
          message: i18n.formatMessage('password_recovery_request_sent'),
          data: this.buildRecoveryAppPayload(isApp),
        }
      }

      const url = request.header('origin')
      const hostData = this.getUrlInfo(url ?? 'no_url_host_data_provided')

      const user = await User.query()
        .where('user_email', userEmail.trim().toLowerCase())
        .whereNull('user_deleted_at')
        .preload('person')
        .first()

      if (!user) {
        response.status(200)
        return {
          type: 'success',
          title: i18n.formatMessage('password_recovery_title'),
          message: i18n.formatMessage('password_recovery_request_sent'),
          data: this.buildRecoveryAppPayload(isApp),
        }
      }

      const pinCode = generateRecoveryPin()
      user.userToken = uuid()
      user.pinCode = pinCode
      user.pinCodeExpiresAt = DateTime.utc().plus({ minutes: PASSWORD_RECOVERY_PIN_VALIDITY_MINUTES })
      await user.save()

      if (isApp) {
        // USRH1783712837584: este endpoint corre sin usuario autenticado
        // (recuperación de contraseña, previo al login) — no hay empresa en
        // contexto que resolver. El branding "white label" por System Settings
        // estuvo deshabilitado (isWhiteLabel siempre false) y nunca se aplicaba;
        // se retira la consulta muerta a `getActive()` en vez de migrarla a
        // `resolveByBusinessUnitId`, que exigiría un tenant que aquí no existe.
        const tradeName = 'Valanserh'
        const backgroundImageLogo =
          'https://gsti-assets.sfo3.cdn.digitaloceanspaces.com/valanserh/logos/logotipo-min.png'

        const smtpUsername = resolveMailSender()
        // El asunto es parte del correo, no de la respuesta: va en el idioma
        // forzado de los correos, no en el que pidió el cliente.
        const emailSubject = i18nManager
          .locale(resolveMailLocale(language))
          .formatMessage('auth.password_recovery.subject', { tradeName })
        await mail.send((message) => {
          message
            .to(user.userEmail)
            .from(smtpUsername, tradeName)
            .subject(emailSubject)
            .htmlView('emails/request_password', {
              user,
              token: user.userToken,
              host_data: hostData,
              backgroundImageLogo,
              isApp: true,
              pinCode: user.pinCode,
              // La vigencia se pasa desde la constante que fija `pinCodeExpiresAt`:
              // así el texto del correo no puede desincronizarse del vencimiento real.
              validityMinutes: PASSWORD_RECOVERY_PIN_VALIDITY_MINUTES,
            })
        })
      } else {
        const resetUrl = `${hostData.host_uri.replace(/\/$/, '')}/new-password/${user.userToken}`
        const authMailService = new AuthMailService()
        await authMailService.sendPasswordRecovery({
          to: user.userEmail,
          firstName: user.person?.personFirstname || user.userEmail,
          resetUrl,
          pinCode,
          language,
        })
      }

      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('password_recovery_title'),
        message: i18n.formatMessage('password_recovery_request_sent'),
        // La app necesita el token para verificar el código contra el servidor
        // (`/auth/recovery/code-verify`); el PIN NUNCA viaja en la respuesta,
        // solo llega al buzón. Sin PIN el token no sirve para nada: el reset
        // exige que el código ya se haya consumido.
        data: isApp ? { user: { userToken: user.userToken } } : null,
      }
    } catch (error) {
      // La respuesta al cliente sigue siendo genérica a propósito (no revela si
      // el correo existe), pero el fallo real —SMTP caído, plantilla rota, error
      // de base— tiene que quedar registrado: sin esta traza un envío que nunca
      // sale se ve desde fuera igual que uno exitoso.
      logger.error({ err: error }, 'auth:recovery — fallo al procesar la solicitud de recuperación')
      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('password_recovery_title'),
        message: i18n.formatMessage('password_recovery_request_sent'),
        data: null,
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
  async verifyRequestRecovery({ params, response, i18n }: HttpContext) {
    try {
      const user = await User.query()
        .where('user_token', params.token)
        .whereNull('user_deleted_at')
        .first()
      if (!user) {
        response.status(404)
        return {
          type: 'warning',
          title: i18n.formatMessage('password_recovery_title'),
          message: i18n.formatMessage('password_recovery_token_invalid'),
          data: {},
        }
      }
      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('password_recovery_title'),
        message: i18n.formatMessage('password_recovery_token_valid'),
        data: { user: user },
      }
    } catch (error: any) {
      response.status(500)
      return {
        type: 'error',
        title: i18n.formatMessage('server_error'),
        message: i18n.formatMessage('an_unexpected_error_has_occurred_on_the_server'),
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
          title: i18n.formatMessage('password_recovery_title'),
          message: i18n.formatMessage('password_recovery_token_invalid'),
          data: {},
        }
      }

      if (user.pinCode && user.pinCode.trim() !== '') {
        response.status(401)
        return {
          type: 'warning',
          title: i18n.formatMessage('password_recovery_title'),
          message: i18n.formatMessage('password_recovery_pin_pending'),
          key: 'AUTH.RECOVERY.PIN_PENDING',
          data: null,
        }
      }

      let userPassword = request.input('userPassword')
      const passwordArray = Array.isArray(userPassword)
      userPassword = passwordArray
        ? userPassword.map((item: string) => item).join(',')
        : userPassword

      // La política se valida aquí y no solo en pantalla: el backoffice y la app
      // pintan el medidor, pero quien llame al endpoint directo se los salta.
      if (!isValidPassword(userPassword)) {
        response.status(422)
        return {
          type: 'warning',
          title: i18n.formatMessage('password_recovery_title'),
          message: i18n.formatMessage('password_recovery_policy_unmet'),
          key: 'AUTH.RECOVERY.PASSWORD_POLICY',
          data: null,
        }
      }

      user.userPassword = userPassword
      user.userToken = ''
      user.pinCode = ''
      user.pinCodeExpiresAt = null
      user.save()

      // El aviso de "tu contraseña cambió" se manda siempre: es la señal con la
      // que alguien detecta un acceso ajeno. La app no envía `Origin`, así que
      // el servicio resuelve el destino del CTA por su cuenta.
      const url = request.header('origin') ?? null
      try {
        const userService = new UserService(i18n)
        await userService.sendNewPasswordEmail(url, user)
      } catch (error) {
        // El cambio de contraseña ya está hecho y confirmado al cliente: que
        // falle el aviso no lo revierte, pero no puede pasar en silencio.
        logger.error({ err: error }, 'auth:password-reset — fallo al enviar el aviso de cambio')
      }

      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('password_recovery_title'),
        message: i18n.formatMessage('password_recovery_reset_success'),
        data: { user: user },
      }
    } catch (error: any) {
      response.status(500)
      return {
        type: 'error',
        title: i18n.formatMessage('server_error'),
        message: i18n.formatMessage('an_unexpected_error_has_occurred_on_the_server'),
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
   *       - name: businessUnitId
   *         in: query
   *         required: true
   *         description: Business unit id
   *         schema:
   *           type: integer
   *       - name: page
   *         in: query
   *         required: true
   *         description: The page number
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
  async index({ request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const search = request.input('search')
      const roleId = request.input('roleId')
      const businessUnitId = request.input('businessUnitId')
      const page = request.input('page', 1)
      const limit = request.input('limit', 100)
      const filters = {
        search: search,
        roleId: roleId,
        businessUnitId: businessUnitId,
        page: page,
        limit: limit,
      } as UserFilterSearchInterface
      const userService = new UserService(i18n)
      const users = await userService.index(filters, businessUnitScope)
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
   *               userTypeEmail:
   *                 type: string
   *                 description: User type email
   *                 required: true
   *                 default: 'institutional'
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
   *       '403':
   *         description: Sin permiso de categoría para la transición de un dato sensible. Ningún campo se guardó.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title: { type: string, example: Sin permiso para modificar datos sensibles }
   *                 detail: { type: string, example: No tienes permiso para modificar datos financieros. Ningún dato de la petición se guardó. }
   *                 key: { type: string, example: sin-permiso-para-modificar-datos-sensibles }
   *                 code: { type: string, example: EMP.SENS.WRITE.FORBIDDEN }
   */
  async store(ctx: HttpContext) {
    const { auth, request, response, i18n, businessUnitScope } = ctx
    try {
      const userEmail = request.input('userEmail')
      const userActive = request.input('userActive')
      const roleId = request.input('roleId')
      const personId = request.input('personId')
      const userEmailType = request.input('userEmailType')

      const businessUnits = await BusinessUnit.query()
        .whereIn('business_unit_id', businessUnitScope)
        .where('business_unit_active', 1)
        .whereNull('business_unit_deleted_at')
        .select('business_unit_id')
      
      const businessUnitIds = businessUnits.map((unit) => unit.businessUnitId)

      const user = {
        userEmail: userEmail,
        userPassword: generateProvisionalPassword(),
        userActive: userActive,
        roleId: roleId,
        personId: personId,
        userEmailType: userEmailType,
        userToken: generateInvitationToken(),
        userTokenExpiresAt: buildInvitationTokenExpiresAt(),
        userPasswordSetAt: null,
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
      let personForEmailSync: Person | null = null
      if (userEmailType === 'personal') {
        personForEmailSync = await Person.query()
          .where('person_id', personId)
          .whereNull('person_deleted_at')
          .first()
        if (personForEmailSync) {
          // Verificar el permiso de `contacto` ANTES de crear el `User`: evita dejar
          // un `User` huérfano si el correo de la persona no puede actualizarse.
          assertContactoEmailWriteAllowed(personForEmailSync.personEmail, userEmail)
        }
      }

      const newUser = await userService.create(user, businessUnitIds)
      if (newUser) {
        if (newUser.userEmailType === 'personal') {
          if (personForEmailSync) {
            personForEmailSync.personEmail = newUser.userEmail
            await personForEmailSync.save()
          }
        } else {
          const employee = await Employee.query()
            .where('person_id', personId)
            .whereNull('employee_deleted_at')
            .first()
          if (employee) {
            employee.employeeBusinessEmail = newUser.userEmail
            await employee.save()
          }
        }

        const rawHeaders = request.request.rawHeaders
        const userId = auth.user?.userId
        if (userId) {
          const logUser = await userService.createActionLog(rawHeaders, 'store')
          logUser.user_id = userId
          logUser.record_current = JSON.parse(JSON.stringify(newUser))
          await userService.saveActionOnLog(logUser)
        }

        await dispatchUserInvitationEmail(newUser)

        response.status(201)
        return {
          type: 'success',
          title: 'Users',
          message: 'The user was created successfully',
          data: { user: newUser },
        }
      }
    } catch (error) {
      if (isSensitiveDataWriteError(error)) return respondSensitiveDataWriteDenial(ctx, error)
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
   * /api/users/{userId}/resend-access:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Users
   *     summary: Reenviar invitación de acceso a un usuario pendiente
   *     description: |
   *       Emite un token de invitación nuevo con vigencia de 5 días e invalida el anterior.
   *       Solo aplica a usuarios pendientes de activar (`user_password_set_at IS NULL`)
   *       dentro del scope de la empresa del administrador. Requiere permiso de edición.
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: userId
   *         schema:
   *           type: number
   *         required: true
   *     responses:
   *       '200':
   *         description: Invitación reenviada
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                   description: Message of response generated
   *                 code:
   *                   type: string
   *                   description: Code of response generated
   *                 detail:
   *                   type: string
   *                   description: Detail of response generated
   *                 key:
   *                   type: string
   *                   description: Key of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *       '404':
   *         description: Usuario no encontrado en el scope
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 detail:
   *                   type: string
   *                   description: Detail of response generated
   *                 key:
   *                   type: string
   *                   description: Key of response generated
   *                 code:
   *                   type: string
   *                   description: Code of response generated
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *       '409':
   *         description: Usuario ya activado
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 detail:
   *                   type: string
   *                   description: Detail of response generated
   *                 key:
   *                   type: string
   *                   description: Key of response generated
   *                 code:
   *                   type: string
   *                   description: Code of response generated
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *       '429':
   *         description: Límite de reenvíos alcanzado
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 detail:
   *                   type: string
   *                   description: Detail of response generated
   *                 key:
   *                   type: string
   *                   description: Key of response generated
   *                 code:
   *                   type: string
   *                   description: Code of response generated
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   */
  async resendAccess({ response, i18n, scopedUser }: HttpContext) {
    const targetUser = scopedUser!
    const userService = new UserService(i18n)

    if (targetUser.userPasswordSetAt !== null) {
      const err = USER_INVITATION_RESEND_ERRORS.ALREADY_ACTIVATED
      response.status(err.status)
      return {
        title: err.title,
        detail: err.detail,
        key: err.key,
        code: err.code,
      }
    }

    const updatedUser = await userService.rotateInvitationAccess(targetUser)
    await dispatchUserInvitationEmail(updatedUser)

    response.status(200)
    return {
      message: 'Se reenvió la invitación de acceso correctamente.',
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
   *               userTypeEmail:
   *                 type: string
   *                 description: User type email
   *                 required: true
   *                 default: 'institutional'
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
   *       '403':
   *         description: Sin permiso de categoría para la transición de un dato sensible. Ningún campo se guardó.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title: { type: string, example: Sin permiso para modificar datos sensibles }
   *                 detail: { type: string, example: No tienes permiso para modificar datos financieros. Ningún dato de la petición se guardó. }
   *                 key: { type: string, example: sin-permiso-para-modificar-datos-sensibles }
   *                 code: { type: string, example: EMP.SENS.WRITE.FORBIDDEN }
   */
  async update(ctx: HttpContext) {
    const { auth, request, response, i18n, scopedUser } = ctx
    try {
      const currentUser = scopedUser!
      const userId = currentUser.userId
      const userService = new UserService(i18n)

      const userEmail = request.input('userEmail')
      const userActive = request.input('userActive')
      const roleId = request.input('roleId')
      const personId = request.input('personId')
      const userEmailType = request.input('userEmailType')
      const user = {
        userId: userId,
        userEmail: userEmail,
        userActive: userActive,
        roleId: roleId,
        personId: personId,
        userEmailType: userEmailType,
      } as User
      const previousUser = JSON.parse(JSON.stringify(currentUser))
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
      let personForEmailSync: Person | null = null
      if (userEmailType === 'personal') {
        personForEmailSync = await Person.query()
          .where('person_id', personId)
          .whereNull('person_deleted_at')
          .first()
        if (personForEmailSync) {
          // Verificar el permiso de `contacto` ANTES de actualizar el `User`: evita
          // dejar el `User` ya actualizado sin poder sincronizar el correo de la persona.
          assertContactoEmailWriteAllowed(personForEmailSync.personEmail, userEmail)
        }
      }

      const updateUser = await userService.update(currentUser, user)
      if (updateUser) {
        if (updateUser.userEmailType === 'personal') {
          if (personForEmailSync) {
            personForEmailSync.personEmail = updateUser.userEmail
            await personForEmailSync.save()
          }
        } else {
          const employee = await Employee.query()
            .where('person_id', personId)
            .whereNull('employee_deleted_at')
            .first()
          if (employee) {
            employee.employeeBusinessEmail = updateUser.userEmail
            await employee.save()
          }
        }
        const rawHeaders = request.request.rawHeaders
        const tokenUserId = auth.user?.userId
        if (tokenUserId) {
          const logUser = await userService.createActionLog(rawHeaders, 'update')
          logUser.user_id = tokenUserId
          logUser.record_current = JSON.parse(JSON.stringify(updateUser))
          logUser.record_previous = previousUser
          await userService.saveActionOnLog(logUser)
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
      if (isSensitiveDataWriteError(error)) return respondSensitiveDataWriteDenial(ctx, error)
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
  async delete({ auth, request, response, i18n, scopedUser }: HttpContext) {
    try {
      const currentUser = scopedUser!
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
  async show({ response, i18n, businessUnitScope, scopedUser }: HttpContext) {
    try {
      const userService = new UserService(i18n)
      const showUser = await userService.show(scopedUser!.userId, businessUnitScope)
      if (showUser) {
        response.status(200)
        return {
          type: 'success',
          title: 'Users',
          message: 'The user was found successfully',
          data: { user: showUser },
        }
      }

      response.status(404)
      return {
        type: 'warning',
        title: 'The user was not found',
        message: 'The user was not found with the entered ID',
        data: { userId: scopedUser!.userId },
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

  /**
   * Cuerpo `data` de la respuesta de recuperación para los caminos que NO
   * llegan a enviar correo (correo mal formado o no registrado).
   *
   * La app espera un token para el siguiente paso, así que en esos casos se
   * devuelve uno aleatorio que no corresponde a ningún usuario: la respuesta es
   * indistinguible de la de un correo válido y sigue sin revelar qué cuentas
   * existen. Ese token no abre nada — la verificación del código lo rechaza.
   *
   * @param isApp - true cuando la solicitud viene de la aplicación móvil.
   * @returns El `data` de la respuesta: `{ user: { userToken } }` o `null`.
   */
  private buildRecoveryAppPayload(isApp: boolean) {
    return isApp ? { user: { userToken: uuid() } } : null
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
  async getEmployeesAssigned({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
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
      const employeesAssigned = await userService.getEmployeesAssigned(filters, businessUnitScope)

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

  /**
   * @swagger
   * /api/auth/recovery/code-verify:
   *   post:
   *     tags:
   *       - Users
   *     summary: Verify recovery code OTP (web)
   *     description: |
   *       Validate token stage-1 + 6 digit code (scoped by user_token).
   *       In success clean the pin, rotate user_token and return the token stage-2.
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - token
   *               - pinCode
   *             properties:
   *               token:
   *                 type: string
   *               pinCode:
   *                 type: string
   *     responses:
   *       '200':
   *         description: Code verified; token rotated
   *       '400':
   *         description: Missing parameters
   *       '401':
   *         description: Invalid or expired code or token
   */
  async verifyRecoveryCode({ request, response, i18n }: HttpContext) {
    try {
      const token = request.input('token')
      const pinCode = request.input('pinCode')

      if (
        !token ||
        typeof token !== 'string' ||
        !pinCode ||
        typeof pinCode !== 'string' ||
        pinCode.trim().length !== 6
      ) {
        response.status(400)
        return {
          type: 'error',
          title: i18n.formatMessage('password_recovery_title'),
          message: i18n.formatMessage('password_recovery_code_missing'),
          key: 'AUTH.RECOVERY.CODE_MISSING',
          data: null,
        }
      }

      const user = await User.query()
        .where('user_token', token)
        .where('pin_code', pinCode.trim())
        .whereNull('user_deleted_at')
        .first()

      const isExpired =
        !user?.pinCodeExpiresAt || user.pinCodeExpiresAt < DateTime.utc()

      if (!user || isExpired) {
        response.status(401)
        return {
          type: 'warning',
          title: i18n.formatMessage('password_recovery_title'),
          message: i18n.formatMessage('password_recovery_code_invalid'),
          key: 'AUTH.RECOVERY.CODE_INVALID',
          data: null,
        }
      }

      const rotatedToken = uuid()
      user.userToken = rotatedToken
      user.pinCode = ''
      user.pinCodeExpiresAt = null
      await user.save()

      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('password_recovery_title'),
        message: i18n.formatMessage('password_recovery_code_success'),
        data: { token: rotatedToken },
      }
    } catch (error: any) {
      response.status(500)
      return {
        type: 'error',
        title: i18n.formatMessage('server_error'),
        message: i18n.formatMessage('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }
 /**
   * @swagger
   * /api/auth/request/code-verify/{pinCode}:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Users
   *     summary: verify password recovery code
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: pinCode
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
  async verifyRequestPinCode({ params, response, i18n }: HttpContext) {
    try {
      const user = await User.query()
        .where('pin_code', params.pinCode)
        .whereNull('user_deleted_at')
        .first()
      if (!user) {
        response.status(404)
        return {
          type: 'warning',
          title: i18n.formatMessage('password_recovery_title'),
          message: i18n.formatMessage('password_recovery_pin_invalid'),
          data: {},
        }
      }

      if (!user.pinCodeExpiresAt || user.pinCodeExpiresAt < DateTime.utc()) {
        response.status(401)
        return {
          type: 'warning',
          title: i18n.formatMessage('password_recovery_title'),
          message: i18n.formatMessage('password_recovery_pin_expired'),
          data: {},
        }
      }

      user.pinCode = ''
      user.pinCodeExpiresAt = null
      await user.save()
      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('password_recovery_title'),
        message: i18n.formatMessage('password_recovery_pin_success'),
        data: { user: user, token: user.userToken },
      }
    } catch (error: any) {
      response.status(500)
      return {
        type: 'error',
        title: i18n.formatMessage('server_error'),
        message: i18n.formatMessage('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }
}
