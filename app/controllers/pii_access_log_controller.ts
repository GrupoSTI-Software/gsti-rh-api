import type { HttpContext } from '@adonisjs/core/http'
import PiiAccessLogService from '#services/pii_access_log_service'
import { piiAccessLogsListValidator } from '#validators/pii_access_log'
import { resolvePiiAuditApiError } from '../helpers/pii_audit_api_error.js'

/**
 * Controlador de historial de auditoría de accesos a datos personales sensibles.
 *
 * Ref: USRH1783019898097 — Enmascarar datos sensibles y registrar acceso al dato completo.
 * Ref: USRH1783029948545 — Consultar la bitácora de accesos a datos sensibles.
 */
export default class PiiAccessLogController {
  private respondError(
    error: unknown,
    response: HttpContext['response'],
    fallbackStatus: number,
    i18n: HttpContext['i18n']
  ) {
    const resolved = resolvePiiAuditApiError(error, fallbackStatus, i18n)
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
   * /api/v1/pii/access-logs:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - PII
   *     summary: Get paginated sensitive data access audit log
   *     description: |
   *       Returns the immutable audit log of sensitive-field reveals and grouped exports
   *       within the authenticated user's business unit scope. Results are ordered by most
   *       recent first. When no date range is provided, defaults to the last 30 days.
   *
   *       Never returns decrypted field values — only references (model, column, category).
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
   *       - name: employeeId
   *         in: query
   *         required: false
   *         schema:
   *           type: integer
   *         description: Filter by employee (individual reveals or grouped export subjects)
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
   *         description: Filter by the user who performed the access
   *       - name: dateFrom
   *         in: query
   *         required: false
   *         schema:
   *           type: string
   *           format: date
   *         description: Start date filter (YYYY-MM-DD). Defaults to 30 days ago when omitted.
   *       - name: dateTo
   *         in: query
   *         required: false
   *         schema:
   *           type: string
   *           format: date
   *         description: End date filter (YYYY-MM-DD). Defaults to today when omitted.
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
   *         description: Invalid query parameters (SEC.AUD.VAL.001)
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
   *       '422':
   *         description: Invalid date range (SEC.AUD.VAL.DATE.001)
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
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   */
  async index(ctx: HttpContext) {
    const { request, response, i18n, businessUnitScope } = ctx

    try {
      const filters = await request.validateUsing(piiAccessLogsListValidator)
      const logService = new PiiAccessLogService()
      const result = await logService.list(filters, businessUnitScope ?? [])

      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('pii_audit_title'),
        message: i18n.formatMessage('pii_access_logs_list_success'),
        data: result,
      }
    } catch (error) {
      return this.respondError(error, response, 500, i18n)
    }
  }
}
