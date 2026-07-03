import type { HttpContext } from '@adonisjs/core/http'
import PiiAccessLogService from '#services/pii_access_log_service'
import { piiAccessLogsListValidator } from '#validators/pii_access_log'

/**
 * Controlador de historial de auditoría de accesos a datos personales sensibles.
 *
 * Ref: USRH1783019898097 — Enmascarar datos sensibles y registrar acceso al dato completo.
 */
export default class PiiAccessLogController {
  /**
   * @swagger
   * /api/v1/pii/access-logs:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - PII
   *     summary: Get paginated PII access audit log
   *     description: |
   *       Returns the immutable audit log of every sensitive-field reveal within the
   *       authenticated user's business unit scope. Results are ordered by most recent first.
   *     parameters:
   *       - name: page
   *         in: query
   *         required: false
   *         schema:
   *           type: integer
   *           default: 1
   *       - name: limit
   *         in: query
   *         required: false
   *         schema:
   *           type: integer
   *           default: 25
   *       - name: model
   *         in: query
   *         required: false
   *         schema:
   *           type: string
   *         description: Filter by Lucid model name (e.g. "Person")
   *       - name: column
   *         in: query
   *         required: false
   *         schema:
   *           type: string
   *         description: Filter by model property (e.g. "personCurp")
   *       - name: recordId
   *         in: query
   *         required: false
   *         schema:
   *           type: integer
   *         description: Filter by record primary key
   *       - name: accessorUserId
   *         in: query
   *         required: false
   *         schema:
   *           type: integer
   *         description: Filter by the user who performed the reveal
   *       - name: dateFrom
   *         in: query
   *         required: false
   *         schema:
   *           type: string
   *           format: date
   *         description: Start date filter (YYYY-MM-DD)
   *       - name: dateTo
   *         in: query
   *         required: false
   *         schema:
   *           type: string
   *           format: date
   *         description: End date filter (YYYY-MM-DD)
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
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *       '400':
   *         description: Invalid query parameters
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
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
      const filters = await request.validateUsing(piiAccessLogsListValidator)
      const logService = new PiiAccessLogService()
      const result = await logService.list(filters, businessUnitScope ?? [])

      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('pii_reveal_title'),
        message: i18n.formatMessage('pii_access_logs_list_success'),
        data: result,
      }
    } catch (error) {
      response.status(400)
      return {
        type: 'error',
        title: i18n.formatMessage('pii_reveal_title'),
        message: i18n.formatMessage('pii_reveal_error'),
        data: null,
      }
    }
  }
}
