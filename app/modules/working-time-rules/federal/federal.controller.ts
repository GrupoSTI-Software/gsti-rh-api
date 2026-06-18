import { HttpContext } from '@adonisjs/core/http'
import { DEFAULT_COUNTRY_CODE } from '#modules/working-time-rules/working_time_rule.constants'
import FederalService from './federal.service.js'

/**
 * Controller del catálogo federal de jornada (solo lectura).
 *
 * Expone la gradualidad de la reforma (reglas con business_unit_id null). El
 * catálogo es global, no de tenant: no requiere estrechar el scope. El header
 * X-Business-Unit-Id es opcional (middleware businessScopeOptional).
 */
export default class FederalController {
  /**
   * @swagger
   * /api/v1/working-time-rules/federal:
   *   get:
   *     summary: Lista el catálogo de reglas federales de jornada
   *     description: >
   *       Devuelve los escalones de la gradualidad de la reforma (reglas con
   *       business_unit_id null), ordenados por valid_from ascendente. Es un catálogo
   *       global de solo lectura; el header X-Business-Unit-Id es opcional.
   *     security:
   *       - bearerAuth: []
   *     tags: [WorkingTimeRuleFederal]
   *     parameters:
   *       - name: X-Business-Unit-Id
   *         in: header
   *         required: false
   *         description: Empresa (tenant) activa. Opcional; el catálogo es federal, no de tenant.
   *         schema: { type: integer }
   *       - name: countryCode
   *         in: query
   *         required: false
   *         schema: { type: string, example: "MX" }
   *     responses:
   *       200: { description: Catálogo federal devuelto }
   *       400: { description: Header X-Business-Unit-Id presente pero inválido (BU.VAL.001) }
   *       401: { description: Sin token }
   */
  async index(ctx: HttpContext) {
    const { request, response } = ctx

    const rawCountry = request.qs().countryCode
    const countryCode =
      typeof rawCountry === 'string' && rawCountry.trim().length === 2
        ? rawCountry.trim().toUpperCase()
        : DEFAULT_COUNTRY_CODE

    const service = new FederalService()
    const data = await service.listFederalRules(countryCode)

    return response.status(200).json({
      type: 'success',
      title: 'Catálogo federal de jornada',
      message: 'Reglas federales encontradas correctamente.',
      data,
    })
  }
}
