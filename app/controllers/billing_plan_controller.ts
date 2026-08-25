import type { HttpContext } from '@adonisjs/core/http'
import BillingCatalogService from '#services/billing_catalog_service'
import {
  createBillingPlanValidator,
  updateBillingPlanValidator,
  resolvedPriceQueryValidator,
} from '#validators/billing_plan'
import { resolveBillingCatalogApiError } from '../helpers/billing_catalog_api_error.js'

/**
 * Controlador de planes del catálogo de cobro.
 * Todos los endpoints requieren middleware `auth` + `platformAdmin`.
 */
export default class BillingPlanController {
  private readonly service = new BillingCatalogService()

  /**
   * @swagger
   * /api/platform/billing/plans:
   *   get:
   *     tags:
   *       - Platform Billing
   *     summary: Listar planes del catálogo
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       '200':
   *         description: Lista de planes activos
   */
  async index({ response }: HttpContext) {
    try {
      const plans = await this.service.listPlans()
      return response.status(200).json({ type: 'success', data: plans })
    } catch (error) {
      const { status, ...body } = resolveBillingCatalogApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/billing/plans/{planId}:
   *   get:
   *     tags:
   *       - Platform Billing
   *     summary: Obtener detalle de un plan (con precios y tramos)
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
   *         description: Detalle del plan
   *       '404':
   *         description: Plan no encontrado
   */
  async show({ params, response }: HttpContext) {
    try {
      const plan = await this.service.getPlan(Number(params.planId))
      return response.status(200).json({ type: 'success', data: plan })
    } catch (error) {
      const { status, ...body } = resolveBillingCatalogApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/billing/plans:
   *   post:
   *     tags:
   *       - Platform Billing
   *     summary: Crear nuevo plan (borrador)
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - billingPlanName
   *             properties:
   *               billingPlanName:
   *                 type: string
   *                 maxLength: 120
   *               billingPlanDescription:
   *                 type: string
   *                 nullable: true
   *               billingPlanProvider:
   *                 type: string
   *                 default: manual
   *               billingPlanStripeProductId:
   *                 type: string
   *                 nullable: true
   *     responses:
   *       '201':
   *         description: Plan creado en estado borrador
   *       '422':
   *         description: Datos inválidos
   */
  async store({ request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(createBillingPlanValidator)
      const plan = await this.service.createPlan(data)
      return response.status(201).json({ type: 'success', data: plan })
    } catch (error) {
      const { status, ...body } = resolveBillingCatalogApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/billing/plans/{planId}:
   *   patch:
   *     tags:
   *       - Platform Billing
   *     summary: Actualizar metadatos de un plan
   *     description: >
   *       El nombre del plan (billingPlanName) solo se puede editar mientras
   *       el plan está en borrador. Con el plan publicado el cambio de
   *       nombre se rechaza con 422 PLT.CAT.PLAN_NAME_IMMUTABLE — para
   *       cambiar el nombre de una oferta publicada, clónala. El estado de
   *       venta (billingPlanActive) no se edita por esta vía: usa
   *       `/publish` y `/deactivate`. Un intento de reactivar (0 → 1) un
   *       plan retirado se rechaza con 422 PLT.CAT.PLAN_REACTIVATION_FORBIDDEN;
   *       cualquier otro valor enviado en ese campo se ignora.
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
   *             properties:
   *               billingPlanName:
   *                 type: string
   *               billingPlanDescription:
   *                 type: string
   *                 nullable: true
   *               billingPlanStripeProductId:
   *                 type: string
   *                 nullable: true
   *               billingPlanActive:
   *                 type: integer
   *                 enum: [0, 1]
   *     responses:
   *       '200':
   *         description: Plan actualizado
   *       '404':
   *         description: Plan no encontrado
   *       '422':
   *         description: >
   *           Nombre inmutable (plan publicado, PLT.CAT.PLAN_NAME_IMMUTABLE) o
   *           intento de reactivar el plan (PLT.CAT.PLAN_REACTIVATION_FORBIDDEN)
   */
  async update({ params, request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(updateBillingPlanValidator)
      const plan = await this.service.updatePlan(Number(params.planId), data)
      return response.status(200).json({ type: 'success', data: plan })
    } catch (error) {
      const { status, ...body } = resolveBillingCatalogApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/billing/plans/{planId}:
   *   delete:
   *     tags:
   *       - Platform Billing
   *     summary: Eliminar (soft-delete) un plan
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: planId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '204':
   *         description: Plan eliminado
   *       '404':
   *         description: Plan no encontrado
   */
  async destroy({ params, response }: HttpContext) {
    try {
      await this.service.deletePlan(Number(params.planId))
      return response.status(204).send('')
    } catch (error) {
      const { status, ...body } = resolveBillingCatalogApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/billing/plans/{planId}/publish:
   *   post:
   *     tags:
   *       - Platform Billing
   *     summary: Publicar un plan borrador (irreversible)
   *     description: |
   *       Publica el plan y congela sus tramos. Requiere al menos un precio vigente y
   *       al menos un tramo configurado.
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
   *         description: Plan publicado
   *       '409':
   *         description: El plan ya está publicado
   *       '422':
   *         description: No cumple los requisitos para publicar
   */
  async publish({ params, response }: HttpContext) {
    try {
      const plan = await this.service.publishPlan(Number(params.planId))
      return response.status(200).json({ type: 'success', data: plan })
    } catch (error) {
      const { status, ...body } = resolveBillingCatalogApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/billing/plans/{planId}/deactivate:
   *   post:
   *     tags:
   *       - Platform Billing
   *     summary: Retirar del catálogo un plan publicado y vigente
   *     description: >
   *       Retiro manual e irreversible: el plan deja de poder contratarse o de
   *       ser destino de un cambio de plan, pero las suscripciones que ya lo
   *       tienen contratado no se modifican (su trato congelado permanece
   *       intacto). No existe reactivación — para volver a ofrecer esa oferta
   *       hay que clonarla y publicar la copia.
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
   *         description: Plan retirado (billingPlanActive = 0)
   *       '404':
   *         description: Plan no encontrado
   *       '422':
   *         description: >
   *           El plan no está publicado (PLT.CAT.PLAN_DEACTIVATE_REQUIRES_PUBLISHED)
   *           o ya está desactivado (PLT.CAT.PLAN_ALREADY_DEACTIVATED)
   */
  async deactivate({ params, response }: HttpContext) {
    try {
      const plan = await this.service.deactivatePlan(Number(params.planId))
      return response.status(200).json({ type: 'success', data: plan })
    } catch (error) {
      const { status, ...body } = resolveBillingCatalogApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/billing/plans/{planId}/mark-public:
   *   post:
   *     tags:
   *       - Platform Billing
   *     summary: Señalar un plan como el público de la landing
   *     description: |
   *       Marca el plan indicado como el plan que se publica en la landing comercial.
   *       Si otro plan estaba marcado, se le quita la señal en el mismo acto atómico.
   *       Solo se puede señalar un plan vendible: publicado, vigente y con precio activo.
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
   *         description: Plan señalado como público (billingPlanIsPublic = 1)
   *       '404':
   *         description: Plan no encontrado
   *       '422':
   *         description: >
   *           El plan no es vendible (PLT.CAT.PLAN_PUBLIC_REQUIRES_SELLABLE)
   *           o ya es el plan público (PLT.CAT.PLAN_ALREADY_PUBLIC)
   *       '409':
   *         description: >
   *           Carrera detectada — el plan público cambió mientras se procesaba
   *           la solicitud (PLT.CAT.PUBLIC_PLAN_CONFLICT)
   */
  async markPublic({ params, response }: HttpContext) {
    try {
      const plan = await this.service.markPlanAsPublic(Number(params.planId))
      return response.status(200).json({ type: 'success', data: plan })
    } catch (error) {
      const { status, ...body } = resolveBillingCatalogApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/billing/plans/{planId}/unmark-public:
   *   post:
   *     tags:
   *       - Platform Billing
   *     summary: Quitar la señal de plan público de la landing
   *     description: |
   *       Elimina la marca de plan público del plan indicado. El catálogo queda
   *       sin plan público; el sistema no promueve otro automáticamente.
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
   *         description: Señal eliminada (billingPlanIsPublic = 0)
   *       '404':
   *         description: Plan no encontrado
   *       '422':
   *         description: El plan no es el plan público (PLT.CAT.PLAN_NOT_PUBLIC)
   */
  async unmarkPublic({ params, response }: HttpContext) {
    try {
      const plan = await this.service.unmarkPlanAsPublic(Number(params.planId))
      return response.status(200).json({ type: 'success', data: plan })
    } catch (error) {
      const { status, ...body } = resolveBillingCatalogApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/billing/plans/{planId}/clone:
   *   post:
   *     tags:
   *       - Platform Billing
   *     summary: Clonar un plan como nuevo borrador
   *     description: |
   *       Crea una copia del plan con nombre "(copia)". El nuevo plan nace en estado
   *       borrador con los mismos precios y tramos, sin stripe IDs.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: planId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '201':
   *         description: Nuevo plan borrador clonado
   *       '404':
   *         description: Plan origen no encontrado
   */
  async clone({ params, response }: HttpContext) {
    try {
      const plan = await this.service.clonePlan(Number(params.planId))
      return response.status(201).json({ type: 'success', data: plan })
    } catch (error) {
      const { status, ...body } = resolveBillingCatalogApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/billing/plans/{planId}/resolved-price:
   *   get:
   *     tags:
   *       - Platform Billing
   *     summary: Calcular precio resuelto para N empleados
   *     description: |
   *       Devuelve el desglose determinista: precio base, descuento por volumen,
   *       subtotal, IVA y total para un número dado de empleados.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: planId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: query
   *         name: employeeCount
   *         required: true
   *         schema:
   *           type: integer
   *           minimum: 1
   *       - in: query
   *         name: referenceDate
   *         required: false
   *         schema:
   *           type: string
   *           format: date
   *           description: Fecha de referencia YYYY-MM-DD (default = hoy)
   *     responses:
   *       '200':
   *         description: Precio resuelto (incluye `trialDays` del precio vigente, para previsualizar el alta de suscripción)
   *       '404':
   *         description: Plan sin precio vigente para la fecha dada
   */
  async resolvedPrice({ params, request, response }: HttpContext) {
    try {
      const qs = await request.validateUsing(resolvedPriceQueryValidator)
      const result = await this.service.resolvePrice(
        Number(params.planId),
        qs.employeeCount,
        qs.referenceDate
      )
      return response.status(200).json({ type: 'success', data: result })
    } catch (error) {
      const { status, ...body } = resolveBillingCatalogApiError(error)
      return response.status(status).json(body)
    }
  }
}
