import type { HttpContext } from '@adonisjs/core/http'
import { SENSITIVE_DATA_READ_ERROR_CODES } from '#constants/sensitive_data_read_error_codes'
import PiiRevealService from '#services/pii_reveal_service'
import SensitiveFieldsCatalogService from '#services/sensitive_fields_catalog_service'

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
   *         description: |
   *           Parámetros inválidos (envelope legado `{type,title,message,data}`)
   *           o el par no es revelable / no está clasificado (envelope `{title,detail,key,code}`:
   *           `EMP.SENS.READ.NOT_REVEALABLE` / `EMP.SENS.READ.NOT_CLASSIFIED`).
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

      const catalog = new SensitiveFieldsCatalogService()
      const eligibility = catalog.revealEligibility(model, column)
      if (eligibility === 'not_classified') {
        response.status(422)
        return {
          title: 'El campo solicitado no es un dato sensible',
          detail: 'El campo indicado no está clasificado en el catálogo de datos sensibles.',
          key: 'el-campo-solicitado-no-es-un-dato-sensible',
          code: SENSITIVE_DATA_READ_ERROR_CODES.NOT_CLASSIFIED,
        }
      }
      if (eligibility === 'not_revealable') {
        response.status(422)
        return {
          title: 'El dato no se puede revelar por esta vía',
          detail:
            'Este dato sensible se consulta con el permiso de su categoría; no está disponible en el revelado individual.',
          key: 'el-dato-no-se-puede-revelar-por-esta-via',
          code: SENSITIVE_DATA_READ_ERROR_CODES.NOT_REVEALABLE,
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
