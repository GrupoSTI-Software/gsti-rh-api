import type { HttpContext } from '@adonisjs/core/http'
import ComplaintAttachmentService from '#services/complaint_attachment_service'
import { resolveComplaintApiError } from '../helpers/complaint_api_error.js'

/**
 * Controlador REST de adjuntos del buzón de quejas (NOM-035 8.1.b).
 */
export default class ComplaintAttachmentController {
  /**
   * @swagger
   * /api/v1/complaints/{folio}/attachments:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Complaints
   *     summary: upload sanitized complaint attachment
   *     description: |
   *       Employee endpoint to attach evidence to an existing complaint identified by its
   *       public folio. The file is validated by real MIME type (not extension), sanitized
   *       to remove identifying metadata (EXIF, PDF author/producer, ID3 tags), and stored
   *       in private tenant-scoped S3 storage. The original file with metadata is never
   *       persisted.
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: folio
   *         required: true
   *         schema:
   *           type: string
   *         description: Public complaint folio returned at submission time
   *         example: BQ-2026-482917
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required:
   *               - file
   *             properties:
   *               file:
   *                 type: string
   *                 format: binary
   *                 description: Image (jpeg, png, webp), PDF or audio (mpeg) up to 10 MB
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
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Sanitized attachment metadata (S3 path is never exposed)
   *                   properties:
   *                     complaintAttachmentId:
   *                       type: integer
   *                       description: Attachment identifier
   *                     complaintId:
   *                       type: integer
   *                       description: Parent complaint identifier
   *                     fileName:
   *                       type: string
   *                       description: Display file name
   *                     mimeType:
   *                       type: string
   *                       description: MIME type of the sanitized file
   *                     fileSize:
   *                       type: integer
   *                       description: Sanitized file size in bytes
   *                     sanitized:
   *                       type: boolean
   *                       description: Always true after successful upload
   *                     createdAt:
   *                       type: string
   *                       format: date-time
   *                     updatedAt:
   *                       type: string
   *                       format: date-time
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
   *       '422':
   *         description: Invalid file type, size or content (key archivo-invalido)
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
   *                   example: archivo-invalido
   *                 code:
   *                   type: string
   *                   description: Stable client error code
   *                   example: CMPL.VAL.FILE.001
   *                 detail:
   *                   type: string
   *                   description: Human-readable error detail
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
  async store({ auth, params, request, response, i18n }: HttpContext) {
    try {
      await auth.check()
      const file = request.file('file')
      const service = new ComplaintAttachmentService()
      const result = await service.uploadByFolio(params.folio, file, auth.user!)

      response.status(201)
      return {
        type: 'success',
        title: i18n.formatMessage('complaint_title'),
        message: i18n.formatMessage('complaint_attachment_created_success'),
        data: result,
      }
    } catch (error) {
      return this.respondError(error, response, 500, i18n)
    }
  }

  /**
   * @swagger
   * /api/v1/complaints/{complaintId}/attachments:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Complaints
   *     summary: list complaint attachments
   *     description: |
   *       Backoffice endpoint that returns all active attachments for a complaint within
   *       the authenticated user's business unit scope. Internal storage paths are never
   *       included; use the download-url endpoint to obtain a temporary signed link.
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: complaintId
   *         required: true
   *         schema:
   *           type: integer
   *         description: Internal complaint identifier
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
   *                   type: array
   *                   description: Attachments ordered by creation date descending
   *                   items:
   *                     type: object
   *                     properties:
   *                       complaintAttachmentId:
   *                         type: integer
   *                         description: Attachment identifier
   *                       complaintId:
   *                         type: integer
   *                         description: Parent complaint identifier
   *                       fileName:
   *                         type: string
   *                         description: Display file name
   *                       mimeType:
   *                         type: string
   *                         description: MIME type of the sanitized file
   *                       fileSize:
   *                         type: integer
   *                         description: File size in bytes
   *                       sanitized:
   *                         type: boolean
   *                         description: Whether metadata was stripped before storage
   *                       createdAt:
   *                         type: string
   *                         format: date-time
   *                       updatedAt:
   *                         type: string
   *                         format: date-time
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
  async index({ params, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new ComplaintAttachmentService()
      const result = await service.listByComplaintId(
        Number(params.complaintId),
        businessUnitScope ?? []
      )

      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('complaint_title'),
        message: i18n.formatMessage('complaint_attachment_list_success'),
        data: result,
      }
    } catch (error) {
      return this.respondError(error, response, 404, i18n)
    }
  }

  /**
   * @swagger
   * /api/v1/complaints/attachments/{id}/download-url:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Complaints
   *     summary: get signed download url for attachment
   *     description: |
   *       Returns a temporary pre-signed S3 URL (5 minutes) for the already sanitized
   *       attachment file. The file is never served directly from the API. Access is
   *       restricted to attachments belonging to complaints within the user's business
   *       unit scope.
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Attachment identifier
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
   *                   description: Signed download payload
   *                   properties:
   *                     downloadUrl:
   *                       type: string
   *                       description: Pre-signed URL to download the sanitized file
   *                     expiresInSeconds:
   *                       type: integer
   *                       description: URL validity in seconds
   *                       example: 300
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
  async downloadUrl({ params, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new ComplaintAttachmentService()
      const result = await service.getDownloadUrl(Number(params.id), businessUnitScope ?? [])

      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('complaint_title'),
        message: i18n.formatMessage('complaint_attachment_download_success'),
        data: result,
      }
    } catch (error) {
      return this.respondError(error, response, 404, i18n)
    }
  }

  /**
   * @swagger
   * /api/v1/complaints/attachments/{id}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Complaints
   *     summary: delete complaint attachment
   *     description: |
   *       Soft-deletes the attachment record within the user's business unit scope.
   *       The S3 object is retained for audit purposes; only the database row is marked
   *       as deleted.
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Attachment identifier
   *     responses:
   *       '200':
   *         description: Resource deleted successfully
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
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   nullable: true
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
  async destroy({ params, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new ComplaintAttachmentService()
      await service.destroy(Number(params.id), businessUnitScope ?? [])

      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('complaint_title'),
        message: i18n.formatMessage('complaint_attachment_deleted_success'),
        data: null,
      }
    } catch (error) {
      return this.respondError(error, response, 404, i18n)
    }
  }

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
}
