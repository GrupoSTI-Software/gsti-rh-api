import type { HttpContext } from '@adonisjs/core/http'
import AllianceCommissionService from '#services/alliance_commission_service'
import { listAllianceCommissionsValidator } from '#validators/alliance_commission'
import { resolveAllianceApiError } from '../helpers/alliance_api_error.js'

/**
 * Controlador de comisiones devengadas de una alianza (USRH1789529505468).
 * Solo lectura, `auth` + `platformAdmin`: dato comercial de plataforma.
 */
export default class AllianceCommissionController {
  private readonly service = new AllianceCommissionService()

  /**
   * @swagger
   * /api/platform/alliances/{allianceId}/commissions:
   *   get:
   *     tags:
   *       - Platform Alliances
   *     summary: Listar las comisiones devengadas de una alianza comercial
   *     description: >
   *       Detalle renglón por renglón de las comisiones ya asentadas al
   *       pagar un cliente atribuido, con el total devengado del mismo
   *       rango (`meta.totals`). Orden: más reciente primero. El rango de
   *       fechas filtra por el día de pago (hora de México), incluidos
   *       los dos extremos. Sin rango, histórico completo. Solo consulta:
   *       no calcula ni modifica ninguna comisión.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: allianceId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: query
   *         name: from
   *         required: false
   *         schema:
   *           type: string
   *           format: date
   *       - in: query
   *         name: to
   *         required: false
   *         schema:
   *           type: string
   *           format: date
   *       - in: query
   *         name: page
   *         required: false
   *         schema:
   *           type: integer
   *       - in: query
   *         name: limit
   *         required: false
   *         schema:
   *           type: integer
   *           maximum: 100
   *     responses:
   *       '200':
   *         description: >
   *           Lista paginada de comisiones devengadas, con
   *           `meta.totals.accruedCount` y `meta.totals.accruedCents` del
   *           mismo rango, independientes de la página consultada.
   *       '404':
   *         description: Alianza no encontrada o retirada (PLT.ALL.NOT_FOUND)
   *       '422':
   *         description: >
   *           Rango de fechas inválido, `from` posterior a `to`, o
   *           página/tamaño de página fuera de rango (PLT.ALL.VAL_INPUT)
   */
  async index({ params, request, response }: HttpContext) {
    try {
      const filters = await request.validateUsing(listAllianceCommissionsValidator, {
        data: request.qs(),
      })
      const result = await this.service.listAllianceCommissionsByAlliance(
        Number(params.allianceId),
        filters
      )
      return response.status(200).json({ type: 'success', ...result })
    } catch (error) {
      const { status, ...body } = resolveAllianceApiError(error)
      return response.status(status).json(body)
    }
  }
}
