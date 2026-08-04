import type { HttpContext } from '@adonisjs/core/http'
import BillingTenantService from '#services/billing_tenant_service'
import { resolveBillingSubscriptionApiError } from '../helpers/billing_subscription_api_error.js'
import { publicPlanPriceQueryValidator } from '#validators/billing_tenant'

/**
 * Superficie de billing orientada al visitante anónimo (paso 1 del registro)
 * y al tenant autenticado (consulta de suscripción viva).
 *
 * Las rutas públicas no requieren sesión; `mySubscription` exige `auth` +
 * `businessScope` (registrado en `billing_routes.ts`).
 */
export default class BillingTenantController {
  private readonly service = new BillingTenantService()

  /**
   * @swagger
   * /api/signup/plans:
   *   get:
   *     tags:
   *       - Signup Billing
   *     summary: Catálogo público de planes a la venta
   *     description: |
   *       Devuelve únicamente los planes publicados, activos y con precio vigente
   *       para el día de hoy. No requiere sesión ni datos del visitante.
   *       La respuesta usa lista blanca de campos (sin datos del proveedor de cobro
   *       ni metadatos internos del catálogo).
   *     responses:
   *       '200':
   *         description: Lista de planes vendibles con precio vigente y tramos
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
   *                   type: array
   *                   description: List of plans
   *       '429':
   *         description: Límite de peticiones excedido (signup-catalog)
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
   *                   type: array
   *                   description: List of plans
   */
  async publicPlans({ response }: HttpContext) {
    try {
      const plans = await this.service.listPublicPlans()
      return response.status(200).json({ type: 'success', data: plans })
    } catch (error) {
      const { status, ...body } = resolveBillingSubscriptionApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/signup/plans/{planId}/price:
   *   get:
   *     tags:
   *       - Signup Billing
   *     summary: Precio resuelto para una cantidad de empleados
   *     description: |
   *       Calcula el precio completo para el plan y la cantidad indicada.
   *       El visitante no envía montos; todo se resuelve server-side desde el
   *       catálogo. La cantidad debe ser entero positivo (forma); la regla de
   *       bloques de 10 se valida en el servicio.
   *     parameters:
   *       - in: path
   *         name: planId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: query
   *         name: employees
   *         required: true
   *         schema:
   *           type: integer
   *           minimum: 1
   *         description: Cantidad de empleados a contratar (bloques de 10, mínimo 10)
   *     responses:
   *       '200':
   *         description: Precio resuelto con totales, días de prueba y fecha de primer pago
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
   *       '404':
   *         description: Plan no disponible (respuesta opaca)
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
   *       '422':
   *         description: Query inválido o cantidad fuera de reglas self-service
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
   *       '429':
   *         description: Límite de peticiones excedido (signup-catalog)
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
   */
  async publicPlanPrice({ params, request, response }: HttpContext) {
    try {
      const qs = await request.validateUsing(publicPlanPriceQueryValidator)
      const result = await this.service.resolvePublicPlanPrice(
        Number(params.planId),
        qs.employees
      )
      return response.status(200).json({ type: 'success', data: result })
    } catch (error) {
      const { status, ...body } = resolveBillingSubscriptionApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/billing/subscription/me:
   *   get:
   *     tags:
   *       - Tenant Billing
   *     summary: Suscripción viva y origen de la empresa activa
   *     description: |
   *       Devuelve siempre `businessUnitOrigin` y la suscripción viva del tenant
   *       del header `X-Business-Unit-Id`, o `subscription: null` si no hay
   *       contratación en curso. Nunca responde 404 por ausencia de suscripción.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       '200':
   *         description: Origen de la empresa y suscripción viva (o null)
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
   *       '400':
   *         description: Falta header X-Business-Unit-Id
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
   *       '401':
   *         description: No autenticado
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
   *       '404':
   *         description: Empresa fuera de alcance o inexistente
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
   */
  async mySubscription({ response }: HttpContext) {
    try {
      const result = await this.service.getMySubscription()
      return response.status(200).json({ type: 'success', data: result })
    } catch (error) {
      const { status, ...body } = resolveBillingSubscriptionApiError(error)
      return response.status(status).json(body)
    }
  }
}
