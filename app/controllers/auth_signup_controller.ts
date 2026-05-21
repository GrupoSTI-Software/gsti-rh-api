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
   *     summary: Iniciar flujo de signup self-service
   *     description: Inicia el flujo de signup self-service. Valida el correo, crea o sobreescribe el borrador de signup, genera un código OTP de 6 dígitos con vigencia de 10 minutos y lo envía al email indicado. Permite reintentos mientras el draft no esté eliminado.
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               firstName:
   *                 type: string
   *                 description: Nombre del prospecto
   *                 default: ''
   *               lastName:
   *                 type: string
   *                 description: Apellido paterno del prospecto
   *                 default: ''
   *               secondLastName:
   *                 type: string
   *                 description: Apellido materno del prospecto
   *                 default: ''
   *                 required: false
   *               businessUnitName:
   *                 type: string
   *                 description: Nombre de la empresa
   *                 default: ''
   *               email:
   *                 type: string
   *                 description: Correo electrónico
   *                 default: ''
   *               password:
   *                 type: string
   *                 description: Contraseña (mín. 12 chars, 1 mayúscula, 1 número, 1 símbolo)
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
  async start({ request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(startSignupValidator)
      const signupDraftService = new SignupDraftService()

      const result = await signupDraftService.start(payload)
      response.status(result.status)
      return result
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR') {
        response.status(422)
        return {
          type: 'warning',
          title: 'Signup',
          message: 'Los datos proporcionados no son válidos',
          data: error.messages,
        }
      }
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
   * /api/auth/signup/verify-otp:
   *   post:
   *     security: []
   *     tags:
   *       - Auth Signup
   *     summary: Verificar código OTP del signup
   *     description: Valida el código OTP enviado al correo del prospecto. Si es correcto y no ha expirado, marca el email como verificado y genera un token de sesión temporal para autorizar el paso de completar el signup.
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               signupDraftId:
   *                 type: number
   *                 description: ID del borrador de signup
   *                 default: 0
   *               pinCode:
   *                 type: string
   *                 description: Código OTP de 6 dígitos
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
  async verifyOtp({ request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(verifyOtpValidator)
      const signupDraftService = new SignupDraftService()
      const result = await signupDraftService.verifyOtp(payload.signupDraftId, payload.pinCode)
      response.status(result.status)
      return result
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR') {
        response.status(422)
        return {
          type: 'warning',
          title: 'Signup',
          message: 'Los datos proporcionados no son válidos',
          data: error.messages,
        }
      }
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
   * /api/auth/signup/complete:
   *   post:
   *     security: []
   *     tags:
   *       - Auth Signup
   *     summary: Completar registro de signup self-service
   *     description: Finaliza el flujo de signup. Valida el token de sesión, crea los registros de Person, BusinessUnit y User dentro de una transacción, asocia el usuario a la unidad de negocio, elimina el borrador y retorna un token de acceso listo para login automático en el frontend. 
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               signupDraftId:
   *                 type: number
   *                 description: ID del borrador de signup
   *                 default: 0
   *               signupToken:
   *                 type: string
   *                 description: Token obtenido en el paso verify-otp
   *                 default: ''
   *               password:
   *                 type: string
   *                 description: Contraseña (mín. 12 chars, 1 mayúscula, 1 número, 1 símbolo)
   *                 default: ''
   *               passwordConfirm:
   *                 type: string
   *                 description: Confirmación de contraseña
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
  async completeSignup({ request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(completeSignupValidator)
      const signupDraftService = new SignupDraftService()
      const result = await signupDraftService.complete(payload)
      response.status(result.status)
      return result
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR') {
        response.status(422)
        return {
          type: 'warning',
          title: 'Signup',
          message: 'Los datos proporcionados no son válidos',
          data: error.messages,
        }
      }
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
