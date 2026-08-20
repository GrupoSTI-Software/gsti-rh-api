import type { HttpContext } from '@adonisjs/core/http'
import SatCatalogService from '#services/sat_catalog_service'
import { resolveSatCatalogApiError } from '#helpers/sat_catalog_api_error'
import type { SatCatalogSuccessResponse } from '../interfaces/sat_catalog_interface.js'

/**
 * Catálogos fiscales oficiales del SAT (USRH1786737531063).
 *
 * Contrato de éxito: `{ type: 'success', data: SatCatalogsResponse }`.
 * Errores: `{ title, detail, key, code }` con prefijo `SAT.CAT.*`.
 */
export default class SatCatalogController {
  private readonly service = new SatCatalogService()

  /**
   * @swagger
   * /api/billing/sat-catalogs:
   *   get:
   *     tags:
   *       - SAT Catalogs
   *     summary: Consultar catálogos fiscales del SAT
   *     description: |
   *       Devuelve íntegros `c_RegimenFiscal` (19 claves) y `c_UsoCFDI` (24 claves),
   *       incluyendo la relación de regímenes de receptor admitidos por cada uso.
   *       Catálogo global del sistema — no requiere `X-Business-Unit-Id`.
   *       Solo exige sesión iniciada (regla 9).
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       '200':
   *         description: Catálogos sembrados y completos
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 data:
   *                   type: object
   *                   properties:
   *                     taxRegimes:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           code:
   *                             type: string
   *                             example: "601"
   *                           description:
   *                             type: string
   *                             example: General de Ley Personas Morales
   *                           appliesToIndividual:
   *                             type: boolean
   *                           appliesToLegalEntity:
   *                             type: boolean
   *                     cfdiUses:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           code:
   *                             type: string
   *                             example: G03
   *                           description:
   *                             type: string
   *                             example: Gastos en general
   *                           appliesToIndividual:
   *                             type: boolean
   *                           appliesToLegalEntity:
   *                             type: boolean
   *                           receiverRegimeCodes:
   *                             type: array
   *                             items:
   *                               type: string
   *                             example: ["601", "603", "606"]
   *       '401':
   *         description: Sin sesión
   *       '500':
   *         description: Catálogo no sembrado u error del sistema
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                   example: Catálogos del SAT
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: catalogo-sat-no-disponible
   *                 code:
   *                   type: string
   *                   example: SAT.CAT.CATALOG_UNAVAILABLE
   */
  async index(ctx: HttpContext) {
    const { response } = ctx

    try {
      const data = await this.service.getCatalogs()

      const payload: SatCatalogSuccessResponse = { type: 'success', data }
      return response.status(200).json(payload)
    } catch (error) {
      const { status, ...body } = resolveSatCatalogApiError(error)
      return response.status(status).json(body)
    }
  }
}
