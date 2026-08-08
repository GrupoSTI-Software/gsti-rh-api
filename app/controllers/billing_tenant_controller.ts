import type { HttpContext } from '@adonisjs/core/http'
import BillingTenantService from '#services/billing_tenant_service'
import BillingSubscriptionChangeService from '#services/billing_subscription_change_service'
import { BILLING_SUBSCRIPTION_ERROR_CODES } from '../constants/billing_subscription_error_codes.js'
import { BillingSubscriptionServiceError } from '../exceptions/billing_subscription_service_error.js'
import { assertBillingOwner } from '../helpers/billing_owner_guard.js'
import { resolveBillingSubscriptionApiError } from '../helpers/billing_subscription_api_error.js'
import { TenantContext } from '../utils/tenant_context.js'
import {
  contractTenantSubscriptionValidator,
  previewSubscriptionChangeQueryValidator,
  publicPlanPriceQueryValidator,
} from '#validators/billing_tenant'

/**
 * Superficie de billing orientada al visitante anónimo (paso 1 del registro)
 * y al tenant autenticado (consulta de suscripción viva).
 *
 * Las rutas públicas no requieren sesión; `mySubscription` exige `auth` +
 * `businessScope` (registrado en `billing_routes.ts`).
 */
export default class BillingTenantController {
  private readonly service = new BillingTenantService()
  private readonly changeService = new BillingSubscriptionChangeService()

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
   *       contratación en curso. Incluye `minimumContractedEmployees` (número)
   *       solo cuando la empresa es de origen `self_service` y no tiene
   *       suscripción viva; en cualquier otro caso viene `null`. Nunca responde
   *       404 por ausencia de suscripción.
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

  /**
   * @swagger
   * /api/billing/subscription:
   *   post:
   *     tags:
   *       - Tenant Billing
   *     summary: Re-contratar un plan (empresa self-service sin suscripción viva)
   *     description: |
   *       Permite a una empresa de origen `self_service` sin contratación viva volver
   *       a contratar por su cuenta. La cantidad debe ser múltiplo de 10 y no puede
   *       ser menor que la plantilla activa redondeada al bloque superior. La
   *       suscripción nace en estado `active`, sin periodo de prueba. Las empresas
   *       dadas de alta a mano (`platform`) no pueden usar esta operación.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - billingPlanId
   *               - contractedEmployees
   *             properties:
   *               billingPlanId:
   *                 type: integer
   *               contractedEmployees:
   *                 type: integer
   *                 minimum: 10
   *                 description: Cantidad en bloques de 10; no puede ser menor que la plantilla activa
   *     responses:
   *       '201':
   *         description: Suscripción creada en estado active, sin periodo de prueba
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
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
   *         description: Empresa fuera de alcance, plan no encontrado
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
   *       '409':
   *         description: La empresa ya tiene una suscripción viva
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *       '422':
   *         description: Origen no self-service, cantidad inválida o por debajo del mínimo por plantilla
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   */
  async contractSubscription({ request, response }: HttpContext) {
    try {
      const body = await request.validateUsing(contractTenantSubscriptionValidator)
      const result = await this.service.contractSubscription(
        body.billingPlanId,
        body.contractedEmployees
      )
      return response.status(201).json({ type: 'success', data: result })
    } catch (error) {
      const { status, ...body } = resolveBillingSubscriptionApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/billing/subscription/change-preview:
   *   get:
   *     tags:
   *       - Tenant Billing
   *     summary: Previsualizar cambio de cantidad contratada
   *     description: |
   *       Consulta de solo lectura: calcula clasificación, importes del periodo,
   *       prorrateo (si es aumento) y fecha de efecto (si es reducción) sin
   *       modificar la suscripción. Solo el dueño de la cuenta (`owner`).
   *       Requiere suscripción viva y periodo con días por delante.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *       - in: query
   *         name: employees
   *         required: true
   *         schema:
   *           type: integer
   *           minimum: 1
   *         description: Cantidad pedida (bloques de 10; reglas comerciales en el servicio)
   *     responses:
   *       '200':
   *         description: Previsualización resuelta (increase, decrease o none)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 data:
   *                   type: object
   *       '403':
   *         description: Rol distinto de owner/root/super-administrador
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: solo-el-dueno-de-la-cuenta
   *                 code:
   *                   type: string
   *                   example: PLT.SUB.FORBIDDEN_ROLE
   *       '422':
   *         description: Cantidad inválida, sin suscripción viva, pago atrasado o periodo no prorrateable
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                 code:
   *                   type: string
   *       '429':
   *         description: Límite de consultas de previsualización excedido (billing-preview)
   */
  async previewSubscriptionChange(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      await assertBillingOwner(ctx)
      const qs = await request.validateUsing(previewSubscriptionChangeQueryValidator)

      const businessUnitId = TenantContext.getScope()[0]
      if (!businessUnitId || businessUnitId <= 0) {
        throw new BillingSubscriptionServiceError(
          'No se pudo resolver la empresa activa del tenant',
          BILLING_SUBSCRIPTION_ERROR_CODES.BUSINESS_UNIT_NOT_FOUND,
          500,
          'empresa-no-resuelta',
          'No se pudo determinar la empresa activa para previsualizar el cambio.'
        )
      }

      const result = await this.changeService.previewChange(businessUnitId, qs.employees)
      return response.status(200).json({ type: 'success', data: result })
    } catch (error) {
      const { status, ...body } = resolveBillingSubscriptionApiError(error)
      return response.status(status).json(body)
    }
  }
}
