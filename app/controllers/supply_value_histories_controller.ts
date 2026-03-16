import type { HttpContext } from '@adonisjs/core/http'
import SupplyValueHistoryService from '#services/supply_value_history_service'
import {
  createSupplyValueHistoryValidator,
  updateSupplyValueHistoryValidator,
  supplyValueHistoryFilterValidator,
} from '#validators/supply_value_history'
import { StandardResponseFormatter } from '../helpers/standard_response_formatter.js'

export default class SupplyValueHistoriesController {
  /**
   * @swagger
   * /api/supply-value-histories:
   *   get:
   *     summary: Obtiene todos los registros del historial de valores
   *     tags: [Supply Value Histories]
   *     parameters:
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           minimum: 1
   *         description: Número de página
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *         description: Número de elementos por página
   *       - in: query
   *         name: supplyId
   *         schema:
   *           type: integer
   *         description: Filtrar por ID de insumo
   *     responses:
   *       200:
   *         description: Lista de registros del historial de valores
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/SupplyValueHistory'
   *                 meta:
   *                   type: object
   *                   properties:
   *                     current_page:
   *                       type: integer
   *                     per_page:
   *                       type: integer
   *                     total:
   *                       type: integer
   *                     last_page:
   *                       type: integer
   */
  async index({ request, response }: HttpContext) {
    try {
      const filters = await request.validateUsing(supplyValueHistoryFilterValidator)
      const histories = await SupplyValueHistoryService.getAll(filters)

      return StandardResponseFormatter.success(
        response,
        histories,
        'Supply Value Histories',
        'Historial de valores obtenido exitosamente'
      )
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message, 400)
    }
  }

  /**
   * @swagger
   * /api/supply-value-histories/{id}:
   *   get:
   *     summary: Obtiene un registro del historial por ID
   *     tags: [Supply Value Histories]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: ID del registro del historial
   *     responses:
   *       200:
   *         description: Detalle del registro del historial
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/SupplyValueHistory'
   *       404:
   *         description: Registro no encontrado
   */
  async show({ params, response }: HttpContext) {
    try {
      const history = await SupplyValueHistoryService.getById(params.id)
      return StandardResponseFormatter.success(
        response,
        history,
        'Supply Value History',
        'Registro del historial obtenido exitosamente'
      )
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message, 404)
    }
  }

  /**
   * @swagger
   * /api/supply-value-histories:
   *   post:
   *     summary: Crea un nuevo registro en el historial de valores
   *     tags: [Supply Value Histories]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - supplyId
   *               - supplyValueHistoryCost
   *               - supplyValueHistoryCurrentValue
   *             properties:
   *               supplyId:
   *                 type: integer
   *                 description: ID del insumo
   *               supplyValueHistoryCost:
   *                 type: number
   *                 format: decimal
   *                 minimum: 0
   *                 description: Costo del insumo (no permite valores negativos)
   *               supplyValueHistoryCurrentValue:
   *                 type: number
   *                 format: decimal
   *                 minimum: 0
   *                 description: Valor actual del insumo (no permite valores negativos)
   *               supplyValueHistoryNotes:
   *                 type: string
   *                 maxLength: 1000
   *                 description: Notas adicionales sobre el cambio de valor
   *     responses:
   *       201:
   *         description: Registro creado exitosamente
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/SupplyValueHistory'
   *       400:
   *         description: Error de validación
   *       404:
   *         description: Insumo no encontrado
   */
  async store({ request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(createSupplyValueHistoryValidator)
      const history = await SupplyValueHistoryService.create(data)

      return StandardResponseFormatter.success(
        response,
        history,
        'Supply Value History',
        'Registro del historial creado exitosamente',
        201
      )
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message, 400)
    }
  }

  /**
   * @swagger
   * /api/supply-value-histories/{id}:
   *   put:
   *     summary: Actualiza un registro del historial de valores
   *     tags: [Supply Value Histories]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: ID del registro del historial
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               supplyValueHistoryCost:
   *                 type: number
   *                 format: decimal
   *                 minimum: 0
   *                 description: Costo del insumo (no permite valores negativos)
   *               supplyValueHistoryCurrentValue:
   *                 type: number
   *                 format: decimal
   *                 minimum: 0
   *                 description: Valor actual del insumo (no permite valores negativos)
   *               supplyValueHistoryNotes:
   *                 type: string
   *                 maxLength: 1000
   *                 description: Notas adicionales sobre el cambio de valor
   *     responses:
   *       200:
   *         description: Registro actualizado exitosamente
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/SupplyValueHistory'
   *       400:
   *         description: Error de validación
   *       404:
   *         description: Registro no encontrado
   */
  async update({ params, request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(updateSupplyValueHistoryValidator)
      const history = await SupplyValueHistoryService.update(params.id, data)

      return StandardResponseFormatter.success(
        response,
        history,
        'Supply Value History',
        'Registro del historial actualizado exitosamente'
      )
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message, 400)
    }
  }

  /**
   * @swagger
   * /api/supply-value-histories/{id}:
   *   delete:
   *     summary: Elimina un registro del historial de valores
   *     tags: [Supply Value Histories]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: ID del registro del historial
   *     responses:
   *       200:
   *         description: Registro eliminado exitosamente
   *       404:
   *         description: Registro no encontrado
   */
  async destroy({ params, response }: HttpContext) {
    try {
      await SupplyValueHistoryService.delete(params.id)
      return StandardResponseFormatter.success(
        response,
        null,
        'Supply Value History',
        'Registro del historial eliminado exitosamente'
      )
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message, 404)
    }
  }

  /**
   * @swagger
   * /api/supplies/{supplyId}/value-histories:
   *   get:
   *     summary: Obtiene el historial de valores de un insumo específico
   *     tags: [Supply Value Histories]
   *     parameters:
   *       - in: path
   *         name: supplyId
   *         required: true
   *         schema:
   *           type: integer
   *         description: ID del insumo
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           minimum: 1
   *         description: Número de página
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *         description: Número de elementos por página
   *     responses:
   *       200:
   *         description: Historial de valores del insumo (ordenado del más nuevo al más antiguo)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/SupplyValueHistory'
   *       404:
   *         description: Insumo no encontrado
   */
  async getBySupply({ params, request, response }: HttpContext) {
    try {
      const filters = await request.validateUsing(supplyValueHistoryFilterValidator)
      const histories = await SupplyValueHistoryService.getBySupplyId(params.supplyId, filters)

      return StandardResponseFormatter.success(
        response,
        histories,
        'Supply Value Histories',
        'Historial de valores del insumo obtenido exitosamente'
      )
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message, 404)
    }
  }

  /**
   * @swagger
   * /api/supplies/{supplyId}/value-histories/latest:
   *   get:
   *     summary: Obtiene el valor más reciente de un insumo
   *     tags: [Supply Value Histories]
   *     parameters:
   *       - in: path
   *         name: supplyId
   *         required: true
   *         schema:
   *           type: integer
   *         description: ID del insumo
   *     responses:
   *       200:
   *         description: Valor más reciente del insumo
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/SupplyValueHistory'
   *       404:
   *         description: Insumo no encontrado o sin historial de valores
   */
  async getLatestValue({ params, response }: HttpContext) {
    try {
      const latestValue = await SupplyValueHistoryService.getLatestValue(params.supplyId)

      if (!latestValue) {
        return StandardResponseFormatter.success(
          response,
          null,
          'Supply Value History',
          'El insumo no tiene historial de valores registrado'
        )
      }

      return StandardResponseFormatter.success(
        response,
        latestValue,
        'Supply Value History',
        'Valor más reciente del insumo obtenido exitosamente'
      )
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message, 404)
    }
  }
}
