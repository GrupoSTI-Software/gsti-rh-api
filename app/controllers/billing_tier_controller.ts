import type { HttpContext } from '@adonisjs/core/http'
import BillingCatalogService from '#services/billing_catalog_service'
import { createBillingTierValidator, updateBillingTierValidator } from '#validators/billing_tier'
import { resolveBillingCatalogApiError } from '../helpers/billing_catalog_api_error.js'

/**
 * Controlador de tramos de descuento por volumen de un plan.
 * Editable solo en planes borrador; congelados al publicar.
 * Todos los endpoints requieren middleware `auth` + `platformAdmin`.
 */
export default class BillingTierController {
  private readonly service = new BillingCatalogService()

  /**
   * @swagger
   * /api/platform/billing/plans/{planId}/tiers:
   *   get:
   *     tags:
   *       - Platform Billing
   *     summary: Listar tramos de descuento de un plan
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
   *         description: Lista de tramos activos, ordenados por min_employees asc
   *       '404':
   *         description: Plan no encontrado
   */
  async index({ params, response }: HttpContext) {
    try {
      const tiers = await this.service.listTiers(Number(params.planId))
      return response.status(200).json({ type: 'success', data: tiers })
    } catch (error) {
      const { status, ...body } = resolveBillingCatalogApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/billing/plans/{planId}/tiers:
   *   post:
   *     tags:
   *       - Platform Billing
   *     summary: Agregar tramo de descuento a un plan borrador
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
   *               - billingVolumeTierMinEmployees
   *               - billingVolumeTierDiscountPercent
   *             properties:
   *               billingVolumeTierMinEmployees:
   *                 type: integer
   *                 minimum: 1
   *                 description: Número mínimo de empleados para activar este tramo
   *               billingVolumeTierDiscountPercent:
   *                 type: number
   *                 minimum: 0
   *                 maximum: 100
   *                 description: Porcentaje de descuento aplicado
   *     responses:
   *       '201':
   *         description: Tramo creado
   *       '409':
   *         description: Ya existe un tramo con el mismo min_employees
   *       '422':
   *         description: Plan publicado (tramos congelados) o datos inválidos
   */
  async store({ params, request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(createBillingTierValidator)
      const tier = await this.service.addTier(Number(params.planId), data)
      return response.status(201).json({ type: 'success', data: tier })
    } catch (error) {
      const { status, ...body } = resolveBillingCatalogApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/billing/plans/{planId}/tiers/{tierId}:
   *   patch:
   *     tags:
   *       - Platform Billing
   *     summary: Actualizar descuento de un tramo en un plan borrador
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: planId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: tierId
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
   *               billingVolumeTierDiscountPercent:
   *                 type: number
   *                 minimum: 0
   *                 maximum: 100
   *     responses:
   *       '200':
   *         description: Tramo actualizado
   *       '404':
   *         description: Tramo no encontrado
   *       '422':
   *         description: Plan publicado (tramos congelados) o datos inválidos
   */
  async update({ params, request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(updateBillingTierValidator)
      const tier = await this.service.updateTier(Number(params.planId), Number(params.tierId), data)
      return response.status(200).json({ type: 'success', data: tier })
    } catch (error) {
      const { status, ...body } = resolveBillingCatalogApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/billing/plans/{planId}/tiers/{tierId}:
   *   delete:
   *     tags:
   *       - Platform Billing
   *     summary: Eliminar (soft-delete) un tramo de un plan borrador
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: planId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: tierId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '204':
   *         description: Tramo eliminado
   *       '404':
   *         description: Tramo no encontrado
   *       '422':
   *         description: Plan publicado (tramos congelados)
   */
  async destroy({ params, response }: HttpContext) {
    try {
      await this.service.deleteTier(Number(params.planId), Number(params.tierId))
      return response.status(204).send('')
    } catch (error) {
      const { status, ...body } = resolveBillingCatalogApiError(error)
      return response.status(status).json(body)
    }
  }
}
