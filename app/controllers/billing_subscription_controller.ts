import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import BillingSubscriptionService from '#services/billing_subscription_service'
import {
  createBillingSubscriptionValidator,
  changePlanValidator,
  cancelSubscriptionValidator,
  listBillingSubscriptionsValidator,
} from '#validators/billing_subscription'
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
   *       canónico de empleados activos + mínimo contratable) para elegir la
   *       empresa en el drawer de alta. `activeEmployees` no cuenta empleados
   *       dados de baja. `minimumContractedEmployees` es el valor con el que
   *       el drawer debe prellenar la cantidad: la plantilla activa
   *       redondeada al siguiente bloque de 10 (mínimo 10). Nunca expone el
   *       identificador interno de la empresa.
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
   *     summary: Listar suscripciones registradas, con filtros y paginación server-side
   *     description: |
   *       Todos los parámetros de query son opcionales y se combinan con AND.
   *       Sin ningún criterio, se comporta igual que antes: todas las
   *       suscripciones vivas, en orden `billing_subscription_id asc`. El
   *       filtrado se resuelve por completo en el servidor; ningún criterio
   *       relaja `whereNull(billing_subscription_deleted_at)` ni amplía la
   *       visibilidad — las eliminadas lógicamente siguen fuera y las
   *       canceladas siguen dentro. Un criterio inválido o un rango invertido
   *       (`minEmployees > maxEmployees`, `minTotal > maxTotal`,
   *       `trialEndsFrom > trialEndsTo`) se rechaza con
   *       `422 PLT.SUB.VAL_INPUT`; nunca se ignora en silencio.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: search
   *         schema:
   *           type: string
   *         description: Texto parcial contra el nombre de la empresa (sin distinguir mayúsculas)
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [trialing, active, past_due, canceled]
   *       - in: query
   *         name: billingPlanId
   *         schema:
   *           type: integer
   *       - in: query
   *         name: minEmployees
   *         schema:
   *           type: integer
   *           minimum: 0
   *       - in: query
   *         name: maxEmployees
   *         schema:
   *           type: integer
   *           minimum: 0
   *       - in: query
   *         name: minTotal
   *         schema:
   *           type: number
   *           minimum: 0
   *       - in: query
   *         name: maxTotal
   *         schema:
   *           type: number
   *           minimum: 0
   *       - in: query
   *         name: trialEndsFrom
   *         schema:
   *           type: string
   *           format: date
   *         description: Día civil en zona de negocio, límite inferior inclusive
   *       - in: query
   *         name: trialEndsTo
   *         schema:
   *           type: string
   *           format: date
   *         description: Día civil en zona de negocio, límite superior inclusive
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           default: 1
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 20
   *           maximum: 100
   *     responses:
   *       '200':
   *         description: Lista de suscripciones con empresa y plan precargados, más `meta` de paginación
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 data:
   *                   type: array
   *                   items:
   *                     type: object
   *                 meta:
   *                   type: object
   *                   properties:
   *                     total:
   *                       type: integer
   *                     page:
   *                       type: integer
   *                     limit:
   *                       type: integer
   *                     lastPage:
   *                       type: integer
   *       '422':
   *         description: Criterio inválido o rango invertido
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 code:
   *                   type: string
   *                   example: PLT.SUB.VAL_INPUT
   */
  async index({ request, response }: HttpContext) {
    try {
      const filters = await request.validateUsing(listBillingSubscriptionsValidator)
      const {
        search,
        status,
        billingPlanId,
        minEmployees,
        maxEmployees,
        minTotal,
        maxTotal,
        trialEndsFrom,
        trialEndsTo,
        page,
        limit,
      } = filters
      const result = await this.service.listSubscriptions({
        search,
        status,
        billingPlanId,
        minEmployees,
        maxEmployees,
        minTotal,
        maxTotal,
        trialEndsFrom: trialEndsFrom ? DateTime.fromJSDate(trialEndsFrom).toISODate()! : undefined,
        trialEndsTo: trialEndsTo ? DateTime.fromJSDate(trialEndsTo).toISODate()! : undefined,
        page,
        limit,
      })
      return response.status(200).json({ type: 'success', ...result })
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
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 data:
   *                   type: object
   *                   description: Serialización natural del modelo `BillingSubscription`, más `pendingIncreaseChange`.
   *                   properties:
   *                     pendingIncreaseChange:
   *                       type: object
   *                       nullable: true
   *                       description: >
   *                         Cambio de aumento en `pending_payment` sobre esta suscripción
   *                         (USRH1785962095095 v2). `null` cuando no hay adeudo vivo.
   *                         El drawer de registro de pago debe avisarlo en una línea sin
   *                         calcular cifras propias ni modificar el monto propuesto.
   *                       properties:
   *                         billingSubscriptionChangeId:
   *                           type: integer
   *                         billingSubscriptionId:
   *                           type: integer
   *                         billingSubscriptionChangeType:
   *                           type: string
   *                           example: increase
   *                         billingSubscriptionChangeStatus:
   *                           type: string
   *                           example: pending_payment
   *                         billingSubscriptionChangePreviousEmployees:
   *                           type: integer
   *                         billingSubscriptionChangeNewEmployees:
   *                           type: integer
   *                         billingSubscriptionChangeProratedAmountCents:
   *                           type: integer
   *                           description: Monto (en centavos) del adeudo pendiente por este cambio.
   *                         billingSubscriptionChangeEffectiveAt:
   *                           type: string
   *                           nullable: true
   *                         billingSubscriptionChangeAppliedAt:
   *                           type: string
   *                           nullable: true
   *       '404':
   *         description: Suscripción no encontrada
   */
  async show({ params, response }: HttpContext) {
    try {
      const subscription = await this.service.getSubscriptionDetail(Number(params.subscriptionId))
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
   *     description: >
   *       Congela el precio por empleado, el descuento por volumen y los días de
   *       prueba vigentes en el catálogo al momento de contratar, con
   *       `provider = manual`. Nace en estado `trialing` — salvo que la empresa
   *       ya haya gozado periodo de prueba en alguna contratación anterior
   *       (cualquier estado, incluida cancelada), en cuyo caso nace `active`
   *       sin prueba (0 días, sin fecha de fin, cobro desde hoy). La prueba
   *       gratuita es una sola vez por empresa, no por plan.
   *       `contractedEmployees` es opcional: si se omite, se usa el mínimo
   *       contratable (plantilla activa redondeada al bloque de 10). Si se
   *       envía, debe ser múltiplo de 10 (mínimo 10) y no menor que ese mismo
   *       mínimo; de lo contrario responde 422 con el código correspondiente.
   *       En ningún momento se captura o expone un dato de tarjeta ni el
   *       identificador interno de la empresa.
   *       Si la empresa ya tiene una contratación viva (trialing/active/past_due),
   *       por defecto rechaza con 409. Con `replaceLiveSubscription: true`, cancela
   *       la viva y crea la nueva dentro de la misma transacción, en un solo acto
   *       indivisible —con las mismas reglas de cantidad y prueba—: la empresa
   *       nunca queda sin contratación ni con dos al mismo tiempo. La suscripción
   *       reemplazada no se borra: queda `canceled`, consultable con su trato,
   *       sus fechas y sus pagos.
   *       `discountCode` es opcional (USRH1787714804401): si viene, el código debe
   *       ser canjeable hoy (misma regla que `GET .../discount-codes/:text/quote`);
   *       el precio con el descuento se congela en `contracted_*`, las condiciones
   *       del código y los totales sin código quedan congelados en columnas propias,
   *       y el cupo del código se consume en uno, todo en la misma transacción del
   *       alta. Si el descuento deja el subtotal en cero o menos, el alta se
   *       rechaza con `PLT.DSC.SUBTOTAL_ZERO` y el cupo no se consume. Sin
   *       `discountCode`, el alta es idéntica a la de antes de esta historia.
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
   *                 minimum: 10
   *                 multipleOf: 10
   *                 description: >
   *                   Opcional; si se omite, se usa el mínimo contratable
   *                   (plantilla activa redondeada al bloque de 10). Debe ser
   *                   múltiplo de 10 y no menor que ese mínimo.
   *               replaceLiveSubscription:
   *                 type: boolean
   *                 default: false
   *                 description: >
   *                   Opcional. Si la empresa ya tiene contratación viva y se envía
   *                   `true`, se cancela la actual y se crea la nueva en un solo
   *                   acto transaccional. Sin este campo (o en `false`), el
   *                   comportamiento es idéntico al de hoy (rechazo 409).
   *               discountCode:
   *                 type: string
   *                 minLength: 3
   *                 maxLength: 40
   *                 description: >
   *                   Opcional (USRH1787714804401). Texto del código de descuento
   *                   a canjear; no distingue mayúsculas/minúsculas.
   *     responses:
   *       '201':
   *         description: Suscripción creada en trialing, o active sin prueba si la empresa ya la gozó antes (la anterior queda canceled si hubo reemplazo)
   *       '404':
   *         description: Empresa o plan no encontrado, o el código de descuento no existe en el catálogo (PLT.DSC.NOT_FOUND)
   *       '409':
   *         description: La empresa ya tiene una suscripción viva y no se envió replaceLiveSubscription
   *       '422':
   *         description: >
   *           El plan no está publicado, la empresa está inactiva, no hay precio
   *           vigente, los datos son inválidos, la cantidad no es múltiplo de 10
   *           (PLT.SUB.EMPLOYEES_NOT_BLOCK_OF_TEN), rebasa el tope defensivo
   *           (PLT.SUB.EMPLOYEES_ABOVE_SAFETY_CAP) o es menor que el mínimo por
   *           plantilla activa (PLT.SUB.EMPLOYEES_BELOW_ACTIVE_HEADCOUNT, con
   *           `data: { active, minimum }`). Con `discountCode`, además puede
   *           rechazar por que el código está inactivo (PLT.DSC.CODE_INACTIVE),
   *           aún no vigente (PLT.DSC.CODE_NOT_YET_VALID), vencido
   *           (PLT.DSC.CODE_EXPIRED), agotó su cupo de canjes
   *           (PLT.DSC.CODE_EXHAUSTED), o el descuento deja el subtotal del
   *           periodo en cero o menos (PLT.DSC.SUBTOTAL_ZERO)
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

  /**
   * @changePlan
   * @summary Cambiar plan de suscripción
   * @description Actualiza el plan contratado de una suscripción viva (trialing/active/past_due),
   *   recongelando el snapshot de precios desde el catálogo vigente. Antes de
   *   recongelar valida que la cantidad contratada vigente siga cumpliendo
   *   bloques de 10 y el mínimo por la plantilla activa actual; si la
   *   plantilla creció desde que se contrató, rechaza con 422 y no cambia
   *   nada. Las suscripciones canceladas rechazan esta operación.
   * @tag Billing · Subscriptions
   * @operationId changePlan
   * @security [{"bearerAuth": []}]
   * @paramPath id - ID interno de la suscripción - integer
   * @requestBody {"required": true, "content": {"application/json": {"schema": {"type": "object", "required": ["billingPlanId"], "properties": {"billingPlanId": {"type": "integer"}}}}}}
   * @responseBody 200 - {"type": "success", "data": {}}
   * @responseBody 404 - {"title": "string", "detail": "string", "key": "string", "code": "PLT.SUB.NOT_FOUND|PLT.SUB.PLAN_NOT_FOUND"}
   * @responseBody 422 - {"title": "string", "detail": "string", "key": "string", "code": "PLT.SUB.SUBSCRIPTION_CANCELED|PLT.SUB.PLAN_NOT_PUBLISHED|PLT.SUB.NO_ACTIVE_PRICE|PLT.SUB.VAL_INPUT|PLT.SUB.EMPLOYEES_NOT_BLOCK_OF_TEN|PLT.SUB.EMPLOYEES_ABOVE_SAFETY_CAP|PLT.SUB.EMPLOYEES_BELOW_ACTIVE_HEADCOUNT"}
   */
  async changePlan({ params, request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(changePlanValidator)
      const subscription = await this.service.changePlan(
        Number(params.id),
        data.billingPlanId
      )
      return response.status(200).json({ type: 'success', data: subscription })
    } catch (error) {
      const { status, ...body } = resolveBillingSubscriptionApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @cancel
   * @summary Cancelar suscripción
   * @description Cambia el estado de la suscripción a 'canceled', registra la
   *   fecha de cancelación y libera el bloqueo de unicidad por empresa.
   *   Operación idempotente: si ya está cancelada devuelve 422.
   * @tag Billing · Subscriptions
   * @operationId cancelSubscription
   * @security [{"bearerAuth": []}]
   * @paramPath id - ID interno de la suscripción - integer
   * @responseBody 200 - {"type": "success", "data": {}}
   * @responseBody 404 - {"title": "string", "detail": "string", "key": "string", "code": "PLT.SUB.NOT_FOUND"}
   * @responseBody 422 - {"title": "string", "detail": "string", "key": "string", "code": "PLT.SUB.SUBSCRIPTION_CANCELED"}
   */
  async cancel({ params, request, response }: HttpContext) {
    try {
      await request.validateUsing(cancelSubscriptionValidator)
      const subscription = await this.service.cancel(Number(params.id))
      return response.status(200).json({ type: 'success', data: subscription })
    } catch (error) {
      const { status, ...body } = resolveBillingSubscriptionApiError(error)
      return response.status(status).json(body)
    }
  }
}
