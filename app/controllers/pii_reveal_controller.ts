import type { HttpContext } from '@adonisjs/core/http'
import PiiRevealService from '#services/pii_reveal_service'

/**
 * Controlador de reveal de datos personales sensibles.
 *
 * Expone un único endpoint GET que devuelve el valor en claro de un campo
 * enmascarado, registrando el acceso de forma transaccional (fail-closed)
 * antes de entregar el dato.
 *
 * Ref: USRH1783019898097 — Enmascarar datos sensibles y registrar acceso al dato completo.
 */
export default class PiiRevealController {
  /**
   * @swagger
   * /api/v1/pii/reveal/{model}/{column}/{recordId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - PII
   *     summary: Reveal full unmasked value of a sensitive field
   *     description: |
   *       Returns the unmasked value of a field marked as `maskedInApi` in the sensitive
   *       fields catalog. An immutable audit entry is written to `pii_access_logs` inside
   *       the same database transaction before the value is returned (fail-closed).
   *
   *       Access is restricted to records belonging to the authenticated user's business
   *       unit scope (anti-IDOR). If the field is not in the catalog, or the record does
   *       not belong to the user's scope, a 404 is returned.
   *     parameters:
   *       - in: path
   *         name: model
   *         required: true
   *         schema:
   *           type: string
   *         description: Lucid model class name (e.g. "Person", "EmployeeBank")
   *       - in: path
   *         name: column
   *         required: true
   *         schema:
   *           type: string
   *         description: camelCase model property (e.g. "personCurp")
   *       - in: path
   *         name: recordId
   *         required: true
   *         schema:
   *           type: integer
   *         description: Primary key of the record
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
   *       '404':
   *         description: Field not in catalog or record not in business unit scope
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
   *         description: Invalid parameters
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
   *                   properties:
   *                     error:
   *                       type: string
   */
  async reveal({ auth, request, response, params, i18n, businessUnitScope }: HttpContext) {
    try {
      const { model, column, recordId: rawRecordId } = params

      const recordId = Number(rawRecordId)
      if (!Number.isInteger(recordId) || recordId <= 0) {
        response.status(422)
        return {
          type: 'error',
          title: i18n.formatMessage('pii_reveal_title'),
          message: i18n.formatMessage('pii_reveal_invalid_params'),
          data: { recordId: 'El parámetro recordId debe ser un entero positivo.' },
        }
      }

      const revealService = new PiiRevealService()
      const result = await revealService.reveal(model, column, recordId, businessUnitScope ?? [], {
        accessorUserId: auth.user!.userId,
        accessorIp: request.ip(),
        accessorUserAgent: request.header('User-Agent') ?? null,
        requestId: request.id() ?? null,
      })

      if (!result) {
        response.status(404)
        return {
          type: 'error',
          title: i18n.formatMessage('pii_reveal_title'),
          message: i18n.formatMessage('pii_reveal_not_found'),
          data: null,
        }
      }

      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('pii_reveal_title'),
        message: i18n.formatMessage('pii_reveal_success'),
        data: { [column]: result.value },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: i18n.formatMessage('pii_reveal_title'),
        message: i18n.formatMessage('pii_reveal_error'),
        data: null,
      }
    }
  }
}
