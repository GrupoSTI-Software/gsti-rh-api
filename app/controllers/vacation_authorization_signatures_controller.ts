// import type { HttpContext } from '@adonisjs/core/http'
import { HttpContext } from '@adonisjs/core/http'
import VacationAuthorizationSignaturesService from '#services/vacation_authorization_signatures_service'
import { authorizeVacationValidator, signShiftExceptionsValidator, employeeIdQueryValidator, shiftExceptionsQueryValidator } from '#validators/vacation_authorization_signatures'

export default class VacationAuthorizationSignaturesController {
  /**
   * @swagger
   * tags:
   *   name: VacationAuthorizations
   *   description: API for authorizing vacation requests and retrieving related data
   * components:
   *   schemas:
   *     VacationAuthorizationAuthorizeRequest:
   *       type: object
   *       properties:
   *         signature:
   *           type: string
   *           format: binary
   *           description: PNG signature file
   *         requestIds:
   *           type: array
   *           description: Array of ExceptionRequest IDs to authorize (vacation)
   *           items:
   *             type: number
   *         vacationSettingId:
   *           type: number
   *           description: Vacation setting ID to use for ShiftExceptions
   *       required:
   *         - signature
   *         - requestIds
   *         - vacationSettingId
   *     VacationSignShiftExceptionsRequest:
   *       type: object
   *       properties:
   *         signature:
   *           type: string
   *           format: binary
   *           description: PNG signature file
   *         shiftExceptionIds:
   *           type: array
   *           description: Array of ShiftException IDs to sign (vacation)
   *           items:
   *             type: number
   *       required:
   *         - signature
   *         - shiftExceptionIds
   *     VacationAuthorizationResponse:
   *       type: object
   *       properties:
   *         type:
   *           type: string
   *           example: success
   *         title:
   *           type: string
   *           example: Vacation authorization
   *         message:
   *           type: string
   *           example: Processing completed
   *         data:
   *           type: object
   *           properties:
   *             fileUrl:
   *               type: string
   *             createdShiftExceptions:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/ShiftException'
   *             createdSignatures:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/VacationAuthorizationSignature'
   *             updatedRequests:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/ExceptionRequest'
   *             errors:
   *               type: array
   *               items:
   *                 type: object
   *                 properties:
   *                   id:
   *                     type: number
   *                   error:
   *                     type: string
   *     VacationSignShiftExceptionsResponse:
   *       type: object
   *       properties:
   *         type:
   *           type: string
   *           example: success
   *         title:
   *           type: string
   *           example: Shift exceptions signed
   *         message:
   *           type: string
   *           example: Processing completed
   *         data:
   *           type: object
   *           properties:
   *             fileUrl:
   *               type: string
   *             createdSignatures:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/VacationAuthorizationSignature'
   *             errors:
   *               type: array
   *               items:
   *                 type: object
   *                 properties:
   *                   id:
   *                     type: number
   *                   error:
   *                     type: string
   *     VacationPendingQuery:
   *       type: object
   *       properties:
   *         employeeId:
   *           type: integer
   *           minimum: 1
   *       required:
   *         - employeeId
   *     VacationAuthorizedResponse:
   *       type: object
   *       properties:
   *         type:
   *           type: string
   *         title:
   *           type: string
   *         message:
   *           type: string
   *         data:
   *           type: object
   *           properties:
   *             requests:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/ExceptionRequest'
   *             signatures:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/VacationAuthorizationSignature'
   *     ValidationErrorResponse:
   *       type: object
   *       properties:
   *         type:
   *           type: string
   *           example: error
   *         title:
   *           type: string
   *           example: Validation error
   *         message:
   *           type: string
   *           example: Validation failed
   *         data:
   *           type: object
   */

  /**
   * @swagger
   * /api/vacation-authorizations/authorize:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     summary: Authorize multiple vacation exception requests with a signature
   *     description: Uploads a PNG signature to S3, sets Exception Requests to accepted, creates Shift Exceptions, and saves signature records.
   *     tags: [VacationAuthorizations]
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             $ref: '#/components/schemas/VacationAuthorizationAuthorizeRequest'
   *     responses:
   *       201:
   *         description: Authorization completed
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/VacationAuthorizationResponse'
   *       400:
   *         description: Missing file or invalid payload
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: Vacation exception type not found
   *       422:
   *         description: Validation error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ValidationErrorResponse'
   *       500:
   *         description: Server error
   */
  /**
   * Authorize vacation exception requests using a signature file.
   * @param ctx Http context
   */
  async authorize({ auth, request, response, i18n }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.status(401).json({
        type: 'warning',
        title: 'Auth',
        message: 'Usuario no autenticado',
        data: null,
      })
    }

    const signature = request.file('signature', { size: '3mb', extnames: ['png'] })
    if (!signature) {
      return response.status(400).json({
        type: 'warning',
        title: 'Firma requerida',
        message: 'Debe adjuntar un archivo PNG en signature',
        data: null,
      })
    }

    try {
      const payload = await request.validateUsing(authorizeVacationValidator)
      const service = new VacationAuthorizationSignaturesService()
      const result = await service.authorize(signature, payload.requestIds, payload.vacationSettingId, i18n)
      return response.status(result.status).json(result)
    } catch (error: any) {
      return response.status(422).json({
        type: 'error',
        title: 'Validation error',
        message: error?.messages || 'Validation failed',
        data: error,
      })
    }
  }

  /**
   * @swagger
   * /api/vacation-authorizations/sign-shift-exceptions:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     summary: Sign multiple vacation shift exceptions with a signature
   *     description: Uploads a PNG signature to S3 and saves signature records for existing Shift Exceptions.
   *     tags: [VacationAuthorizations]
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             $ref: '#/components/schemas/VacationSignShiftExceptionsRequest'
   *     responses:
   *       201:
   *         description: Signing completed
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/VacationSignShiftExceptionsResponse'
   *       400:
   *         description: Missing file or invalid payload
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: Vacation exception type not found
   *       422:
   *         description: Validation error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ValidationErrorResponse'
   *       500:
   *         description: Server error
   */
  /**
   * Sign vacation shift exceptions using a signature file.
   * @param ctx Http context
   */
  async signShiftExceptions({ auth, request, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.status(401).json({
        type: 'warning',
        title: 'Auth',
        message: 'Usuario no autenticado',
        data: null,
      })
    }

    const signature = request.file('signature', { size: '3mb', extnames: ['png'] })
    if (!signature) {
      return response.status(400).json({
        type: 'warning',
        title: 'Firma requerida',
        message: 'Debe adjuntar un archivo PNG en signature',
        data: null,
      })
    }

    try {
      const payload = await request.validateUsing(signShiftExceptionsValidator)
      const service = new VacationAuthorizationSignaturesService()
      const result = await service.signShiftExceptions(signature, payload.shiftExceptionIds)
      return response.status(result.status).json(result)
    } catch (error: any) {
      return response.status(422).json({
        type: 'error',
        title: 'Validation error',
        message: error?.messages || 'Validation failed',
        data: error,
      })
    }
  }

  /**
   * @swagger
   * /api/vacation-authorizations/pending:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     summary: Get pending vacation requests for an employee
   *     tags: [VacationAuthorizations]
   *     parameters:
   *       - in: query
   *         name: employeeId
   *         required: true
   *         schema:
   *           $ref: '#/components/schemas/VacationPendingQuery/properties/employeeId'
   *         description: Employee ID
   *     responses:
   *       200:
   *         description: List of pending vacation requests
   *       400:
   *         description: employeeId is required
   *       404:
   *         description: Vacation exception type not found
   *       422:
   *         description: Validation error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ValidationErrorResponse'
   */
  /**
   * Retrieve pending vacation requests for an employee.
   * @param ctx Http context
   */
  async getPendingVacationRequests({ request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(employeeIdQueryValidator)
      const service = new VacationAuthorizationSignaturesService()
      const result = await service.getPending(Number(payload.employeeId))
      return response.status(result.status).json(result)
    } catch (error: any) {
      return response.status(422).json({
        type: 'error',
        title: 'Validation error',
        message: error?.messages || 'Validation failed',
        data: error,
      })
    }
  }

  /**
   * @swagger
   * /api/vacation-authorizations/authorized:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     summary: Get authorized vacation requests and signatures for an employee
   *     tags: [VacationAuthorizations]
   *     parameters:
   *       - in: query
   *         name: employeeId
   *         required: true
   *         schema:
   *           $ref: '#/components/schemas/VacationPendingQuery/properties/employeeId'
   *         description: Employee ID
   *     responses:
   *       200:
   *         description: List of authorized vacation requests and their signatures
   *       400:
   *         description: employeeId is required
   *       404:
   *         description: Vacation exception type not found
   *       422:
   *         description: Validation error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ValidationErrorResponse'
   */
  /**
   * Retrieve authorized vacation requests and their signatures for an employee.
   * @param ctx Http context
   */
  async getAuthorizedVacationRequests({ request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(employeeIdQueryValidator)
      const service = new VacationAuthorizationSignaturesService()
      const result = await service.getAuthorized(Number(payload.employeeId))
      return response.status(result.status).json(result)
    } catch (error: any) {
      return response.status(422).json({
        type: 'error',
        title: 'Validation error',
        message: error?.messages || 'Validation failed',
        data: error,
      })
    }
  }

  /**
   * @swagger
   * /api/vacation-authorizations/shift-exceptions:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     summary: Get vacation shift exceptions for an employee with specific vacation setting
   *     tags: [VacationAuthorizations]
   *     parameters:
   *       - in: query
   *         name: employeeId
   *         required: true
   *         schema:
   *           type: integer
   *         description: Employee ID
   *       - in: query
   *         name: vacationSettingId
   *         required: true
   *         schema:
   *           type: integer
   *         description: Vacation Setting ID
   *     responses:
   *       200:
   *         description: List of vacation shift exceptions
   *       422:
   *         description: Validation error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ValidationErrorResponse'
   */
  /**
   * Retrieve vacation shift exceptions for an employee with specific vacation setting.
   * @param ctx Http context
   */
  async getVacationShiftExceptions({ request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(shiftExceptionsQueryValidator)
      const service = new VacationAuthorizationSignaturesService()
      const result = await service.getVacationShiftExceptions(Number(payload.employeeId), Number(payload.vacationSettingId))
      return response.status(result.status).json(result)
    } catch (error: any) {
      return response.status(422).json({
        type: 'error',
        title: 'Validation error',
        message: error?.messages || 'Validation failed',
        data: error,
      })
    }
  }
}
