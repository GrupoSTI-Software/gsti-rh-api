import type { HttpContext } from '@adonisjs/core/http'
import ComplaintService from '#services/complaint_service'
import {
  consultComplaintStatusValidator,
  createComplaintValidator,
  updateComplaintStatusValidator,
} from '#validators/complaint'
import { resolveComplaintApiError } from '../helpers/complaint_api_error.js'

/**
 * Controlador del buzón de quejas confidencial (NOM-035 8.1.b).
 */
export default class ComplaintController {
  private respondError(
    error: unknown,
    response: HttpContext['response'],
    fallbackStatus: number,
    i18n: HttpContext['i18n']
  ) {
    const resolved = resolveComplaintApiError(error, fallbackStatus, i18n)
    response.status(resolved.status)
    return {
      type: 'error',
      title: resolved.title,
      message: resolved.message,
      key: resolved.key,
      detail: resolved.detail,
      code: resolved.errorCode,
      data: null,
    }
  }
  /**
   * @swagger
   * /api/v1/complaints:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Complaints
   *     summary: submit confidential complaint (authenticated employee)
   *     description: |
   *       NOM-035 8.1.b confidential complaint mailbox endpoint consumed by the employee app.
   *       Creates a complaint linked to the authenticated employee session. The reporter identity
   *       is stored internally (employee FK) but is never returned in the API response.
   *       Returns a public case folio and a one-time access passphrase so the employee can
   *       track progress later without re-identifying.
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - category
   *               - description
   *             properties:
   *               category:
   *                 type: string
   *                 description: Complaint category aligned with NOM-035 reporting types
   *                 enum: [violencia-laboral, entorno, otro]
   *                 example: violencia-laboral
   *               description:
   *                 type: string
   *                 description: Narrative description of the complaint (minimum 10 characters)
   *                 minLength: 10
   *                 maxLength: 10000
   *                 example: Detailed description of the reported incident or workplace condition
   *     responses:
   *       '201':
   *         description: Complaint registered successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                   example: success
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Public complaint credentials (passphrase shown only once)
   *                   properties:
   *                     folio:
   *                       type: string
   *                       description: Public case identifier without personal data
   *                       example: BQ-2026-482917
   *                     passphrase:
   *                       type: string
   *                       description: One-time access key for status lookup (store securely)
   *                       example: ABCD2345EFGH
   *                     status:
   *                       type: string
   *                       description: Initial complaint status
   *                       example: nuevo
   *                     category:
   *                       type: string
   *                       description: Complaint category
   *                       example: violencia-laboral
   *                     createdAt:
   *                       type: string
   *                       format: date-time
   *                       description: Complaint creation timestamp (ISO 8601)
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
   *                   description: Response message
   *                 key:
   *                   type: string
   *                   description: Stable client error code
   *                 detail:
   *                   type: string
   *                   description: Human-readable error detail
   *                 data:
   *                   type: object
   *                   nullable: true
   *                   description: Validation details when applicable
   *       '403':
   *         description: Authenticated user has no associated employee record to submit a complaint
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
   *                 key:
   *                   type: string
   *                   description: Stable client error code
   *                 detail:
   *                   type: string
   *                   description: Human-readable error detail
   *                 data:
   *                   type: object
   *                   nullable: true
   *                   description: Additional error context
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
   *                 key:
   *                   type: string
   *                   description: Stable client error code
   *                 detail:
   *                   type: string
   *                   description: Human-readable error detail
   *                 data:
   *                   type: object
   *                   nullable: true
   *                   description: Error message obtained
   */
  async store({ auth, request, response, i18n }: HttpContext) {
    try {
      await auth.check()
      const user = auth.user!
      const payload = await request.validateUsing(createComplaintValidator)
      const complaintService = new ComplaintService()
      const result = await complaintService.create(user, payload)

      response.status(201)
      return {
        type: 'success',
        title: i18n.formatMessage('complaint_title'),
        message: i18n.formatMessage('complaint_created_success'),
        data: result,
      }
    } catch (error) {
      return this.respondError(error, response, 500, i18n)
    }
  }

  /**
   * @swagger
   * /api/v1/complaints:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Complaints
   *     summary: list complaints for administrators
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *         description: Page number
   *         required: false
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *         description: Records per page (max 100)
   *         required: false
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [nuevo, en-revision, resuelto, cerrado]
   *         description: Filter by workflow status
   *         required: false
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
   *                   description: Paginated complaints (reporter identity is never included)
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
   */
  async index({ request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const filters = request.qs()
      const complaintService = new ComplaintService()
      const result = await complaintService.listPaginated(filters, businessUnitScope ?? [])

      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('complaint_title'),
        message: i18n.formatMessage('complaint_list_success'),
        data: result,
      }
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/v1/complaints/{complaintId}/status:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Complaints
   *     summary: update complaint status
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: complaintId
   *         schema:
   *           type: number
   *         description: Complaint id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               status:
   *                 type: string
   *                 description: New workflow status
   *                 enum: [nuevo, en-revision, resuelto, cerrado]
   *                 required: true
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
   *                   description: Updated complaint (reporter identity is never included)
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
   */
  async updateStatus({ request, params, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const payload = await request.validateUsing(updateComplaintStatusValidator)
      const complaintService = new ComplaintService()
      const result = await complaintService.updateStatus(
        Number(params.complaintId),
        payload,
        businessUnitScope ?? []
      )

      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('complaint_title'),
        message: i18n.formatMessage('complaint_status_updated_success'),
        data: result,
      }
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/v1/complaints/status:
   *   get:
   *     tags:
   *       - Complaints
   *     summary: lookup complaint status by folio and passphrase
   *     description: |
   *       Public endpoint for the confidential complaint mailbox. Allows the employee to
   *       check case progress using the public folio and access passphrase received at
   *       submission time, without re-identifying in the request. Returns a generic 404
   *       when the folio or passphrase is incorrect to avoid case enumeration.
   *     produces:
   *       - application/json
   *     parameters:
   *       - name: folio
   *         in: query
   *         required: true
   *         description: Public case identifier returned when the complaint was created
   *         schema:
   *           type: string
   *           minLength: 5
   *           maxLength: 50
   *           example: BQ-2026-482917
   *       - name: passphrase
   *         in: query
   *         required: true
   *         description: Access passphrase returned once at complaint submission
   *         schema:
   *           type: string
   *           minLength: 6
   *           maxLength: 64
   *           example: ABCD2345EFGH
   *     responses:
   *       '200':
   *         description: Complaint status retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                   example: success
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Public complaint status snapshot (no reporter identity)
   *                   properties:
   *                     folio:
   *                       type: string
   *                       description: Public case identifier
   *                       example: BQ-2026-482917
   *                     status:
   *                       type: string
   *                       description: Current complaint workflow status
   *                       enum: [nuevo, en-revision, resuelto, cerrado]
   *                       example: en-revision
   *                     category:
   *                       type: string
   *                       description: Complaint category
   *                       enum: [violencia-laboral, entorno, otro]
   *                       example: violencia-laboral
   *                     createdAt:
   *                       type: string
   *                       format: date-time
   *                       description: Complaint creation timestamp (ISO 8601)
   *                     updatedAt:
   *                       type: string
   *                       format: date-time
   *                       description: Last status update timestamp (ISO 8601)
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
   *                   description: Response message
   *                 key:
   *                   type: string
   *                   description: Stable client error code
   *                 detail:
   *                   type: string
   *                   description: Human-readable error detail
   *                 data:
   *                   type: object
   *                   nullable: true
   *                   description: Validation details when applicable
   *       '404':
   *         description: Incorrect folio or passphrase (generic response to prevent enumeration)
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
   *                 key:
   *                   type: string
   *                   description: Stable client error key
   *                   example: caso-no-encontrado
   *                 code:
   *                   type: string
   *                   description: Stable client error code
   *                   example: CMP.NF.001
   *                 detail:
   *                   type: string
   *                   description: Human-readable error detail
   *                 data:
   *                   type: object
   *                   nullable: true
   *                   description: Additional error context
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
   *                 key:
   *                   type: string
   *                   description: Stable client error key
   *                 code:
   *                   type: string
   *                   description: Stable client error code
   *                 detail:
   *                   type: string
   *                   description: Human-readable error detail
   *                 data:
   *                   type: object
   *                   nullable: true
   *                   description: Error message obtained
   */
  async consultStatus({ request, response, i18n }: HttpContext) {
    try {
      const payload = await consultComplaintStatusValidator.validate(request.qs())
      const complaintService = new ComplaintService()
      const result = await complaintService.consultStatus(payload)

      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('complaint_title'),
        message: i18n.formatMessage('complaint_status_success'),
        data: result,
      }
    } catch (error) {
      return this.respondError(error, response, 500, i18n)
    }
  }
}
