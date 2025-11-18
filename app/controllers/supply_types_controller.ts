import type { HttpContext } from '@adonisjs/core/http'
import SupplyTypeService from '#services/supply_type_service'
import {
  createSupplyTypeValidator,
  updateSupplyTypeValidator,
  supplyTypeFilterValidator
} from '#validators/supply_type'
import { StandardResponseFormatter } from '../helpers/standard_response_formatter.js'

export default class SupplyTypesController {
  /**
   * @swagger
   * /api/supply-types:
   *   get:
   *     summary: Get all supply types
   *     tags: [Supply Types]
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
   *         name: supplyTypeName
   *         schema:
   *           type: string
   *         description: Filter by supply type name
   *       - in: query
   *         name: supplyTypeSlug
   *         schema:
   *           type: string
   *         description: Filter by supply type slug
   *     responses:
   *       200:
   *         description: List of supply types
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/SupplyType'
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
      const filters = await request.validateUsing(supplyTypeFilterValidator)
      const supplyTypes = await SupplyTypeService.getAll(filters)

      return StandardResponseFormatter.success(response, supplyTypes, 'Supply Types', 'Supply types retrieved successfully')
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message, 400)
    }
  }

  /**
   * @swagger
   * /api/supply-types/{id}:
   *   get:
   *     summary: Get supply type by ID
   *     tags: [Supply Types]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Supply type ID
   *     responses:
   *       200:
   *         description: Supply type details
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/SupplyType'
   *       404:
   *         description: Supply type not found
   */
  async show({ params, response }: HttpContext) {
    try {
      const supplyType = await SupplyTypeService.getById(params.id)
      return StandardResponseFormatter.success(response, supplyType, 'Supply Type', 'Supply type retrieved successfully')
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message, 404)
    }
  }

  /**
   * @swagger
   * /api/supply-types:
   *   post:
   *     summary: Create new supply type
   *     tags: [Supply Types]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - supplyTypeName
   *               - supplyTypeSlug
   *             properties:
   *               supplyTypeName:
   *                 type: string
   *                 maxLength: 255
   *               supplyTypeDescription:
   *                 type: string
   *                 maxLength: 1000
   *               supplyTypeIdentifier:
   *                 type: string
   *                 maxLength: 100
   *               supplyTypeSlug:
   *                 type: string
   *                 maxLength: 255
   *     responses:
   *       201:
   *         description: Supply type created successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/SupplyType'
   *       400:
   *         description: Validation error or slug already exists
   */
  async store({ request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(createSupplyTypeValidator)
      const supplyType = await SupplyTypeService.create(data)

      return StandardResponseFormatter.success(response, supplyType, 'Supply Type', 'Supply type created successfully', 201)
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message, 400)
    }
  }

  /**
   * @swagger
   * /api/supply-types/{id}:
   *   put:
   *     summary: Update supply type
   *     tags: [Supply Types]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Supply type ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               supplyTypeName:
   *                 type: string
   *                 maxLength: 255
   *               supplyTypeDescription:
   *                 type: string
   *                 maxLength: 1000
   *               supplyTypeIdentifier:
   *                 type: string
   *                 maxLength: 100
   *               supplyTypeSlug:
   *                 type: string
   *                 maxLength: 255
   *     responses:
   *       200:
   *         description: Supply type updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/SupplyType'
   *       400:
   *         description: Validation error or slug already exists
   *       404:
   *         description: Supply type not found
   */
  async update({ params, request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(updateSupplyTypeValidator)
      const supplyType = await SupplyTypeService.update(params.id, data)

      return StandardResponseFormatter.success(response, supplyType, 'Supply Type', 'Supply type updated successfully')
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message, 400)
    }
  }

  /**
   * @swagger
   * /api/supply-types/{id}:
   *   delete:
   *     summary: Delete supply type
   *     tags: [Supply Types]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Supply type ID
   *     responses:
   *       200:
   *         description: Supply type deleted successfully
   *       404:
   *         description: Supply type not found
   */
  async destroy({ params, response }: HttpContext) {
    try {
      await SupplyTypeService.delete(params.id)
      return StandardResponseFormatter.success(response, null, 'Supply Type', 'Supply type deleted successfully')
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message, 404)
    }
  }

  /**
   * @swagger
   * /api/supply-types/{id}/characteristics:
   *   get:
   *     summary: Get supply type with its characteristics
   *     tags: [Supply Types]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Supply type ID
   *     responses:
   *       200:
   *         description: Supply type with characteristics
   *       404:
   *         description: Supply type not found
   */
  async getWithCharacteristics({ params, response }: HttpContext) {
    try {
      const supplyType = await SupplyTypeService.getWithCharacteristics(params.id)
      return StandardResponseFormatter.success(response, supplyType, 'Supply Type', 'Supply type with characteristics retrieved successfully')
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message, 404)
    }
  }
}
