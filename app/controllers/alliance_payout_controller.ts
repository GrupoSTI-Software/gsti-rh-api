import type { HttpContext } from '@adonisjs/core/http'
import AlliancePayoutService from '#services/alliance_payout_service'
import { createAlliancePayoutValidator } from '#validators/alliance_payout'
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
