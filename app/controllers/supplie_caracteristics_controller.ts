import type { HttpContext } from '@adonisjs/core/http'
import SupplieCaracteristicService from '#services/supplie_caracteristic_service'
import {
  createSupplieCaracteristicValidator,
  updateSupplieCaracteristicValidator,
  supplieCaracteristicFilterValidator
} from '#validators/supplie_caracteristic'
import { StandardResponseFormatter } from '../helpers/standard_response_formatter.js'

export default class SupplieCaracteristicsController {
  /**
   * @swagger
   * /api/supplie-characteristics:
   *   get:
   *     summary: Get all supply characteristics
   *     tags: [Supply Characteristics]
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
   *         name: supplyTypeId
   *         schema:
   *           type: integer
   *         description: Filter by supply type ID
   *       - in: query
   *         name: supplieCaracteristicName
   *         schema:
   *           type: string
   *         description: Filter by characteristic name
   *       - in: query
   *         name: supplieCaracteristicType
   *         schema:
   *           type: string
   *           enum: [text, number, date, boolean, radio, file]
   *         description: Filter by characteristic type
   *     responses:
   *       200:
   *         description: List of supply characteristics
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/SupplieCaracteristic'
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
      const filters = await request.validateUsing(supplieCaracteristicFilterValidator)
      const characteristics = await SupplieCaracteristicService.getAll(filters)

      return StandardResponseFormatter.success(response, characteristics
      , 'Supply Characteristics', 'Supply characteristics retrieved successfully')
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message
      , 400)
    }
  }

  /**
   * @swagger
   * /api/supplie-characteristics/{id}:
   *   get:
   *     summary: Get supply characteristic by ID
   *     tags: [Supply Characteristics]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Supply characteristic ID
   *     responses:
   *       200:
   *         description: Supply characteristic details
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/SupplieCaracteristic'
   *       404:
   *         description: Supply characteristic not found
   */
  async show({ params, response }: HttpContext) {
    try {
      const characteristic = await SupplieCaracteristicService.getById(params.id)
      return StandardResponseFormatter.success(response, characteristic
      , 'Supply Characteristic', 'Supply characteristic retrieved successfully')
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message
      , 404)
    }
  }

  /**
   * @swagger
   * /api/supplie-characteristics:
   *   post:
   *     summary: Create new supply characteristic
   *     tags: [Supply Characteristics]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - supplyTypeId
   *               - supplieCaracteristicName
   *               - supplieCaracteristicType
   *             properties:
   *               supplyTypeId:
   *                 type: integer
   *                 description: Supply type ID
   *               supplieCaracteristicName:
   *                 type: string
   *                 maxLength: 255
   *                 description: Characteristic name
   *               supplieCaracteristicType:
   *                 type: string
   *                 enum: [text, number, date, boolean, radio, file]
   *                 description: Characteristic type
   *     responses:
   *       201:
   *         description: Supply characteristic created successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/SupplieCaracteristic'
   *       400:
   *         description: Validation error
   */
  async store({ request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(createSupplieCaracteristicValidator)
      const characteristic = await SupplieCaracteristicService.create(data)

      return StandardResponseFormatter.success(response, characteristic
      , 'Supply Characteristic', 'Supply characteristic created successfully', 201)
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message
      , 400)
    }
  }

  /**
   * @swagger
   * /api/supplie-characteristics/{id}:
   *   put:
   *     summary: Update supply characteristic
   *     tags: [Supply Characteristics]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Supply characteristic ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               supplyTypeId:
   *                 type: integer
   *                 description: Supply type ID
   *               supplieCaracteristicName:
   *                 type: string
   *                 maxLength: 255
   *                 description: Characteristic name
   *               supplieCaracteristicType:
   *                 type: string
   *                 enum: [text, number, date, boolean, radio, file]
   *                 description: Characteristic type
   *     responses:
   *       200:
   *         description: Supply characteristic updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/SupplieCaracteristic'
   *       400:
   *         description: Validation error
   *       404:
   *         description: Supply characteristic not found
   */
  async update({ params, request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(updateSupplieCaracteristicValidator)
      const characteristic = await SupplieCaracteristicService.update(params.id, data)

      return StandardResponseFormatter.success(response, characteristic
      , 'Supply Characteristic', 'Supply characteristic updated successfully')
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message
      , 400)
    }
  }

  /**
   * @swagger
   * /api/supplie-characteristics/{id}:
   *   delete:
   *     summary: Delete supply characteristic
   *     tags: [Supply Characteristics]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Supply characteristic ID
   *     responses:
   *       200:
   *         description: Supply characteristic deleted successfully
   *       404:
   *         description: Supply characteristic not found
   */
  async destroy({ params, response }: HttpContext) {
    try {
      await SupplieCaracteristicService.delete(params.id)
      return StandardResponseFormatter.success(response, null
      , 'Supply Characteristic', 'Supply characteristic deleted successfully')
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message
      , 404)
    }
  }

  /**
   * @swagger
   * /api/supplie-characteristics/{id}/values:
   *   get:
   *     summary: Get supply characteristic with its values
   *     tags: [Supply Characteristics]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Supply characteristic ID
   *     responses:
   *       200:
   *         description: Supply characteristic with values
   *       404:
   *         description: Supply characteristic not found
   */
  async getWithValues({ params, response }: HttpContext) {
    try {
      const characteristic = await SupplieCaracteristicService.getWithValues(params.id)
      return StandardResponseFormatter.success(response, characteristic
      , 'Supply Characteristic', 'Supply characteristic with values retrieved successfully')
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message
      , 404)
    }
  }

  /**
   * @swagger
   * /api/supplie-characteristics/by-supply-type/{supplyTypeId}:
   *   get:
   *     summary: Get characteristics by supply type
   *     tags: [Supply Characteristics]
   *     parameters:
   *       - in: path
   *         name: supplyTypeId
   *         required: true
   *         schema:
   *           type: integer
   *         description: Supply type ID
   *     responses:
   *       200:
   *         description: Characteristics for the supply type
   *       404:
   *         description: Supply type not found
   */
  async getBySupplyType({ params, response }: HttpContext) {
    try {
      const characteristics = await SupplieCaracteristicService.getBySupplyType(params.supplyTypeId)
      return StandardResponseFormatter.success(response, characteristics
      , 'Data', 'Characteristics retrieved successfully')
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message
      , 404)
    }
  }
}
