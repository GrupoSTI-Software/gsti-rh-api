import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import BillingRecurringBillingService from '#services/billing_recurring_billing_service'
import { assertBillingOwner } from '../helpers/billing_owner_guard.js'
import { onlyAccountOwnerCanViewRecurringBillingError } from '../helpers/billing_tenant_error.js'
import { resolveBillingSubscriptionApiError } from '../helpers/billing_subscription_api_error.js'
import { BillingSubscriptionServiceError } from '../exceptions/billing_subscription_service_error.js'
import { BILLING_SUBSCRIPTION_ERROR_CODES } from '#constants/billing_subscription_error_codes'

/**
 * Resumen de cobro automático en Mi suscripción (USRH1790708507781).
 */
export default class BillingRecurringBillingController {
  private readonly service = new BillingRecurringBillingService()

  /**
   * @swagger
   * /api/billing/subscription/recurring-billing:
   *   get:
   *     tags:
   *       - Billing Subscription
   *     summary: Consultar estado del cobro recurrente
   *     description: |
   *       Devuelve fallo vigente e historial reciente desde Valanserh.
   *       Solo el dueño de la cuenta; con cobro manual responde `automatic: false`.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       '200':
   *         description: Resumen de cobro automático o no aplicable
   *       '403':
   *         description: Rol distinto al dueño de la cuenta
   *       '500':
   *         description: Error del servidor
   */
  async show(ctx: HttpContext) {
    const { response } = ctx
    response.header('Cache-Control', 'no-store')

    try {
      await assertBillingOwner(ctx, onlyAccountOwnerCanViewRecurringBillingError)
      const data = await this.service.getForActiveBusinessUnit()
      return response.status(200).json({ type: 'success', data })
    } catch (error: unknown) {
      if (error instanceof BillingSubscriptionServiceError) {
        const { status, ...body } = resolveBillingSubscriptionApiError(error)
        return response.status(status).json(body)
      }

      logger.error(
        { code: BILLING_SUBSCRIPTION_ERROR_CODES.SYS_UNHANDLED },
        'Resumen del cobro recurrente fallido'
      )

      return response.status(500).json({
        title: 'Error del servidor',
        detail: 'Error inesperado en suscripciones.',
        key: BILLING_SUBSCRIPTION_ERROR_CODES.SYS_UNHANDLED,
        code: BILLING_SUBSCRIPTION_ERROR_CODES.SYS_UNHANDLED,
      })
    }
  }
}
