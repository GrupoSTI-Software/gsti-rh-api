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
   *         description: Precio resuelto
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
