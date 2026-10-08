import type { HttpContext } from '@adonisjs/core/http'
import { errors as vineErrors } from '@vinejs/vine'
import SupplyTypeService from '#services/supply_type_service'
import {
  createSupplyTypeValidator,
  updateSupplyTypeValidator,
  supplyTypeFilterValidator
} from '#validators/supply_type'
import { StandardResponseFormatter } from '../helpers/standard_response_formatter.js'
import { AssetError, respondAssetError } from '#modules/assets/assets.error'

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
   *                 description: Opcional; si no llega se deriva del nombre y es único en la empresa (`laptop`, `laptop-2`)
   *               supplyTypeTeleworkCategory:
   *                 type: string
   *                 nullable: true
   *                 enum: [ergonomic_chair, computing_equipment, accessory]
   *                 description: Categoría de insumo de teletrabajo (NOM-037-STPS-2023)
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
   *       422:
   *         description: "Categoría fuera del catálogo (`key: categoria-de-insumo-invalida`)"
   *       400:
   *         description: Validation error or slug already exists
   */
  async store(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      const data = await request.validateUsing(createSupplyTypeValidator)
      const supplyType = await SupplyTypeService.create(data)

      return StandardResponseFormatter.success(response, supplyType, 'Supply Type', 'Supply type created successfully', 201)
    } catch (error) {
      if (error instanceof vineErrors.E_VALIDATION_ERROR) {
        const messages = error.messages as Array<{ field?: string }>
        if (messages.some((message) => message.field === 'supplyTypeTeleworkCategory')) {
          return respondAssetError(ctx, AssetError.teleworkCategoryInvalid())
        }
      }
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
   *               supplyTypeTeleworkCategory:
   *                 type: string
   *                 nullable: true
   *                 enum: [ergonomic_chair, computing_equipment, accessory]
   *                 description: Categoría de insumo de teletrabajo (NOM-037-STPS-2023)
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
   *       422:
   *         description: "Categoría fuera del catálogo (`key: categoria-de-insumo-invalida`)"
   *       400:
   *         description: Validation error or slug already exists
   *       404:
   *         description: "Tipo inexistente, de otra empresa o global (`key: tipo-de-activo-no-encontrado`)"
   */
  async update(ctx: HttpContext) {
    const { params, request, response } = ctx
    try {
      const data = await request.validateUsing(updateSupplyTypeValidator)
      const supplyType = await SupplyTypeService.update(params.id, data)

      return StandardResponseFormatter.success(response, supplyType, 'Supply Type', 'Supply type updated successfully')
    } catch (error) {
      if (error instanceof vineErrors.E_VALIDATION_ERROR) {
        const messages = error.messages as Array<{ field?: string }>
        if (messages.some((message) => message.field === 'supplyTypeTeleworkCategory')) {
          return respondAssetError(ctx, AssetError.teleworkCategoryInvalid())
        }
      }
      if ((error as { code?: string })?.code === 'E_ROW_NOT_FOUND') {
        return respondAssetError(ctx, AssetError.assetTypeNotFound())
      }
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
   *       409:
   *         description: "El tipo tiene activos no borrados (`key: tipo-de-activo-con-activos`)"
   */
  async destroy(ctx: HttpContext) {
    const { params, response } = ctx
    try {
      await SupplyTypeService.delete(params.id)
      return StandardResponseFormatter.success(response, null, 'Supply Type', 'Supply type deleted successfully')
    } catch (error) {
      if (error instanceof AssetError) return respondAssetError(ctx, error)
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
