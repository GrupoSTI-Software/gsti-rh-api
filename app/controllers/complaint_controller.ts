import type { HttpContext } from '@adonisjs/core/http'
import ComplaintService from '#services/complaint_service'
import ComplaintApiService from '#services/complaint_api_service'
import {
  consultComplaintStatusValidator,
  createComplaintValidator,
  complaintListValidator,
  patchComplaintStatusValidator,
  revealComplaintIdentityValidator,
  complaintReportValidator,
  complaintReportExportValidator,
} from '#validators/complaint'
import { parseComplaintReportDateRange } from '../helpers/complaint_report_date_range.js'

/**
 * Controlador del buzón de quejas confidencial (NOM-035 8.1.b).
 */
export default class ComplaintController {
  private readonly complaintApiService = new ComplaintApiService()

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
      return this.complaintApiService.respondError(error, response, 500, i18n)
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
   *       - in: query
   *         name: category
   *         schema:
   *           type: string
   *           enum: [violencia-laboral, entorno, otro]
   *         description: Filter by complaint category (NOM-035 reporting type)
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
   *                   properties:
   *                     meta:
   *                       type: object
   *                       description: Pagination metadata plus badge counter
   *                       properties:
   *                         pendingNewCount:
   *                           type: integer
   *                           description: Count of complaints in status nuevo within the user scope (BO badge)
   *                     data:
   *                       type: array
   *                       items:
   *                         type: object
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
  async index(ctx: HttpContext) {
    const { request, response, i18n, businessUnitScope } = ctx
    try {
      const filters = await request.validateUsing(complaintListValidator)
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
      return this.complaintApiService.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/v1/complaints/{complaintId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Complaints
   *     summary: get complaint detail with history and attachments
   *     description: |
   *       Backoffice endpoint for the NOM-035 complaint management board. Returns the
   *       full case detail used in the BO viewer: public folio, category, description,
   *       workflow status, immutable status timeline (audit log), and sanitized evidence
   *       attachments metadata.
   *
   *       **Confidentiality:** reporter identity (`employeeId`, name, email, etc.) is
   *       never included in the response. Only the public folio identifies the case.
   *
   *       **Scope:** the business unit scope is resolved automatically from the
   *       authenticated user's accessible units. The complaint must belong to that scope.
   *
   *       **Attachments:** metadata only (no S3 paths). Use
   *       `GET /api/v1/complaints/attachments/{id}/download-url` for temporary signed
   *       download links to the already sanitized files.
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: complaintId
   *         required: true
   *         schema:
   *           type: integer
   *           minimum: 1
   *         description: Internal complaint identifier
   *         example: 42
   *     responses:
   *       '200':
   *         description: Complaint detail retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Localized module title
   *                 message:
   *                   type: string
   *                   description: Localized success message
   *                 data:
   *                   type: object
   *                   description: Case detail without reporter identity
   *       '401':
   *         description: User is not authenticated
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
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   nullable: true
   *       '403':
   *         description: Missing read permission on the complaints module (complaint.manage)
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
   *                 message:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: sin-permiso
   *                 detail:
   *                   type: string
   *                 code:
   *                   type: string
   *                   example: CMPL.FORB.001
   *                 data:
   *                   type: object
   *                   nullable: true
   *       '404':
   *         description: Complaint not found or outside business unit scope
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
   *                 message:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: complaint-not-found
   *                 detail:
   *                   type: string
   *                 code:
   *                   type: string
   *                   example: CMP.NF.001
   *                 data:
   *                   type: object
   *                   nullable: true
   *       default:
   *         description: Unexpected error
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
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   nullable: true
   */
  async show(ctx: HttpContext) {
    const { params, response, i18n, businessUnitScope } = ctx
    try {
      const complaintService = new ComplaintService()
      const result = await complaintService.getDetailById(
        Number(params.complaintId),
        businessUnitScope ?? []
      )

      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('complaint_title'),
        message: i18n.formatMessage('complaint_detail_success'),
        data: result,
      }
    } catch (error) {
      return this.complaintApiService.respondError(error, response, 404, i18n)
    }
  }

  /**
   * @swagger
   * /api/v1/complaints/{complaintId}/history:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Complaints
   *     summary: get complaint status history timeline
   *     description: |
   *       Backoffice endpoint that returns the immutable chronological audit log of status
   *       transitions for a complaint (`complaint_status_histories`). Each entry records the
   *       actor, previous status, new status, mandatory note and timestamp.
   *
   *       **Scope:** the business unit scope is resolved automatically from the authenticated
   *       user's accessible units.
   *
   *       **Confidentiality:** the response never exposes reporter identity.
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: complaintId
   *         required: true
   *         schema:
   *           type: integer
   *           minimum: 1
   *         description: Internal complaint identifier
   *         example: 42
   *     responses:
   *       '200':
   *         description: History retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 title:
   *                   type: string
   *                   description: Localized module title
   *                 message:
   *                   type: string
   *                   description: Localized success message
   *                 data:
   *                   type: array
   *                   description: Immutable chronological audit log of status transitions (oldest first)
   *       '401':
   *         description: User is not authenticated
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
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   nullable: true
   *       '403':
   *         description: Missing read permission on the complaints module (complaint.manage)
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
   *                 message:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: permission-denied
   *                 detail:
   *                   type: string
   *                 code:
   *                   type: string
   *                   example: CMPL.FORB.001
   *                 data:
   *                   type: object
   *                   nullable: true
   *       '404':
   *         description: Complaint not found or outside business unit scope
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
   *                 message:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: complaint-not-found
   *                 detail:
   *                   type: string
   *                 code:
   *                   type: string
   *                   example: CMP.NF.001
   *                 data:
   *                   type: object
   *                   nullable: true
   *       default:
   *         description: Unexpected error
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
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   nullable: true
   */
  async history(ctx: HttpContext) {
    const { params, response, i18n, businessUnitScope } = ctx
    try {
      const complaintService = new ComplaintService()
      const result = await complaintService.listHistoryByComplaintId(
        Number(params.complaintId),
        businessUnitScope ?? []
      )

      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('complaint_title'),
        message: i18n.formatMessage('complaint_history_success'),
        data: result,
      }
    } catch (error) {
      return this.complaintApiService.respondError(error, response, 404, i18n)
    }
  }

  /**
   * @swagger
   * /api/v1/complaints/{complaintId}/status:
   *   patch:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Complaints
   *     summary: transition complaint status with mandatory note
   *     description: |
   *       Backoffice endpoint to advance a complaint through the NOM-035 workflow. Updates
   *       the case status and appends an **immutable** entry to the audit log
   *       (`complaint_status_histories`) with: actor, previous status, new status, note
   *       and timestamp.
   *
   *       **Mandatory note:** every transition requires a non-empty `note`. If the note is
   *       missing or only whitespace, the API responds with **422** and
   *       `key: note-required`, `code: CMPL.VAL.NOTE.001`.
   *
   *       **Same status:** transitioning to the current status is rejected with **422**
   *       and `key: status-unchanged`.
   *
   *       **Scope:** the business unit scope is resolved automatically from the
   *       authenticated user's accessible units.
   *
   *       **Confidentiality:** the response never exposes reporter identity.
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: complaintId
   *         required: true
   *         schema:
   *           type: integer
   *           minimum: 1
   *         description: Internal complaint identifier
   *         example: 42
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - toStatus
   *               - note
   *             properties:
   *               toStatus:
   *                 type: string
   *                 description: Target workflow status (must differ from current status)
   *                 enum: [nuevo, en-revision, resuelto, cerrado]
   *                 example: en-revision
   *               note:
   *                 type: string
   *                 description: Mandatory administrator note describing the action taken
   *                 minLength: 1
   *                 maxLength: 5000
   *                 example: Se inició la revisión del caso conforme al protocolo interno.
   *           examples:
   *             startReview:
   *               summary: Move case to under review
   *               value:
   *                 toStatus: en-revision
   *                 note: Se inició la revisión del caso conforme al protocolo interno.
   *             resolve:
   *               summary: Resolve the case
   *               value:
   *                 toStatus: resuelto
   *                 note: Se documentó la resolución y las acciones correctivas aplicadas.
   *     responses:
   *       '200':
   *         description: Status transitioned and audit log entry created successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Localized module title
   *                 message:
   *                   type: string
   *                   description: Localized success message
   *                 data:
   *                   type: object
   *                   description: Updated complaint snapshot (no reporter identity)
   *       '400':
   *         description: Request body validation failed (invalid enum or field format)
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
   *                 message:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: AUTH.COMPLAINT.VAL_INPUT
   *                 detail:
   *                   type: string
   *                 code:
   *                   type: string
   *                   example: CMPL.VAL.001
   *                 data:
   *                   type: object
   *                   nullable: true
   *       '401':
   *         description: User is not authenticated
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
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   nullable: true
   *       '403':
   *         description: Missing update permission on the complaints module
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
   *                 message:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: sin-permiso
   *                 detail:
   *                   type: string
   *                 code:
   *                   type: string
   *                   example: CMPL.FORB.001
   *                 data:
   *                   type: object
   *                   nullable: true
   *       '404':
   *         description: Complaint not found or outside business unit scope
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
   *                 message:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: complaint-not-found
   *                 detail:
   *                   type: string
   *                 code:
   *                   type: string
   *                   example: CMP.NF.001
   *                 data:
   *                   type: object
   *                   nullable: true
   *       '422':
   *         description: Missing note or invalid status transition
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
   *                 message:
   *                   type: string
   *                 key:
   *                   type: string
   *                   description: Stable client error key
   *                   enum: [note-required, status-unchanged]
   *                   example: note-required
   *                 detail:
   *                   type: string
   *                 code:
   *                   type: string
   *                   description: Stable client error code
   *                   enum: [CMPL.VAL.NOTE.001, CMPL.VAL.001]
   *                   example: CMPL.VAL.NOTE.001
   *                 data:
   *                   type: object
   *                   nullable: true
   *       default:
   *         description: Unexpected error
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
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   nullable: true
   */
  async patchStatus(ctx: HttpContext) {
    const { auth, request, params, response, i18n, businessUnitScope } = ctx
    try {
      const payload = await request.validateUsing(patchComplaintStatusValidator)
      const complaintService = new ComplaintService()
      const result = await complaintService.transitionStatus(
        Number(params.complaintId),
        payload,
        auth.user!.userId,
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
      return this.complaintApiService.respondError(error, response, 422, i18n)
    }
  }

  /**
   * @swagger
   * /api/v1/complaints/{complaintId}/reveal-identity:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Complaints
   *     summary: reveal reporter identity with mandatory justification
   *     description: |
   *       Backoffice endpoint to reveal the confidential reporter identity for a complaint.
   *       Requires the dedicated RBAC permission `reveal-identity` on the complaints module
   *       (`complaint.reveal_identity`). Having `update` alone does **not** authorize this action.
   *
   *       Creates an immutable audit entry in `complaint_identity_reveal_audits` with the
   *       actor, justification and timestamp. Reporter identity is returned **only** in this
   *       response; it is never included in list, detail or status endpoints.
   *
   *       **Mandatory justification:** every reveal requires a non-empty `justification`. If
   *       missing or only whitespace, the API responds with **422** and
   *       `key: justification-required`, `code: CMPL.VAL.JUST.001`.
   *
   *       **Scope:** the business unit scope is resolved automatically from the authenticated
   *       user's accessible units. The complaint must belong to that scope.
   *
   *       **Repeat reveals:** each call creates a new immutable audit entry, even if the same
   *       authorized user reveals the same case again.
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: complaintId
   *         required: true
   *         schema:
   *           type: integer
   *           minimum: 1
   *         description: Internal complaint identifier
   *         example: 42
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - justification
   *             properties:
   *               justification:
   *                 type: string
   *                 description: Mandatory reason documented for the identity reveal (NOM-035 audit trail)
   *                 minLength: 1
   *                 maxLength: 5000
   *                 example: Se requiere identificar al denunciante para dar seguimiento conforme al protocolo interno de NOM-035.
   *           examples:
   *             protocolFollowUp:
   *               summary: Protocol-based follow-up
   *               value:
   *                 justification: Se requiere identificar al denunciante para dar seguimiento conforme al protocolo interno de NOM-035.
   *     responses:
   *       '200':
   *         description: Reporter identity revealed and immutable audit entry created
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Localized module title
   *                 message:
   *                   type: string
   *                   description: Localized success message
   *                 data:
   *                   type: object
   *                   description: Reporter identity (only exposed via this endpoint) plus audit snapshot
   *       '400':
   *         description: Request body validation failed (invalid field format)
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
   *                 message:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: AUTH.COMPLAINT.VAL_INPUT
   *                 detail:
   *                   type: string
   *                 code:
   *                   type: string
   *                   example: CMPL.VAL.001
   *                 data:
   *                   type: object
   *                   nullable: true
   *       '401':
   *         description: User is not authenticated
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
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   nullable: true
   *       '403':
   *         description: Missing reveal-identity permission (`complaint.reveal_identity`)
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
   *                 message:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: reveal-permission-denied
   *                 detail:
   *                   type: string
   *                 code:
   *                   type: string
   *                   example: CMPL.FORB.REVEAL.001
   *                 data:
   *                   type: object
   *                   nullable: true
   *       '404':
   *         description: Complaint not found, outside business unit scope, or reporter employee missing
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
   *                 message:
   *                   type: string
   *                 key:
   *                   type: string
   *                   description: Stable client error key
   *                   enum: [complaint-not-found, reporter-not-found]
   *                   example: complaint-not-found
   *                 detail:
   *                   type: string
   *                 code:
   *                   type: string
   *                   description: Stable client error code
   *                   enum: [CMP.NF.001, CMPL.EMP.001]
   *                   example: CMP.NF.001
   *                 data:
   *                   type: object
   *                   nullable: true
   *       '422':
   *         description: Missing or empty justification
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
   *                 message:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: justification-required
   *                 detail:
   *                   type: string
   *                 code:
   *                   type: string
   *                   example: CMPL.VAL.JUST.001
   *                 data:
   *                   type: object
   *                   nullable: true
   *       default:
   *         description: Unexpected error
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
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   nullable: true
   */
  async revealIdentity(ctx: HttpContext) {
    const { auth, request, params, response, i18n, businessUnitScope } = ctx
    try {
      await this.complaintApiService.assertRevealIdentityPermission(auth.user!)

      const payload = await request.validateUsing(revealComplaintIdentityValidator)
      const complaintService = new ComplaintService()
      const result = await complaintService.revealIdentity(
        Number(params.complaintId),
        payload,
        auth.user!.userId,
        businessUnitScope ?? []
      )

      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('complaint_title'),
        message: i18n.formatMessage('complaint_reveal_identity_success'),
        data: result,
      }
    } catch (error) {
      return this.complaintApiService.respondError(error, response, 422, i18n)
    }
  }

  /**
   * @swagger
   * /api/v1/complaints/{complaintId}/reveal-history:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Complaints
   *     summary: get identity reveal audit history for a complaint
   *     description: |
   *       Backoffice endpoint that returns the chronological immutable log of identity reveals
   *       for a complaint (`complaint_identity_reveal_audits`). Each entry records the actor,
   *       mandatory justification and timestamp.
   *
   *       Requires the same dedicated RBAC permission `reveal-identity` on the complaints
   *       module (`complaint.reveal_identity`) as POST reveal-identity. Having `update` alone
   *       does **not** authorize this action.
   *
   *       **Confidentiality:** this endpoint does **not** return reporter PII (name, employee
   *       code, etc.). It only exposes reveal audit metadata. Use POST reveal-identity to
   *       obtain the reporter identity.
   *
   *       **Scope:** the business unit scope is resolved automatically from the authenticated
   *       user's accessible units.
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: complaintId
   *         required: true
   *         schema:
   *           type: integer
   *           minimum: 1
   *         description: Internal complaint identifier
   *         example: 42
   *     responses:
   *       '200':
   *         description: Reveal history retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Localized module title
   *                 message:
   *                   type: string
   *                   description: Localized success message
   *                 data:
   *                   type: array
   *                   description: Chronological immutable log of identity reveals (oldest first)
   *       '401':
   *         description: User is not authenticated
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
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   nullable: true
   *       '403':
   *         description: Missing reveal-identity permission (`complaint.reveal_identity`)
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
   *                 message:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: reveal-permission-denied
   *                 detail:
   *                   type: string
   *                 code:
   *                   type: string
   *                   example: CMPL.FORB.REVEAL.001
   *                 data:
   *                   type: object
   *                   nullable: true
   *       '404':
   *         description: Complaint not found or outside business unit scope
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
   *                 message:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: complaint-not-found
   *                 detail:
   *                   type: string
   *                 code:
   *                   type: string
   *                   example: CMP.NF.001
   *                 data:
   *                   type: object
   *                   nullable: true
   *       default:
   *         description: Unexpected error
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
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   nullable: true
   */
  async revealHistory(ctx: HttpContext) {
    const { auth, params, response, i18n, businessUnitScope } = ctx
    try {
      await this.complaintApiService.assertRevealIdentityPermission(auth.user!)

      const complaintService = new ComplaintService()
      const result = await complaintService.listRevealHistory(
        Number(params.complaintId),
        businessUnitScope ?? []
      )

      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('complaint_title'),
        message: i18n.formatMessage('complaint_reveal_history_success'),
        data: result,
      }
    } catch (error) {
      return this.complaintApiService.respondError(error, response, 404, i18n)
    }
  }

  /**
   * @swagger
   * /api/v1/complaints/report:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Complaints
   *     summary: aggregated complaint report by period
   *     description: |
   *       STPS aggregate report for the confidential complaint mailbox. Returns total volume,
   *       breakdown by category and average resolution time (capture → first resuelto/cerrado).
   *
   *       **Confidentiality:** 100% aggregated metrics; no reporter identity or per-case detail.
   *
   *       Requires the dedicated RBAC permission `report` on the complaints module
   *       (`complaint.report`). Having `read` alone does not authorize this endpoint.
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: query
   *         name: from
   *         required: true
   *         description: Start date of the reporting period (inclusive, ISO 8601 date)
   *         schema:
   *           type: string
   *           format: date
   *           pattern: '^\\d{4}-\\d{2}-\\d{2}$'
   *           example: "2026-01-01"
   *       - in: query
   *         name: to
   *         required: true
   *         description: End date of the reporting period (inclusive, ISO 8601 date)
   *         schema:
   *           type: string
   *           format: date
   *           pattern: '^\\d{4}-\\d{2}-\\d{2}$'
   *           example: "2026-06-30"
   *     responses:
   *       '200':
   *         description: Aggregate report generated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Localized module title
   *                 message:
   *                   type: string
   *                   description: Localized success message
   *                 data:
   *                   type: object
   *                   description: STPS aggregate metrics (no reporter identity or per-case rows)
   *       '400':
   *         description: Query validation failed (missing or malformed from/to dates)
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
   *                 message:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: AUTH.COMPLAINT.VAL_INPUT
   *                 detail:
   *                   type: string
   *                 code:
   *                   type: string
   *                   example: CMPL.VAL.001
   *                 data:
   *                   type: object
   *                   nullable: true
   *       '401':
   *         description: User is not authenticated
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
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   nullable: true
   *       '403':
   *         description: Missing report permission on the complaints module (`complaint.report`)
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
   *                 message:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: permission-denied
   *                 detail:
   *                   type: string
   *                 code:
   *                   type: string
   *                   example: CMPL.FORB.001
   *                 data:
   *                   type: object
   *                   nullable: true
   *       '422':
   *         description: Inverted date range (start date after end date)
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
   *                 message:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: invalid-date-range
   *                 detail:
   *                   type: string
   *                 code:
   *                   type: string
   *                   example: CMPL.VAL.DATE.001
   *                 data:
   *                   type: object
   *                   nullable: true
   *       default:
   *         description: Unexpected error
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
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   nullable: true
   */
  async report(ctx: HttpContext) {
    const { auth, request, response, i18n, businessUnitScope } = ctx
    try {
      await this.complaintApiService.assertReportPermission(auth.user!)

      const payload = await request.validateUsing(complaintReportValidator, {
        data: request.qs(),
      })
      const period = parseComplaintReportDateRange(payload.from, payload.to)

      const complaintService = new ComplaintService()
      const result = await complaintService.buildAggregatedReport(period, businessUnitScope ?? [])

      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('complaint_title'),
        message: i18n.formatMessage('complaint_report_success'),
        data: result,
      }
    } catch (error) {
      return this.complaintApiService.respondError(error, response, 422, i18n)
    }
  }

  /**
   * @swagger
   * /api/v1/complaints/report/export:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Complaints
   *     summary: export aggregated complaint report (Excel or PDF)
   *     description: |
   *       Server-side export of the same aggregate metrics as GET /complaints/report.
   *       The file contains **only** aggregated counts and averages — never reporter identity,
   *       employee data, folios or per-case rows.
   *
   *       Requires the dedicated RBAC permission `report` on the complaints module
   *       (`complaint.report`). Having `read` alone does not authorize this endpoint.
   *
   *       On success the response body is the binary file (not JSON). Error responses
   *       follow the standard JSON error envelope.
   *     produces:
   *       - application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
   *       - application/pdf
   *     parameters:
   *       - in: query
   *         name: from
   *         required: true
   *         description: Start date of the reporting period (inclusive, ISO 8601 date)
   *         schema:
   *           type: string
   *           format: date
   *           pattern: '^\\d{4}-\\d{2}-\\d{2}$'
   *           example: "2026-01-01"
   *       - in: query
   *         name: to
   *         required: true
   *         description: End date of the reporting period (inclusive, ISO 8601 date)
   *         schema:
   *           type: string
   *           format: date
   *           pattern: '^\\d{4}-\\d{2}-\\d{2}$'
   *           example: "2026-06-30"
   *       - in: query
   *         name: format
   *         required: true
   *         description: Export format (Excel workbook or PDF document)
   *         schema:
   *           type: string
   *           enum: [xlsx, pdf]
   *           example: xlsx
   *     responses:
   *       '200':
   *         description: Export file generated successfully
   *         headers:
   *           Content-Disposition:
   *             schema:
   *               type: string
   *             description: Attachment filename (`reporte-quejas_{from}_{to}.{xlsx|pdf}`)
   *           Content-Length:
   *             schema:
   *               type: integer
   *             description: File size in bytes
   *         content:
   *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
   *             schema:
   *               type: string
   *               format: binary
   *               description: Excel workbook when format=xlsx
   *           application/pdf:
   *             schema:
   *               type: string
   *               format: binary
   *               description: PDF document when format=pdf
   *       '400':
   *         description: Query validation failed (missing/malformed dates or invalid format)
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
   *                 message:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: AUTH.COMPLAINT.VAL_INPUT
   *                 detail:
   *                   type: string
   *                 code:
   *                   type: string
   *                   example: CMPL.VAL.001
   *                 data:
   *                   type: object
   *                   nullable: true
   *       '401':
   *         description: User is not authenticated
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
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   nullable: true
   *       '403':
   *         description: Missing report permission on the complaints module (`complaint.report`)
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
   *                 message:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: permission-denied
   *                 detail:
   *                   type: string
   *                 code:
   *                   type: string
   *                   example: CMPL.FORB.001
   *                 data:
   *                   type: object
   *                   nullable: true
   *       '422':
   *         description: Inverted date range (start date after end date)
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
   *                 message:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: invalid-date-range
   *                 detail:
   *                   type: string
   *                 code:
   *                   type: string
   *                   example: CMPL.VAL.DATE.001
   *                 data:
   *                   type: object
   *                   nullable: true
   *       default:
   *         description: Unexpected error
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
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   nullable: true
   */
  async reportExport(ctx: HttpContext) {
    const { auth, request, response, i18n, businessUnitScope } = ctx
    try {
      await this.complaintApiService.assertReportPermission(auth.user!)

      const payload = await request.validateUsing(complaintReportExportValidator, {
        data: request.qs(),
      })
      const period = parseComplaintReportDateRange(payload.from, payload.to)

      const complaintService = new ComplaintService()
      const report = await complaintService.buildAggregatedReport(period, businessUnitScope ?? [])
      const filename = complaintService.buildReportExportFilename(report, payload.format)

      if (payload.format === 'xlsx') {
        const buffer = await complaintService.buildReportExcel(report, i18n)
        response.header(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response.header('Content-Disposition', `attachment; filename="${filename}"`)
        response.header('Content-Length', buffer.length.toString())
        response.status(200)
        return response.send(buffer)
      }

      const pdfBuffer = await complaintService.buildReportPdf(report, i18n)
      response.header('Content-Type', 'application/pdf')
      response.header('Content-Disposition', `attachment; filename="${filename}"`)
      response.header('Content-Length', pdfBuffer.length.toString())
      response.status(200)
      return response.send(pdfBuffer)
    } catch (error) {
      return this.complaintApiService.respondError(error, response, 422, i18n)
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
   *                   example: case-not-found
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
      return this.complaintApiService.respondError(error, response, 500, i18n)
    }
  }
}
