import type { HttpContext } from '@adonisjs/core/http'
import BillingTenantService from '#services/billing_tenant_service'
import BillingSubscriptionChangeService from '#services/billing_subscription_change_service'
import BillingInternalNotificationService from '#services/billing_internal_notification_service'
import { BILLING_SUBSCRIPTION_ERROR_CODES } from '../constants/billing_subscription_error_codes.js'
import { BillingSubscriptionServiceError } from '../exceptions/billing_subscription_service_error.js'
import { assertBillingOwner } from '../helpers/billing_owner_guard.js'
import { resolveBillingSubscriptionApiError } from '../helpers/billing_subscription_api_error.js'
import { TenantContext } from '../utils/tenant_context.js'
import {
  contractTenantSubscriptionValidator,
  previewSubscriptionChangeQueryValidator,
  publicPlanPriceQueryValidator,
  requestSubscriptionIncreaseValidator,
  scheduleSubscriptionDecreaseValidator,
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
  private readonly internalNotification = new BillingInternalNotificationService()

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
   *       contratación en curso. El snapshot incluye el periodo vigente
   *       (`billingSubscriptionCurrentPeriodStart` / `billingSubscriptionCurrentPeriodEnd`);
   *       el fin del periodo es la **fecha del próximo pago**.
   *
   *       `minimumContractedEmployees` es numérico para empresas `self_service`
   *       (con o sin suscripción viva); en empresas `platform` viene `null`.
   *       La pantalla de ajuste de cantidad consume ese mínimo; el muro global de
   *       contratación lo ignora cuando hay suscripción viva.
   *
   *       Cuando hay suscripción viva, el snapshot puede incluir `liveChange`
   *       (USRH1786107870871): el movimiento de cantidad en curso (`pending_payment`
   *       o `scheduled`), o `null` si no hay ninguno.
   *
   *       **Sin gate de rol:** cualquier usuario autenticado con scope sobre la
   *       empresa puede consultarlo (p. ej. el middleware del muro de contratación).
   *       Nunca responde 404 por ausencia de suscripción.
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
   *                   required:
   *                     - businessUnitOrigin
   *                     - subscription
   *                     - minimumContractedEmployees
   *                   properties:
   *                     businessUnitOrigin:
   *                       type: string
   *                       enum: [platform, self_service]
   *                     minimumContractedEmployees:
   *                       type: integer
   *                       nullable: true
   *                       description: |
   *                         Mínimo contratable en bloques de 10 para empresas
   *                         self_service (también con suscripción viva). Null en platform.
   *                     subscription:
   *                       type: object
   *                       nullable: true
   *                       description: Snapshot de la suscripción viva o null
   *                       properties:
   *                         billingSubscriptionId:
   *                           type: integer
   *                         billingPlanId:
   *                           type: integer
   *                         billingPlanName:
   *                           type: string
   *                         billingSubscriptionStatus:
   *                           type: string
   *                           enum: [trialing, active, past_due]
   *                         billingSubscriptionContractedEmployees:
   *                           type: integer
   *                         billingSubscriptionContractedUnitAmount:
   *                           type: number
   *                         billingSubscriptionDiscountPercent:
   *                           type: number
   *                         billingSubscriptionContractedCurrency:
   *                           type: string
   *                         billingSubscriptionContractedTaxRate:
   *                           type: number
   *                         billingSubscriptionContractedSubtotal:
   *                           type: number
   *                         billingSubscriptionContractedTaxAmount:
   *                           type: number
   *                         billingSubscriptionContractedTotal:
   *                           type: number
   *                         billingSubscriptionContractedTrialDays:
   *                           type: integer
   *                         billingSubscriptionTrialEndsAt:
   *                           type: string
   *                           format: date
   *                           nullable: true
   *                         firstPaymentDate:
   *                           type: string
   *                           format: date
   *                           nullable: true
   *                         billingSubscriptionCurrentPeriodStart:
   *                           type: string
   *                           format: date
   *                           nullable: true
   *                           description: Inicio del periodo vigente (fecha calendario ISO)
   *                         billingSubscriptionCurrentPeriodEnd:
   *                           type: string
   *                           format: date
   *                           nullable: true
   *                           description: Fin del periodo vigente = fecha del próximo pago
   *                         liveChange:
   *                           type: object
   *                           nullable: true
   *                           description: |
   *                             Cambio de cantidad en curso (aumento pendiente de pago o
   *                             reducción agendada). Null cuando no hay movimiento vivo.
   *                           properties:
   *                             billingSubscriptionChangeId:
   *                               type: integer
   *                             type:
   *                               type: string
   *                               enum: [increase, decrease]
   *                             status:
   *                               type: string
   *                               enum: [pending_payment, scheduled]
   *                             previousEmployees:
   *                               type: integer
   *                             newEmployees:
   *                               type: integer
   *                             newAmounts:
   *                               type: object
   *                               properties:
   *                                 subtotal:
   *                                   type: number
   *                                 taxRate:
   *                                   type: number
   *                                 taxAmount:
   *                                   type: number
   *                                 total:
   *                                   type: number
   *                             proration:
   *                               type: object
   *                               nullable: true
   *                               description: Adeudo prorrateado; null en reducción agendada
   *                               properties:
   *                                 amountCents:
   *                                   type: integer
   *                                 amountPesos:
   *                                   type: number
   *                             effectiveAt:
   *                               type: string
   *                               format: date
   *                               nullable: true
   *                               description: Fecha de efecto; solo en reducción agendada
   *                             requestedAt:
   *                               type: string
   *                               format: date-time
   *                               description: Momento en que se registró la solicitud
   *       '400':
   *         description: Falta header X-Business-Unit-Id
   *       '401':
   *         description: No autenticado
   *       '404':
   *         description: Empresa fuera de alcance o inexistente
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

  /**
   * @swagger
   * /api/billing/subscription/changes/increase:
   *   post:
   *     tags:
   *       - Tenant Billing
   *     summary: Solicitar aumento de cantidad contratada
   *     description: |
   *       Registra la solicitud de aumento y genera el adeudo prorrateado (suscripción
   *       activa) o aplica de inmediato sin cobro (periodo de prueba). Solo el dueño
   *       de la cuenta (`owner`). Delega el cálculo en la previsualización; no acepta
   *       importes ni identificadores de suscripción en el body.
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
   *               - employees
   *             properties:
   *               employees:
   *                 type: integer
   *                 minimum: 1
   *                 description: Cantidad pedida (bloques de 10; reglas comerciales en el servicio)
   *     responses:
   *       '201':
   *         description: Solicitud registrada (pending_payment o applied en prueba)
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
   *       '409':
   *         description: La suscripción cambió entre el cálculo y el registro
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
   *                   example: cambio-en-conflicto
   *                 code:
   *                   type: string
   *                   example: PLT.SUB.CHANGE_CONFLICT
   *       '422':
   *         description: Cantidad inválida, no es aumento, sin suscripción viva o pago atrasado
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
   *         description: Límite de solicitudes de cambio excedido (billing-change-request)
   */
  async requestSubscriptionIncrease(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      await assertBillingOwner(ctx)
      const body = await request.validateUsing(requestSubscriptionIncreaseValidator)

      const businessUnitId = TenantContext.getScope()[0]
      if (!businessUnitId || businessUnitId <= 0) {
        throw new BillingSubscriptionServiceError(
          'No se pudo resolver la empresa activa del tenant',
          BILLING_SUBSCRIPTION_ERROR_CODES.BUSINESS_UNIT_NOT_FOUND,
          500,
          'empresa-no-resuelta',
          'No se pudo determinar la empresa activa para solicitar el cambio.'
        )
      }

      const result = await this.changeService.requestIncrease(businessUnitId, body.employees)

      this.internalNotification.dispatchSubscriptionChangeRequestedFromSession(
        ctx,
        businessUnitId,
        result.billingSubscriptionChangeId,
        {
          event: 'increase_requested',
          appliedImmediately: result.billingSubscriptionChangeStatus === 'applied',
          resolveSupersededOnIncrease: true,
        }
      )

      return response.status(201).json({ type: 'success', data: result })
    } catch (error) {
      const { status, ...body } = resolveBillingSubscriptionApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/billing/subscription/changes/decrease:
   *   post:
   *     tags:
   *       - Tenant Billing
   *     summary: Agendar reducción de cantidad contratada
   *     description: |
   *       Registra una reducción para que surta efecto al inicio del próximo periodo.
   *       No modifica el cupo ni los importes del periodo en curso; no cobra ni devuelve
   *       dinero. Solo el dueño de la cuenta (`owner`). Si ya existía otra petición viva,
   *       la sustituye. No acepta identificadores de suscripción en el body.
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
   *               - employees
   *             properties:
   *               employees:
   *                 type: integer
   *                 minimum: 1
   *                 description: Cantidad destino (bloques de 10; reglas comerciales en el servicio)
   *     responses:
   *       '201':
   *         description: Reducción agendada (scheduled) para la fecha de corte vigente
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
   *         description: |
   *           Cantidad inválida, no es reducción, sin suscripción viva, pago atrasado
   *           o periodo sin fecha de corte por delante
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
   *         description: Límite de solicitudes de cambio excedido (billing-subscription-change)
   */
  async scheduleSubscriptionDecrease(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      await assertBillingOwner(ctx)
      const body = await request.validateUsing(scheduleSubscriptionDecreaseValidator)

      const businessUnitId = TenantContext.getScope()[0]
      if (!businessUnitId || businessUnitId <= 0) {
        throw new BillingSubscriptionServiceError(
          'No se pudo resolver la empresa activa del tenant',
          BILLING_SUBSCRIPTION_ERROR_CODES.BUSINESS_UNIT_NOT_FOUND,
          500,
          'empresa-no-resuelta',
          'No se pudo determinar la empresa activa para agendar la reducción.'
        )
      }

      const result = await this.changeService.scheduleDecrease(businessUnitId, body.employees)

      this.internalNotification.dispatchSubscriptionChangeRequestedFromSession(
        ctx,
        businessUnitId,
        result.billingSubscriptionChangeId,
        {
          event: 'decrease_scheduled',
          replacedChangeId: result.supersededBillingSubscriptionChangeId,
          appliedImmediately: false,
        }
      )

      return response.status(201).json({ type: 'success', data: result })
    } catch (error) {
      const { status, ...body } = resolveBillingSubscriptionApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/billing/subscription/changes/cancel:
   *   post:
   *     tags:
   *       - Tenant Billing
   *     summary: Cancelar cambio de suscripción agendado
   *     description: |
   *       Cancela la petición de cambio viva (`pending_payment` o `scheduled`) de la
   *       empresa activa. No modifica la suscripción ni devuelve dinero. Solo el dueño
   *       de la cuenta (`owner`). Sin body: cancela siempre el cambio vivo propio.
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
   *         description: Cambio cancelado
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
   *         description: Sin cambio vivo, sin suscripción viva o pago atrasado
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
   *         description: Límite de solicitudes de cambio excedido (billing-subscription-change)
   */
  async cancelSubscriptionChange(ctx: HttpContext) {
    const { response } = ctx
    try {
      await assertBillingOwner(ctx)

      const businessUnitId = TenantContext.getScope()[0]
      if (!businessUnitId || businessUnitId <= 0) {
        throw new BillingSubscriptionServiceError(
          'No se pudo resolver la empresa activa del tenant',
          BILLING_SUBSCRIPTION_ERROR_CODES.BUSINESS_UNIT_NOT_FOUND,
          500,
          'empresa-no-resuelta',
          'No se pudo determinar la empresa activa para cancelar el cambio.'
        )
      }

      const result = await this.changeService.cancelLiveChange(businessUnitId)

      this.internalNotification.dispatchSubscriptionChangeRequestedFromSession(
        ctx,
        businessUnitId,
        result.billingSubscriptionChangeId,
        {
          event: 'change_canceled',
          replacedChangeId: null,
          appliedImmediately: false,
        }
      )

      return response.status(200).json({ type: 'success', data: result })
    } catch (error) {
      const { status, ...body } = resolveBillingSubscriptionApiError(error)
      return response.status(status).json(body)
    }
  }
}
