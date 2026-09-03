import type { HttpContext } from '@adonisjs/core/http'
import DiscountCodeService from '#services/discount_code_service'
import {
  createDiscountCodeValidator,
  updateDiscountCodeValidator,
  listDiscountCodesValidator,
  quoteDiscountCodeValidator,
} from '#validators/discount_code'
import { resolveDiscountCodeApiError } from '../helpers/discount_code_api_error.js'

/**
 * Controlador del catálogo de códigos de descuento (USRH1787714804397).
 * Todos los endpoints requieren middleware `auth` + `platformAdmin`: es dato
 * de plataforma, no de una empresa cliente.
 */
export default class DiscountCodeController {
  private readonly service = new DiscountCodeService()

  /**
   * @swagger
   * /api/platform/billing/discount-codes:
   *   get:
   *     tags:
   *       - Platform Billing
   *     summary: Listar códigos de descuento del catálogo
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         schema:
   *           type: string
   *       - name: kind
   *         in: query
   *         required: false
   *         schema:
   *           type: string
   *           enum: [percent, fixed_amount, unit_price]
   *       - name: active
   *         in: query
   *         required: false
   *         schema:
   *           type: integer
   *           enum: [0, 1]
   *       - name: page
   *         in: query
   *         required: false
   *         schema:
   *           type: integer
   *       - name: limit
   *         in: query
   *         required: false
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Lista paginada de códigos de descuento
   *       '422':
   *         description: Filtros inválidos (PLT.DSC.VAL_INPUT)
   */
  async index({ request, response }: HttpContext) {
    try {
      const filters = await request.validateUsing(listDiscountCodesValidator)
      const result = await this.service.listDiscountCodes(filters)
      return response.status(200).json({ type: 'success', ...result })
    } catch (error) {
      const { status, ...body } = resolveDiscountCodeApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/billing/discount-codes/{discountCodeId}:
   *   get:
   *     tags:
   *       - Platform Billing
   *     summary: Obtener detalle de un código de descuento
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: discountCodeId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Detalle del código de descuento
   *       '404':
   *         description: Código no encontrado (PLT.DSC.NOT_FOUND)
   */
  async show({ params, response }: HttpContext) {
    try {
      const discountCode = await this.service.getDiscountCode(Number(params.discountCodeId))
      return response.status(200).json({ type: 'success', data: discountCode })
    } catch (error) {
      const { status, ...body } = resolveDiscountCodeApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/billing/discount-codes:
   *   post:
   *     tags:
   *       - Platform Billing
   *     summary: Crear un código de descuento
   *     description: >
   *       El texto (discountCodeCode) se normaliza a MAYÚSCULAS y debe ser
   *       alfanumérico (con ., _, -) de 3 a 40 caracteres. Es único de por
   *       vida: ni distingue mayúsculas de minúsculas ni se libera al
   *       apagar o retirar el código.
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - discountCodeCode
   *               - discountCodeName
   *               - discountCodeKind
   *               - discountCodeValue
   *             properties:
   *               discountCodeCode:
   *                 type: string
   *                 minLength: 3
   *                 maxLength: 40
   *               discountCodeName:
   *                 type: string
   *               discountCodeKind:
   *                 type: string
   *                 enum: [percent, fixed_amount, unit_price]
   *               discountCodeValue:
   *                 type: number
   *               discountCodeValidFrom:
   *                 type: string
   *                 format: date
   *                 nullable: true
   *               discountCodeValidTo:
   *                 type: string
   *                 format: date
   *                 nullable: true
   *               discountCodeMaxRedemptions:
   *                 type: integer
   *                 nullable: true
   *               discountCodeBenefitPeriods:
   *                 type: integer
   *                 nullable: true
   *     responses:
   *       '201':
   *         description: Código de descuento creado
   *       '409':
   *         description: El texto ya existe (PLT.DSC.CODE_DUPLICATE)
   *       '422':
   *         description: >
   *           Datos inválidos (PLT.DSC.VAL_INPUT), valor incoherente con el
   *           tipo (PLT.DSC.VALUE_OUT_OF_RANGE) o vigencia inválida
   *           (PLT.DSC.VALIDITY_RANGE_INVALID)
   */
  async store({ request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(createDiscountCodeValidator)
      const discountCode = await this.service.createDiscountCode(data)
      return response.status(201).json({ type: 'success', data: discountCode })
    } catch (error) {
      const { status, ...body } = resolveDiscountCodeApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/billing/discount-codes/{discountCodeId}:
   *   patch:
   *     tags:
   *       - Platform Billing
   *     summary: Actualizar un código de descuento
   *     description: >
   *       El texto (discountCodeCode) no se acepta por esta vía: es
   *       inmutable una vez creado. Para activar/desactivar usa los
   *       endpoints dedicados.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: discountCodeId
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
   *               discountCodeName:
   *                 type: string
   *               discountCodeValue:
   *                 type: number
   *               discountCodeValidFrom:
   *                 type: string
   *                 format: date
   *                 nullable: true
   *               discountCodeValidTo:
   *                 type: string
   *                 format: date
   *                 nullable: true
   *               discountCodeMaxRedemptions:
   *                 type: integer
   *                 nullable: true
   *               discountCodeBenefitPeriods:
   *                 type: integer
   *                 nullable: true
   *     responses:
   *       '200':
   *         description: Código de descuento actualizado
   *       '404':
   *         description: Código no encontrado (PLT.DSC.NOT_FOUND)
   *       '422':
   *         description: >
   *           Datos inválidos (PLT.DSC.VAL_INPUT), valor incoherente con el
   *           tipo (PLT.DSC.VALUE_OUT_OF_RANGE) o vigencia inválida
   *           (PLT.DSC.VALIDITY_RANGE_INVALID)
   */
  async update({ params, request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(updateDiscountCodeValidator)
      const discountCode = await this.service.updateDiscountCode(
        Number(params.discountCodeId),
        data
      )
      return response.status(200).json({ type: 'success', data: discountCode })
    } catch (error) {
      const { status, ...body } = resolveDiscountCodeApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/billing/discount-codes/{discountCodeId}/activate:
   *   post:
   *     tags:
   *       - Platform Billing
   *     summary: Reactivar un código de descuento apagado
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: discountCodeId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Código de descuento activado
   *       '404':
   *         description: Código no encontrado (PLT.DSC.NOT_FOUND)
   *       '422':
   *         description: Ya está activo (PLT.DSC.ALREADY_ACTIVE)
   */
  async activate({ params, response }: HttpContext) {
    try {
      const discountCode = await this.service.activateDiscountCode(Number(params.discountCodeId))
      return response.status(200).json({ type: 'success', data: discountCode })
    } catch (error) {
      const { status, ...body } = resolveDiscountCodeApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/billing/discount-codes/{discountCodeId}/deactivate:
   *   post:
   *     tags:
   *       - Platform Billing
   *     summary: Apagar un código de descuento (reversible)
   *     description: >
   *       No libera el texto: el código sigue existiendo y no puede
   *       reutilizarse, solo dejará de poder canjearse.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: discountCodeId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Código de descuento desactivado
   *       '404':
   *         description: Código no encontrado (PLT.DSC.NOT_FOUND)
   *       '422':
   *         description: Ya está inactivo (PLT.DSC.ALREADY_INACTIVE)
   */
  async deactivate({ params, response }: HttpContext) {
    try {
      const discountCode = await this.service.deactivateDiscountCode(
        Number(params.discountCodeId)
      )
      return response.status(200).json({ type: 'success', data: discountCode })
    } catch (error) {
      const { status, ...body } = resolveDiscountCodeApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/billing/discount-codes/{discountCodeText}/quote:
   *   get:
   *     tags:
   *       - Platform Billing
   *     summary: Cotizar una contratación con un código de descuento aplicado
   *     description: >
   *       Solo lectura (USRH1787714804400): no reserva el código, no
   *       consume su cupo de canjes ni crea o modifica ninguna suscripción.
   *       Devuelve el precio sin el código (ya con descuento por volumen) y
   *       el precio con el código aplicado, acumulado después del volumen.
   *       Solo se puede cotizar sobre un plan publicado y vigente.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: discountCodeText
   *         required: true
   *         schema:
   *           type: string
   *       - name: billingPlanId
   *         in: query
   *         required: true
   *         schema:
   *           type: integer
   *       - name: employeeCount
   *         in: query
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Cotización con y sin el código de descuento
   *       '404':
   *         description: >
   *           Código no encontrado (PLT.DSC.NOT_FOUND) o plan no encontrado
   *           (PLT.DSC.QUOTE_PLAN_NOT_FOUND)
   *       '422':
   *         description: >
   *           Código no redimible — inactivo (PLT.DSC.CODE_INACTIVE), aún no
   *           vigente (PLT.DSC.CODE_NOT_YET_VALID), vencido
   *           (PLT.DSC.CODE_EXPIRED) o agotado (PLT.DSC.CODE_EXHAUSTED) — o
   *           plan no cotizable (PLT.DSC.QUOTE_PLAN_NOT_QUOTABLE) o sin
   *           precio vigente (PLT.DSC.QUOTE_NO_ACTIVE_PRICE)
   */
  async quote({ params, request, response }: HttpContext) {
    try {
      const { billingPlanId, employeeCount } = await request.validateUsing(
        quoteDiscountCodeValidator
      )
      const quote = await this.service.quoteWithDiscountCode({
        discountCodeText: String(params.discountCodeText),
        billingPlanId,
        employeeCount,
      })
      return response.status(200).json({ type: 'success', data: quote })
    } catch (error) {
      const { status, ...body } = resolveDiscountCodeApiError(error)
      return response.status(status).json(body)
    }
  }
}
