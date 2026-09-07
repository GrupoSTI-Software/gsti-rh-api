import type { HttpContext } from '@adonisjs/core/http'
import AllianceService, { toAllianceView } from '#services/alliance_service'
import {
  createAllianceValidator,
  listAlliancesValidator,
  updateAllianceValidator,
} from '#validators/alliance'
import { resolveAllianceApiError } from '../helpers/alliance_api_error.js'

/**
 * Controlador del registro de alianzas comerciales (USRH1788505941892).
 * Todos los endpoints requieren middleware `auth` + `platformAdmin`: es dato
 * de plataforma, no de una empresa cliente.
 */
export default class AllianceController {
  private readonly service = new AllianceService()

  /**
   * @swagger
   * /api/platform/alliances:
   *   get:
   *     tags:
   *       - Platform Alliances
   *     summary: Listar alianzas comerciales
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         schema:
   *           type: string
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
   *         description: Lista paginada de alianzas comerciales
   *       '422':
   *         description: Filtros inválidos (PLT.ALL.VAL_INPUT)
   */
  async index({ request, response }: HttpContext) {
    try {
      const filters = await request.validateUsing(listAlliancesValidator)
      const result = await this.service.listAlliances(filters)
      return response.status(200).json({ type: 'success', ...result })
    } catch (error) {
      const { status, ...body } = resolveAllianceApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/alliances/{allianceId}:
   *   get:
   *     tags:
   *       - Platform Alliances
   *     summary: Obtener detalle de una alianza comercial
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: allianceId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Detalle de la alianza comercial
   *       '404':
   *         description: Alianza no encontrada (PLT.ALL.NOT_FOUND)
   */
  async show({ params, response }: HttpContext) {
    try {
      const alliance = await this.service.getAlliance(Number(params.allianceId))
      return response.status(200).json({ type: 'success', data: toAllianceView(alliance) })
    } catch (error) {
      const { status, ...body } = resolveAllianceApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/alliances:
   *   post:
   *     tags:
   *       - Platform Alliances
   *     summary: Registrar una alianza comercial
   *     description: >
   *       El nombre puede repetirse. La alianza nace activa. El plazo
   *       omitido o nulo se guarda como indeterminado. El porcentaje y el
   *       plazo son valores por omisión: el sistema no los aplica solo.
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - allianceName
   *               - allianceDefaultCommissionPercent
   *             properties:
   *               allianceName:
   *                 type: string
   *                 maxLength: 160
   *               allianceContactName:
   *                 type: string
   *                 nullable: true
   *               allianceContactEmail:
   *                 type: string
   *                 nullable: true
   *               allianceContactPhone:
   *                 type: string
   *                 nullable: true
   *               allianceDefaultCommissionPercent:
   *                 type: number
   *                 description: Entre 0 y 100, máximo dos decimales
   *               allianceDefaultTermPeriods:
   *                 type: integer
   *                 nullable: true
   *                 description: Periodos de facturación; null = indeterminado
   *     responses:
   *       '201':
   *         description: Alianza comercial creada
   *       '422':
   *         description: >
   *           Datos inválidos (PLT.ALL.VAL_INPUT), comisión fuera de rango
   *           (PLT.ALL.COMMISSION_OUT_OF_RANGE) o plazo inválido
   *           (PLT.ALL.TERM_PERIODS_INVALID)
   */
  async store({ request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(createAllianceValidator)
      const alliance = await this.service.createAlliance(data)
      return response.status(201).json({ type: 'success', data: toAllianceView(alliance) })
    } catch (error) {
      const { status, ...body } = resolveAllianceApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/alliances/{allianceId}:
   *   patch:
   *     tags:
   *       - Platform Alliances
   *     summary: Corregir una alianza comercial
   *     description: >
   *       `allianceActive` no se acepta por esta vía. Para activar o
   *       desactivar usa los endpoints dedicados. La corrección solo
   *       afecta a lo que se pacte a partir de este momento.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: allianceId
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
   *               allianceName:
   *                 type: string
   *               allianceContactName:
   *                 type: string
   *                 nullable: true
   *               allianceContactEmail:
   *                 type: string
   *                 nullable: true
   *               allianceContactPhone:
   *                 type: string
   *                 nullable: true
   *               allianceDefaultCommissionPercent:
   *                 type: number
   *               allianceDefaultTermPeriods:
   *                 type: integer
   *                 nullable: true
   *     responses:
   *       '200':
   *         description: Alianza comercial actualizada
   *       '404':
   *         description: Alianza no encontrada (PLT.ALL.NOT_FOUND)
   *       '422':
   *         description: >
   *           Datos inválidos (PLT.ALL.VAL_INPUT), comisión fuera de rango
   *           (PLT.ALL.COMMISSION_OUT_OF_RANGE) o plazo inválido
   *           (PLT.ALL.TERM_PERIODS_INVALID)
   */
  async update({ params, request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(updateAllianceValidator)
      const alliance = await this.service.updateAlliance(Number(params.allianceId), data)
      return response.status(200).json({ type: 'success', data: toAllianceView(alliance) })
    } catch (error) {
      const { status, ...body } = resolveAllianceApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/alliances/{allianceId}/activate:
   *   post:
   *     tags:
   *       - Platform Alliances
   *     summary: Reactivar una alianza comercial inactiva
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: allianceId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Alianza comercial activada
   *       '404':
   *         description: Alianza no encontrada (PLT.ALL.NOT_FOUND)
   *       '422':
   *         description: Ya está activa (PLT.ALL.ALREADY_ACTIVE)
   */
  async activate({ params, response }: HttpContext) {
    try {
      const alliance = await this.service.activateAlliance(Number(params.allianceId))
      return response.status(200).json({ type: 'success', data: toAllianceView(alliance) })
    } catch (error) {
      const { status, ...body } = resolveAllianceApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/alliances/{allianceId}/deactivate:
   *   post:
   *     tags:
   *       - Platform Alliances
   *     summary: Desactivar una alianza comercial (reversible)
   *     description: >
   *       No borra el registro. Conserva íntegras sus condiciones y deja
   *       de ofrecerse para usos nuevos.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: allianceId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Alianza comercial desactivada
   *       '404':
   *         description: Alianza no encontrada (PLT.ALL.NOT_FOUND)
   *       '422':
   *         description: Ya está inactiva (PLT.ALL.ALREADY_INACTIVE)
   */
  async deactivate({ params, response }: HttpContext) {
    try {
      const alliance = await this.service.deactivateAlliance(Number(params.allianceId))
      return response.status(200).json({ type: 'success', data: toAllianceView(alliance) })
    } catch (error) {
      const { status, ...body } = resolveAllianceApiError(error)
      return response.status(status).json(body)
    }
  }
}
