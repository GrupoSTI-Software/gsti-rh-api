import type { HttpContext } from '@adonisjs/core/http'
import BillingSubscriptionService from '#services/billing_subscription_service'
import { createBillingSubscriptionValidator } from '#validators/billing_subscription'
import { resolveBillingSubscriptionApiError } from '../helpers/billing_subscription_api_error.js'

/**
 * Controlador de suscripciones de la plataforma (contratación manual) y del
 * picker mínimo de empresas para el alta. Todos los endpoints requieren
 * middleware `auth` + `platformAdmin`.
 */
export default class BillingSubscriptionController {
  private readonly service = new BillingSubscriptionService()

  /**
   * @swagger
   * /api/platform/billing/business-units:
   *   get:
   *     tags:
   *       - Platform Billing
   *     summary: Listar empresas activas para el picker del alta de suscripción
   *     description: |
   *       Listado mínimo de empresas (identificador público + nombre + conteo
   *       de empleados activos) para elegir la empresa en el drawer de alta.
   *       Nunca expone el identificador interno de la empresa.
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       '200':
   *         description: Lista de empresas activas
   */
  async businessUnits({ response }: HttpContext) {
    try {
      const businessUnits = await this.service.listBusinessUnits()
      return response.status(200).json({ type: 'success', data: businessUnits })
    } catch (error) {
      const { status, ...body } = resolveBillingSubscriptionApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/billing/subscriptions:
   *   get:
   *     tags:
   *       - Platform Billing
   *     summary: Listar suscripciones registradas
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       '200':
   *         description: Lista de suscripciones con empresa y plan precargados
   */
  async index({ response }: HttpContext) {
    try {
      const subscriptions = await this.service.listSubscriptions()
      return response.status(200).json({ type: 'success', data: subscriptions })
    } catch (error) {
      const { status, ...body } = resolveBillingSubscriptionApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/billing/subscriptions/{subscriptionId}:
   *   get:
   *     tags:
   *       - Platform Billing
   *     summary: Obtener detalle de una suscripción
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: subscriptionId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Detalle de la suscripción
   *       '404':
   *         description: Suscripción no encontrada
   */
  async show({ params, response }: HttpContext) {
    try {
      const subscription = await this.service.getSubscription(Number(params.subscriptionId))
      return response.status(200).json({ type: 'success', data: subscription })
    } catch (error) {
      const { status, ...body } = resolveBillingSubscriptionApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/billing/subscriptions:
   *   post:
   *     tags:
   *       - Platform Billing
   *     summary: Dar de alta manualmente la suscripción de una empresa existente
   *     description: |
   *       Congela el precio por empleado, el descuento por volumen y los días de
   *       prueba vigentes en el catálogo al momento de contratar. Nace en estado
   *       `trialing`, con `provider = manual`. En ningún momento se captura o
   *       expone un dato de tarjeta ni el identificador interno de la empresa.
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - businessUnitPublicId
   *               - billingPlanId
   *             properties:
   *               businessUnitPublicId:
   *                 type: string
   *                 format: uuid
   *               billingPlanId:
   *                 type: integer
   *               contractedEmployees:
   *                 type: integer
   *                 minimum: 1
   *                 description: Opcional; si se omite, se usa el conteo real de empleados activos.
   *     responses:
   *       '201':
   *         description: Suscripción creada en estado trialing
   *       '404':
   *         description: Empresa o plan no encontrado
   *       '409':
   *         description: La empresa ya tiene una suscripción viva
   *       '422':
   *         description: El plan no está publicado, la empresa está inactiva, no hay precio vigente o los datos son inválidos
   */
  async store({ request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(createBillingSubscriptionValidator)
      const subscription = await this.service.createSubscription(data)
      return response.status(201).json({ type: 'success', data: subscription })
    } catch (error) {
      const { status, ...body } = resolveBillingSubscriptionApiError(error)
      return response.status(status).json(body)
    }
  }
}
