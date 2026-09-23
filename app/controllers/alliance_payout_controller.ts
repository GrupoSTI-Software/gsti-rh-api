import type { HttpContext } from '@adonisjs/core/http'
import AlliancePayoutService from '#services/alliance_payout_service'
import {
  createAlliancePayoutValidator,
  listAlliancePayoutsValidator,
  annulAlliancePayoutValidator,
} from '#validators/alliance_payout'
import { resolveAllianceApiError } from '../helpers/alliance_api_error.js'

/**
 * Controlador de liquidaciones de alianza (USRH1787719056820).
 * `auth` + `platformAdmin`: dato comercial de plataforma. El actor de la
 * liquidación sale siempre de la sesión, nunca del cuerpo (regla 3).
 */
export default class AlliancePayoutController {
  private readonly service = new AlliancePayoutService()

  /**
   * @swagger
   * /api/platform/alliances/{allianceId}/payouts:
   *   get:
   *     tags:
   *       - Platform Alliances
   *     summary: Historial paginado de liquidaciones de una alianza comercial
   *     description: >
   *       Devuelve todas las liquidaciones de la alianza (registradas y anuladas),
   *       de la más reciente a la más antigua por fecha de pago. Incluye conteo
   *       de comisiones y nombres de quien las registró o anuló.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: allianceId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           maximum: 100
   *     responses:
   *       '200':
   *         description: Historial de liquidaciones
   *       '404':
   *         description: Alianza no encontrada (PLT.ALL.NOT_FOUND)
   *       '422':
   *         description: Parámetros de paginación inválidos (PLT.ALL.VAL_INPUT)
   */
  async index({ auth, params, request, response }: HttpContext) {
    try {
      const query = await request.validateUsing(listAlliancePayoutsValidator)
      const actorUserId = auth.user!.userId
      void actorUserId // el historial es de solo lectura; el actor se usa para auditoría futura
      const data = await this.service.listPayouts(Number(params.allianceId), {
        page: query.page,
        limit: query.limit,
      })
      return response.status(200).json({ type: 'success', ...data })
    } catch (error) {
      const { status, ...body } = resolveAllianceApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/alliance-payouts/{alliancePayoutId}:
   *   get:
   *     tags:
   *       - Platform Alliances
   *     summary: Rastro completo de una liquidación con sus comisiones
   *     description: >
   *       Devuelve el encabezado de la liquidación más las comisiones que
   *       incluyó, con su estado actual (pagada o por pagar). Sin paginar
   *       (máximo 200 comisiones por liquidación).
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: alliancePayoutId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Detalle de la liquidación
   *       '404':
   *         description: Liquidación no encontrada (PLT.ALL.PAYOUT_NOT_FOUND)
   */
  async show({ auth, params, response }: HttpContext) {
    try {
      const actorUserId = auth.user!.userId
      void actorUserId
      const data = await this.service.getPayoutDetail(Number(params.alliancePayoutId))
      return response.status(200).json({ type: 'success', data })
    } catch (error) {
      const { status, ...body } = resolveAllianceApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/alliance-payouts/{alliancePayoutId}/annul:
   *   post:
   *     tags:
   *       - Platform Alliances
   *     summary: Anular completa una liquidación registrada
   *     description: >
   *       Deshace la liquidación completa con motivo obligatorio. Todas sus
   *       comisiones vuelven a por pagar en el mismo acto. La liquidación
   *       anulada queda en el historial con fecha, motivo y quién la anuló.
   *       Solo en liquidaciones registradas; una anulada no se puede anular
   *       de nuevo.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: alliancePayoutId
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [reason]
   *             properties:
   *               reason:
   *                 type: string
   *                 maxLength: 500
   *     responses:
   *       '200':
   *         description: Liquidación anulada
   *       '404':
   *         description: Liquidación no encontrada (PLT.ALL.PAYOUT_NOT_FOUND)
   *       '422':
   *         description: >
   *           Motivo inválido (PLT.ALL.VAL_INPUT) |
   *           La liquidación ya estaba anulada (PLT.ALL.PAYOUT_ALREADY_ANNULLED)
   */
  async annul({ auth, params, request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(annulAlliancePayoutValidator)
      const actorUserId = auth.user!.userId
      const data = await this.service.annulPayout(
        Number(params.alliancePayoutId),
        { reason: payload.reason },
        actorUserId
      )
      return response.status(200).json({ type: 'success', data })
    } catch (error) {
      const { status, ...body } = resolveAllianceApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/alliances/{allianceId}/payouts:
   *   post:
   *     tags:
   *       - Platform Alliances
   *     summary: Registrar una liquidación de comisiones de una alianza comercial
   *     description: >
   *       Deja escrito que GSTI ya le pagó a la alianza las comisiones
   *       indicadas: fecha de pago, referencia, monto (suma congelada) y
   *       quién la registró (de la sesión). Todo o nada: si una sola
   *       comisión no puede liquidarse, no se registra nada. Ninguna
   *       comisión queda pagada dos veces.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: allianceId
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [commissionIds, paidOn, reference]
   *             properties:
   *               commissionIds:
   *                 type: array
   *                 items:
   *                   type: integer
   *               paidOn:
   *                 type: string
   *                 format: date
   *               reference:
   *                 type: string
   *     responses:
   *       '201':
   *         description: Liquidación registrada
   *       '404':
   *         description: >
   *           Alianza no encontrada o retirada (PLT.ALL.NOT_FOUND) |
   *           Alguna comisión no existe o es de otra alianza (PLT.ALL.COMMISSION_NOT_FOUND)
   *       '409':
   *         description: Alguna comisión ya está pagada (PLT.ALL.COMMISSION_ALREADY_PAID)
   *       '422':
   *         description: >
   *           Datos inválidos (PLT.ALL.VAL_INPUT) |
   *           Fecha de pago futura (PLT.ALL.PAYOUT_DATE_IN_FUTURE) |
   *           Fecha de pago anterior a la comisión más reciente (PLT.ALL.PAYOUT_DATE_BEFORE_ACCRUAL)
   */
  async store({ auth, params, request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(createAlliancePayoutValidator)
      const actorUserId = auth.user!.userId
      const data = await this.service.createPayout(
        Number(params.allianceId),
        payload,
        actorUserId
      )
      return response.status(201).json({ type: 'success', data })
    } catch (error) {
      const { status, ...body } = resolveAllianceApiError(error)
      return response.status(status).json(body)
    }
  }
}
