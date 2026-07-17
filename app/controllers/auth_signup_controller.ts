/* eslint-disable prettier/prettier */
import { HttpContext } from '@adonisjs/core/http'
import { startSignupValidator, verifyOtpValidator, completeSignupValidator } from '#validators/signup'
import SignupDraftService from '#services/signup_draft_service'

export default class AuthSignupController {

  /**
   * @swagger
   * /api/auth/signup/start:
   *   post:
   *     security: []
   *     tags:
   *       - Auth Signup
   *     summary: Start signup self-service flow
   *     description: Start the signup self-service flow. Validate the email, create or overwrite the signup draft, generate an OTP code of 6 digits with a validity of 10 minutes and send it to the indicated email. Allows retries while the draft is not deleted.
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - firstName
   *               - lastName
   *               - businessUnitName
   *               - email
   *             properties:
   *               firstName:
   *                 type: string
   *                 description: Prospect's first name (1-100 chars)
   *                 default: ''
   *               lastName:
   *                 type: string
   *                 description: Prospect's last name (1-100 chars)
   *                 default: ''
   *               secondLastName:
   *                 type: string
   *                 description: Prospect's second last name (1-100 chars, optional)
   *                 default: ''
   *               businessUnitName:
   *                 type: string
   *                 description: Business unit name (1-200 chars)
   *                 default: ''
   *               email:
   *                 type: string
   *                 description: Valid email
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
   *                   properties:
   *                     signupDraftId:
   *                       type: number
   *                       description: Signup draft ID
   *                     expiresAt:
   *                       type: string
   *                       format: date-time
   *                       description: OTP expiration date in ISO 8601 format
   *       '400':
   *         description: Bad request
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
   *       '409':
   *         description: Resource already exists
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
   *                   properties:
   *                     email:
   *                       type: string
   *                       description: Email of the prospect
   *       '422':
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
   *                   properties:
   *                     error:
   *                       type: string
   *                       description: Error message obtained
   *       '429':
   *         description: Too many requests
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
   *                   properties:
   *                     error:
   *                       type: string
   *                       description: Error message obtained
   *       '500':
   *         description: Internal server error
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
   *                       description: Error message obtained
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
  async start({ request, response, i18n }: HttpContext) {
    try {
      const payload = await request.validateUsing(startSignupValidator)
      const signupDraftService = new SignupDraftService(i18n)

      const result = await signupDraftService.start(payload)
      response.status(result.status)
      return result
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR') {
        response.status(400)
        return {
          type: 'warning',
          title: 'Signup',
          message: i18n.formatMessage('signup_invalid_data'),
          data: error.messages,
        }
      }
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
   * /api/auth/signup/verify-otp:
   *   post:
   *     security: []
   *     tags:
   *       - Auth Signup
   *     summary: Verify OTP code of signup
   *     description: Validate the OTP code sent to the prospect's email. If it is correct and has not expired, mark the email as verified and generate a temporary session token to authorize the completion of the signup.
   *     produces:
   *       - application/json
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - signupDraftId
   *               - pinCode
   *             properties:
   *               signupDraftId:
   *                 type: number
   *                 description: Signup draft ID
   *                 default: 0
   *               pinCode:
   *                 type: string
   *                 description: OTP code of 6 digits
   *                 minLength: 6
   *                 maxLength: 6
   *                 default: ''
   *     responses:
   *       '200':
   *         description: Email verified successfully
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
   *                   properties:
   *                     signupToken:
   *                       type: string
   *                       format: uuid
   *                       description: Token temporal para autorizar el paso complete
   *                     email:
   *                       type: string
   *                       format: email
   *                       description: Correo electrónico verificado
   *       '400':
   *         description: Validation error in the parameters sent
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
   *       '401':
   *         description: Incorrect OTP code
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
   *       '404':
   *         description: Signup draft not found
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
   *       '410':
   *         description: expired OTP code
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
   *       '429':
   *         description: Too many requests, try again later
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
  async verifyOtp({ request, response, i18n }: HttpContext) {
    try {
      const payload = await request.validateUsing(verifyOtpValidator)
      const signupDraftService = new SignupDraftService(i18n)
      const result = await signupDraftService.verifyOtp(payload.signupDraftId, payload.pinCode)
      response.status(result.status)
      return result
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR') {
        response.status(400)
        return {
          type: 'warning',
          title: 'Signup',
          message: i18n.formatMessage('signup_invalid_data'),
          data: error.messages,
        }
      }
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
   * /api/auth/signup/complete:
   *   post:
   *     security: []
   *     tags:
   *       - Auth Signup
   *     summary: Complete signup self-service registration
   *     description: |
   *       Completa el flujo de registro self-service. Valida el token de sesión temporal, crea los registros de Person, BusinessUnit, User y el System Settings base del tenant (copiado del registro fundacional, ligado por business_unit_id), elimina el borrador y devuelve un token Bearer listo para el login automático en el frontend.
   *
   *       La creación de Person, BusinessUnit, User (+ vínculo a la unidad de negocio) y System Settings corre dentro de una sola transacción de base de datos: si falla cualquier paso (incluida la provisión del System Settings), se revierte todo el alta y no quedan registros huérfanos (USRH1783712837572). Reintentar con el mismo borrador es idempotente para la fila de System Settings (se resuelve por business_unit_id).
   *     produces:
   *       - application/json
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - signupDraftId
   *               - signupToken
   *               - password
   *               - passwordConfirm
   *             properties:
   *               signupDraftId:
   *                 type: number
   *                 description: Signup draft ID
   *                 default: 0
   *               signupToken:
   *                 type: string
   *                 format: uuid
   *                 description: Token obtained in the verify-otp step
   *                 default: ''
   *               password:
   *                 type: string
   *                 description: Password (min. 12 chars, at least 1 uppercase letter, 1 number, 1 symbol)
   *                 minLength: 12
   *                 default: ''
   *               passwordConfirm:
   *                 type: string
   *                 description: Password confirmation, must match password
   *                 default: ''
   *     responses:
   *       '200':
   *         description: Account created successfully
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
   *                   properties:
   *                     token:
   *                       type: string
   *                       description: Token Bearer for immediate authentication
   *                     user:
   *                       type: object
   *                       properties:
   *                         userId:
   *                           type: number
   *                           description: User ID created
   *                         userEmail:
   *                           type: string
   *                           format: email
   *                           description: User email
   *                         roleId:
   *                           type: number
   *                           description: Assigned role ID
   *                     businessUnit:
   *                       type: object
   *                       properties:
   *                         businessUnitId:
   *                           type: number
   *                           description: Created business unit ID
   *                         businessUnitName:
   *                           type: string
   *                           description: Business unit name
   *                         businessUnitSlug:
   *                           type: string
   *                           description: Unique business unit slug
   *       '400':
   *         description: Validation error in the parameters sent
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
   *       '401':
   *         description: Invalid signup token
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
   *         description: Email not verified
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
   *       '404':
   *         description: Signup draft not found
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
   *       '409':
   *         description: Email already registered by another parallel request
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
   *       '422':
   *         description: Weak password, does not meet security requirements
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
   *       '429':
   *         description: Too many requests, try again later
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
   *       '500':
   *         description: Falló la provisión del System Settings del tenant (o cualquier otro paso) dentro de la transacción del alta. Se revierte todo el registro (fail-closed, sin registros huérfanos de Person/BusinessUnit/User/System Settings); este error nuevo sigue la convención GSTI v2 (title/detail/key/errorCode), mientras el resto del área signup conserva la convención legada title/message (convivencia declarada, ver spec USRH1783712837572 §5).
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: error
   *                 title:
   *                   type: string
   *                   example: Signup
   *                 message:
   *                   type: string
   *                   example: No fue posible crear la configuración base de la empresa nueva
   *                 detail:
   *                   type: string
   *                   example: No fue posible crear la configuración base de la empresa nueva
   *                 key:
   *                   type: string
   *                   example: signup-settings-provisioning-failed
   *                 errorCode:
   *                   type: string
   *                   example: SGNP.SETTINGS.001
   *                 data:
   *                   type: object
   *                   example: {}
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
  async completeSignup({ request, response, i18n }: HttpContext) {
    try {
      const payload = await request.validateUsing(completeSignupValidator)
      const signupDraftService = new SignupDraftService(i18n)
      const result = await signupDraftService.complete(payload)
      response.status(result.status)
      return result
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR') {
        response.status(400)
        return {
          type: 'warning',
          title: 'Signup',
          message: i18n.formatMessage('signup_invalid_data'),
          data: error.messages,
        }
      }
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
