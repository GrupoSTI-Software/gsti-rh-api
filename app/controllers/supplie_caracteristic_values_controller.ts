import type { HttpContext } from '@adonisjs/core/http'
import SupplieCaracteristicValueService from '#services/supplie_caracteristic_value_service'
import {
  createSupplieCaracteristicValueValidator,
  updateSupplieCaracteristicValueValidator,
  supplieCaracteristicValueFilterValidator
} from '#validators/supplie_caracteristic_value'
import { StandardResponseFormatter } from '../helpers/standard_response_formatter.js'

export default class SupplieCaracteristicValuesController {
  /**
   * @swagger
   * /api/supplie-characteristic-values:
   *   get:
   *     summary: Get all supply characteristic values
   *     tags: [Supply Characteristic Values]
   *     parameters:
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           minimum: 1
   *         description: Page number
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *         description: Number of items per page
   *       - in: query
   *         name: search
   *         schema:
   *           type: string
   *         description: Search term
   *       - in: query
   *         name: supplieCaracteristicId
   *         schema:
   *           type: integer
   *         description: Filter by characteristic ID
   *       - in: query
   *         name: supplieId
   *         schema:
   *           type: integer
   *         description: Filter by supply ID
   *       - in: query
   *         name: supplieCaracteristicValueValue
   *         schema:
   *           type: string
   *         description: Filter by value
   *     responses:
   *       200:
   *         description: List of supply characteristic values
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/SupplieCaracteristicValue'
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
      const filters = await request.validateUsing(supplieCaracteristicValueFilterValidator)
      const values = await SupplieCaracteristicValueService.getAll(filters)

      return StandardResponseFormatter.success(response, values
      , 'Supply Characteristic', 'Supply characteristic values retrieved successfully')
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message
      , 400)
    }
  }

  /**
   * @swagger
   * /api/supplie-characteristic-values/{id}:
   *   get:
   *     summary: Get supply characteristic value by ID
   *     tags: [Supply Characteristic Values]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Supply characteristic value ID
   *     responses:
   *       200:
   *         description: Supply characteristic value details
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/SupplieCaracteristicValue'
   *       404:
   *         description: Supply characteristic value not found
   */
  async show({ params, response }: HttpContext) {
    try {
      const value = await SupplieCaracteristicValueService.getById(params.id)
      return StandardResponseFormatter.success(response, value
      , 'Supply Characteristic', 'Supply characteristic value retrieved successfully')
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message
      , 404)
    }
  }

  /**
   * @swagger
   * /api/supplie-characteristic-values:
   *   post:
   *     summary: Create new supply characteristic value
   *     tags: [Supply Characteristic Values]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - supplieCaracteristicId
   *               - supplieId
   *               - supplieCaracteristicValueValue
   *             properties:
   *               supplieCaracteristicId:
   *                 type: integer
   *                 description: Supply characteristic ID
   *               supplieId:
   *                 type: integer
   *                 description: Supply ID
   *               supplieCaracteristicValueValue:
   *                 oneOf:
   *                   - type: string
   *                   - type: number
   *                   - type: boolean
   *                   - type: null
   *                 description: Characteristic value
   *     responses:
   *       201:
   *         description: Supply characteristic value created successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/SupplieCaracteristicValue'
   *       400:
   *         description: Validation error
   */
  async store({ request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(createSupplieCaracteristicValueValidator)
      const value = await SupplieCaracteristicValueService.create(data)

      return StandardResponseFormatter.success(response, value
      , 'Supply Characteristic', 'Supply characteristic value created successfully', 201)
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message
      , 400)
    }
  }

  /**
   * @swagger
   * /api/supplie-characteristic-values/{id}:
   *   put:
   *     summary: Update supply characteristic value
   *     tags: [Supply Characteristic Values]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Supply characteristic value ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               supplieCaracteristicId:
   *                 type: integer
   *                 description: Supply characteristic ID
   *               supplieId:
   *                 type: integer
   *                 description: Supply ID
   *               supplieCaracteristicValueValue:
   *                 oneOf:
   *                   - type: string
   *                   - type: number
   *                   - type: boolean
   *                   - type: null
   *                 description: Characteristic value
   *     responses:
   *       200:
   *         description: Supply characteristic value updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/SupplieCaracteristicValue'
   *       400:
   *         description: Validation error
   *       404:
   *         description: Supply characteristic value not found
   */
  async update({ params, request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(updateSupplieCaracteristicValueValidator)
      const value = await SupplieCaracteristicValueService.update(params.id, data)

      return StandardResponseFormatter.success(response, value
      , 'Supply Characteristic', 'Supply characteristic value updated successfully')
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message
      , 400)
    }
  }

  /**
   * @swagger
   * /api/supplie-characteristic-values/{id}:
   *   delete:
   *     summary: Delete supply characteristic value
   *     tags: [Supply Characteristic Values]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Supply characteristic value ID
   *     responses:
   *       200:
   *         description: Supply characteristic value deleted successfully
   *       404:
   *         description: Supply characteristic value not found
   */
  async destroy({ params, response }: HttpContext) {
    try {
      await SupplieCaracteristicValueService.delete(params.id)
      return StandardResponseFormatter.success(response, null
      , 'Supply Characteristic', 'Supply characteristic value deleted successfully')
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message
      , 404)
    }
  }

  /**
   * @swagger
   * /api/supplie-characteristic-values/{id}/characteristic:
   *   get:
   *     summary: Get supply characteristic value with its characteristic
   *     tags: [Supply Characteristic Values]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Supply characteristic value ID
   *     responses:
   *       200:
   *         description: Supply characteristic value with characteristic
   *       404:
   *         description: Supply characteristic value not found
   */
  async getWithCharacteristic({ params, response }: HttpContext) {
    try {
      const value = await SupplieCaracteristicValueService.getWithCharacteristic(params.id)
      return StandardResponseFormatter.success(response, value
      , 'Supply Characteristic', 'Supply characteristic value with characteristic retrieved successfully')
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message
      , 404)
    }
  }

  /**
   * @swagger
   * /api/supplie-characteristic-values/by-characteristic/{supplieCaracteristicId}:
   *   get:
   *     summary: Get values by characteristic
   *     tags: [Supply Characteristic Values]
   *     parameters:
   *       - in: path
   *         name: supplieCaracteristicId
   *         required: true
   *         schema:
   *           type: integer
   *         description: Supply characteristic ID
   *     responses:
   *       200:
   *         description: Values for the characteristic
   *       404:
   *         description: Supply characteristic not found
   */
  async getByCharacteristic({ params, response }: HttpContext) {
    try {
      const values = await SupplieCaracteristicValueService.getByCharacteristic(params.supplieCaracteristicId)
      return StandardResponseFormatter.success(response, values
      , 'Data', 'Values retrieved successfully')
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message
      , 404)
    }
  }

  /**
   * @swagger
   * /api/supplie-characteristic-values/by-supply/{supplieId}:
   *   get:
   *     summary: Get values by supply
   *     tags: [Supply Characteristic Values]
   *     parameters:
   *       - in: path
   *         name: supplieId
   *         required: true
   *         schema:
   *           type: integer
   *         description: Supply ID
   *     responses:
   *       200:
   *         description: Values for the supply
   *       404:
   *         description: Supply not found
   */
  async getBySupply({ params, response }: HttpContext) {
    try {
      const values = await SupplieCaracteristicValueService.getBySupply(params.supplieId)
      return StandardResponseFormatter.success(response, values
      , 'Data', 'Values retrieved successfully')
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message
      , 404)
    }
  }
}
