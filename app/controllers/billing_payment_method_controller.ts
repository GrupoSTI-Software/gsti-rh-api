import type { HttpContext } from '@adonisjs/core/http'
import BillingPaymentMethodService from '#services/billing_payment_method_service'
import { assertBillingOwner } from '../helpers/billing_owner_guard.js'
import { onlyAccountOwnerCanManagePaymentMethodError } from '../helpers/billing_tenant_error.js'
import { resolveBillingSubscriptionApiError } from '../helpers/billing_subscription_api_error.js'
import { setDefaultPaymentMethodValidator } from '#validators/billing_payment_method'

/**
 * Tarjeta predeterminada de cobro (lectura y cambio — USRH1790724549203 / USRH1790708507752).
 */
export default class BillingPaymentMethodController {
  private readonly service = new BillingPaymentMethodService()

  /**
   * @swagger
   * /api/billing/subscription/payment-method:
   *   get:
   *     tags:
   *       - Billing Subscription
   *     summary: Consultar tarjeta de cobro vigente
   *     description: |
   *       Devuelve marca, últimos cuatro y vencimiento leídos de Stripe para la
   *       suscripción viva con proveedor stripe. Con cobro manual responde
   *       `managed: false` sin llamar a Stripe. Solo el dueño de la cuenta.
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
   *         description: Tarjeta gestionada, no aplica o sin tarjeta registrada
   *       '403':
   *         description: Rol distinto al dueño de la cuenta
   *       '500':
   *         description: Error del proveedor o del servidor
   */
  async show(ctx: HttpContext) {
    const { response } = ctx
    response.header('Cache-Control', 'no-store')

    try {
      await assertBillingOwner(ctx, onlyAccountOwnerCanManagePaymentMethodError)
      const data = await this.service.show()
      return response.status(200).json({ type: 'success', data })
    } catch (error: unknown) {
      const { status, ...body } = resolveBillingSubscriptionApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/billing/subscription/payment-method/setup-intent:
   *   post:
   *     tags:
   *       - Billing Subscription
   *     summary: Preparar autorización para cambiar la tarjeta
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       '200':
   *         description: Claves para montar Payment Element
   *       '422':
   *         description: Cobro automático no activo o sin suscripción viva
   */
  async setupIntent(ctx: HttpContext) {
    const { response } = ctx
    response.header('Cache-Control', 'no-store')

    try {
      await assertBillingOwner(ctx, onlyAccountOwnerCanManagePaymentMethodError)
      const data = await this.service.prepareSetup()
      return response.status(200).json({ type: 'success', data })
    } catch (error: unknown) {
      const { status, ...body } = resolveBillingSubscriptionApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/billing/subscription/payment-method:
   *   post:
   *     tags:
   *       - Billing Subscription
   *     summary: Guardar tarjeta confirmada como predeterminada
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - setupIntentId
   *             properties:
   *               setupIntentId:
   *                 type: string
   *     responses:
   *       '200':
   *         description: Tarjeta actualizada en Stripe
   */
  async update(ctx: HttpContext) {
    const { request, response } = ctx
    response.header('Cache-Control', 'no-store')

    try {
      await assertBillingOwner(ctx, onlyAccountOwnerCanManagePaymentMethodError)
      const payload = await request.validateUsing(setDefaultPaymentMethodValidator)
      const data = await this.service.setDefault(payload.setupIntentId)
      return response.status(200).json({ type: 'success', data })
    } catch (error: unknown) {
      const { status, ...body } = resolveBillingSubscriptionApiError(error)
      return response.status(status).json(body)
    }
  }
}
