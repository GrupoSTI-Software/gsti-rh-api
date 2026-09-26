import type { HttpContext } from '@adonisjs/core/http'
import BillingCatalogService from '#services/billing_catalog_service'
import { createBillingPriceValidator } from '#validators/billing_price'
import { resolveBillingCatalogApiError } from '../helpers/billing_catalog_api_error.js'

/**
 * Controlador de versiones de precio (append-only) de un plan.
 * Todos los endpoints requieren middleware `auth` + `platformAdmin`.
 */
export default class BillingPriceController {
  private readonly service = new BillingCatalogService()

  /**
   * @swagger
   * /api/platform/billing/plans/{planId}/prices:
   *   get:
   *     tags:
   *       - Platform Billing
   *     summary: Listar versiones de precio de un plan (historial completo)
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: planId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Lista de versiones de precio en orden de vigencia ascendente
   *       '404':
   *         description: Plan no encontrado
   */
  async index({ params, response }: HttpContext) {
    try {
      const prices = await this.service.listPrices(Number(params.planId))
      return response.status(200).json({ type: 'success', data: prices })
    } catch (error) {
      const { status, ...body } = resolveBillingCatalogApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/billing/plans/{planId}/prices:
   *   post:
   *     tags:
   *       - Platform Billing
   *     summary: Agregar versión de precio al plan (append-only)
   *     description: >
   *       Inserta una nueva versión de precio. Las versiones existentes son
   *       inmutables. El precio vigente es siempre el de MAX(effective_from ≤ hoy).
   *       `billingPlanPriceEffectiveFrom` se interpreta como día de calendario
   *       en la zona del negocio (America/Mexico_City) — "hoy" siempre lo
   *       decide el servidor, nunca el cliente. Si el plan ya tiene una
   *       versión vigente, la nueva no puede quedar por detrás de hoy (se
   *       rechaza con 422 PLT.CAT.PRICE_EFFECTIVE_FROM_IN_PAST); sin versión
   *       vigente se acepta fecha pasada, para poder dejar publicable un plan
   *       nuevo.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: planId
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - billingPlanPriceAmount
   *               - billingPlanPriceEffectiveFrom
   *             properties:
   *               billingPlanPriceAmount:
   *                 type: number
   *                 minimum: 0.01
   *                 description: Precio por empleado/mes
   *               billingPlanPriceCurrency:
   *                 type: string
   *                 default: MXN
   *               billingPlanPriceTaxRate:
   *                 type: number
   *                 default: 0.16
   *               billingPlanPriceTrialDays:
   *                 type: integer
   *                 default: 7
   *               billingPlanPriceEffectiveFrom:
   *                 type: string
   *                 format: date
   *                 description: Fecha YYYY-MM-DD desde la que aplica este precio
   *               billingPlanPriceStripePriceId:
   *                 type: string
   *                 nullable: true
   *               billingPlanPriceProvider:
   *                 type: string
   *                 default: manual
   *     responses:
   *       '201':
   *         description: Versión de precio creada
   *       '404':
   *         description: Plan no encontrado
   *       '409':
   *         description: Ya existe una versión con esa fecha de vigencia — PLT.CAT.PRICE_EFFECTIVE_FROM_DUPLICATE
   *       '422':
   *         description: >
   *           Datos inválidos (PLT.CAT.VAL_INPUT) o vigencia anterior a hoy
   *           con versión vigente existente (PLT.CAT.PRICE_EFFECTIVE_FROM_IN_PAST)
   */
  async store({ params, request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(createBillingPriceValidator)
      const price = await this.service.addPrice(Number(params.planId), data)
      return response.status(201).json({ type: 'success', data: price })
    } catch (error) {
      const { status, ...body } = resolveBillingCatalogApiError(error)
      return response.status(status).json(body)
    }
  }
}
