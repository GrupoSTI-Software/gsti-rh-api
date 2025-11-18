import type { HttpContext } from '@adonisjs/core/http'
import SupplieService from '#services/supplie_service'
import {
  createSupplieValidator,
  updateSupplieValidator,
  supplieFilterValidator,
  supplieDeactivationValidator
} from '#validators/supplie'
import { StandardResponseFormatter } from '../helpers/standard_response_formatter.js'

export default class SuppliesController {
  /**
   * @swagger
   * /api/supplies:
   *   get:
   *     summary: Get all supplies
   *     tags: [Supplies]
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
   *         name: supplyName
   *         schema:
   *           type: string
   *         description: Filter by supply name
   *       - in: query
   *         name: supplyStatus
   *         schema:
   *           type: string
   *           enum: [active, inactive, lost, damaged]
   *         description: Filter by supply status
   *       - in: query
   *         name: supplyFileNumber
   *         schema:
   *           type: integer
   *         description: Filter by file number
   *     responses:
   *       200:
   *         description: List of supplies
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/Supplie'
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
      const filters = await request.validateUsing(supplieFilterValidator)
      const supplies = await SupplieService.getAll(filters)

      return StandardResponseFormatter.success(response, supplies
      , 'Supplies', 'Supplies retrieved successfully')
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message
      , 400)
    }
  }

  /**
   * @swagger
   * /api/supplies/{id}:
   *   get:
   *     summary: Get supply by ID
   *     tags: [Supplies]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Supply ID
   *     responses:
   *       200:
   *         description: Supply details
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/Supplie'
   *       404:
   *         description: Supply not found
   */
  async show({ params, response }: HttpContext) {
    try {
      const supply = await SupplieService.getById(params.id)
      return StandardResponseFormatter.success(response, supply
      , 'Supply', 'Supply retrieved successfully')
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message
      , 404)
    }
  }

  /**
   * @swagger
   * /api/supplies:
   *   post:
   *     summary: Create new supply
   *     tags: [Supplies]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - supplyFileNumber
   *               - supplyName
   *               - supplyTypeId
   *             properties:
   *               supplyFileNumber:
   *                 type: integer
   *                 description: Supply file number
   *               supplyName:
   *                 type: string
   *                 maxLength: 255
   *                 description: Supply name
   *               supplyDescription:
   *                 type: string
   *                 maxLength: 1000
   *                 description: Supply description
   *               supplyTypeId:
   *                 type: integer
   *                 description: Supply type ID
   *               supplyStatus:
   *                 type: string
   *                 enum: [active, inactive, lost, damaged]
   *                 description: Supply status
   *     responses:
   *       201:
   *         description: Supply created successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/Supplie'
   *       400:
   *         description: Validation error or file number already exists
   */
  async store({ request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(createSupplieValidator)
      const supply = await SupplieService.create(data)

      return StandardResponseFormatter.success(response, supply
      , 'Supply', 'Supply created successfully', 201)
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message
      , 400)
    }
  }

  /**
   * @swagger
   * /api/supplies/{id}:
   *   put:
   *     summary: Update supply
   *     tags: [Supplies]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Supply ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               supplyFileNumber:
   *                 type: integer
   *                 description: Supply file number
   *               supplyName:
   *                 type: string
   *                 maxLength: 255
   *                 description: Supply name
   *               supplyDescription:
   *                 type: string
   *                 maxLength: 1000
   *                 description: Supply description
   *               supplyTypeId:
   *                 type: integer
   *                 description: Supply type ID
   *               supplyStatus:
   *                 type: string
   *                 enum: [active, inactive, lost, damaged]
   *                 description: Supply status
   *     responses:
   *       200:
   *         description: Supply updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/Supplie'
   *       400:
   *         description: Validation error or file number already exists
   *       404:
   *         description: Supply not found
   */
  async update({ params, request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(updateSupplieValidator)
      const supply = await SupplieService.update(params.id, data)

      return StandardResponseFormatter.success(response, supply
      , 'Supply', 'Supply updated successfully')
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message
      , 400)
    }
  }

  /**
   * @swagger
   * /api/supplies/{id}:
   *   delete:
   *     summary: Delete supply
   *     tags: [Supplies]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Supply ID
   *     responses:
   *       200:
   *         description: Supply deleted successfully
   *       404:
   *         description: Supply not found
   */
  async destroy({ params, response }: HttpContext) {
    try {
      await SupplieService.delete(params.id)
      return StandardResponseFormatter.success(response, null
      , 'Supply', 'Supply deleted successfully')
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message
      , 404)
    }
  }

  /**
   * @swagger
   * /api/supplies/{id}/deactivate:
   *   post:
   *     summary: Deactivate supply with reason
   *     tags: [Supplies]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Supply ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - supplyDeactivationReason
   *             properties:
   *               supplyDeactivationReason:
   *                 type: string
   *                 maxLength: 500
   *                 description: Reason for deactivation
   *               supplyDeactivationDate:
   *                 type: string
   *                 format: date-time
   *                 description: Deactivation date (optional, defaults to now)
   *     responses:
   *       200:
   *         description: Supply deactivated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/Supplie'
   *       400:
   *         description: Validation error
   *       404:
   *         description: Supply not found
   */
  async deactivate({ params, request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(supplieDeactivationValidator)
      const supply = await SupplieService.deactivate(params.id, data)

      return StandardResponseFormatter.success(response, supply
      , 'Supply', 'Supply deactivated successfully')
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message
      , 400)
    }
  }

  /**
   * @swagger
   * /api/supplies/{id}/with-type:
   *   get:
   *     summary: Get supply with its type
   *     tags: [Supplies]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Supply ID
   *     responses:
   *       200:
   *         description: Supply with type
   *       404:
   *         description: Supply not found
   */
  async getWithType({ params, response }: HttpContext) {
    try {
      const supply = await SupplieService.getWithType(params.id)
      return StandardResponseFormatter.success(response, supply
      , 'Supply', 'Supply with type retrieved successfully')
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message
      , 404)
    }
  }

  /**
   * @swagger
   * /api/supplies/by-type/{supplyTypeId}:
   *   get:
   *     summary: Get supplies by type
   *     tags: [Supplies]
   *     parameters:
   *       - in: path
   *         name: supplyTypeId
   *         required: true
   *         schema:
   *           type: integer
   *         description: Supply type ID
   *     responses:
   *       200:
   *         description: Supplies for the type
   *       404:
   *         description: Supply type not found
   */
  async getByType({ params, response }: HttpContext) {
    try {
      const supplies = await SupplieService.getByType(params.supplyTypeId)
      return StandardResponseFormatter.success(response, supplies
      , 'Supplies', 'Supplies retrieved successfully')
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message
      , 404)
    }
  }

  /**
   * @swagger
   * /api/supplies/excel:
   *   get:
   *     summary: Generate Excel report of supplies with assignments
   *     tags: [Supplies]
   *     description: Generates a downloadable Excel file listing all supplies and their assignments, including assignment status, employee information, and retirement details. The Excel format is automatically set based on the active system setting.
   *     responses:
   *       201:
   *         description: Excel file generated successfully
   *         content:
   *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
   *             schema:
   *               type: string
   *               format: binary
   *       500:
   *         description: Server error
   */
  async getExcel({ response }: HttpContext) {
    try {
      const result = await SupplieService.getExcelReport()

      if (result.status === 201) {
        response.header(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response.header('Content-Disposition', 'attachment; filename=supplies-report.xlsx')
        response.status(201)
        response.send(result.buffer)
      } else {
        response.status(result.status)
        return {
          type: result.type,
          title: result.title,
          message: result.message,
          error: result.error,
        }
      }
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message
      , 500)
    }
  }
}
