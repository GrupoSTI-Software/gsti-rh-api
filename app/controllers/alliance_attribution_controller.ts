import type { HttpContext } from '@adonisjs/core/http'
import AllianceAttributionService from '#services/alliance_attribution_service'
import {
  closeAllianceAttributionValidator,
  createAllianceAttributionValidator,
  updateAllianceAttributionValidator,
} from '#validators/alliance_attribution'
import { resolveAllianceApiError } from '../helpers/alliance_api_error.js'

/**
 * Controlador de atribuciones alianza↔cliente (USRH1789099318034).
 * Todos los endpoints requieren `auth` + `platformAdmin`: es dato de
 * plataforma, no de la empresa cliente. Alta, lectura, ajuste y cierre.
 */
export default class AllianceAttributionController {
  private readonly service = new AllianceAttributionService()

  /**
   * @swagger
   * /api/platform/alliance-attributions:
   *   post:
   *     tags:
   *       - Platform Alliances
   *     summary: Atribuir una empresa cliente a una alianza comercial
   *     description: >
   *       Copia el porcentaje y el plazo del acuerdo general si no vienen
   *       en el cuerpo. Si vienen, guarda lo confirmado. Un cliente no
   *       puede tener dos atribuciones vivas.
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - allianceId
   *               - businessUnitPublicId
   *               - allianceAttributionStartsAt
   *             properties:
   *               allianceId:
   *                 type: integer
   *               businessUnitPublicId:
   *                 type: string
   *                 format: uuid
   *               allianceAttributionStartsAt:
   *                 type: string
   *                 format: date
   *               allianceAttributionCommissionPercent:
   *                 type: number
   *               allianceAttributionTermPeriods:
   *                 type: integer
   *                 nullable: true
   *     responses:
   *       '201':
   *         description: Atribución creada
   *       '404':
   *         description: >
   *           Alianza no encontrada (PLT.ALL.NOT_FOUND) o empresa cliente
   *           no encontrada (PLT.ALL.BUSINESS_UNIT_NOT_FOUND)
   *       '409':
   *         description: El cliente ya tiene atribución viva (PLT.ALL.ATTRIBUTION_ALREADY_LIVE)
   *       '422':
   *         description: >
   *           Datos inválidos, alianza inactiva, comisión o plazo fuera
   *           de rango, o fecha de inicio en el futuro
   */
  async store({ request, response }: HttpContext) {
    try {
      this.service.assertCreatePayloadScalars(request.body())
      const data = await request.validateUsing(createAllianceAttributionValidator)
      const view = await this.service.createAttribution(data)
      return response.status(201).json({ type: 'success', data: view })
    } catch (error) {
      const { status, ...body } = resolveAllianceApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/alliance-attributions/{allianceAttributionId}:
   *   get:
   *     tags:
   *       - Platform Alliances
   *     summary: Consultar una atribución por id
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: allianceAttributionId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Vista completa de la atribución
   *       '404':
   *         description: Atribución no encontrada (PLT.ALL.ATTRIBUTION_NOT_FOUND)
   */
  async show({ params, response }: HttpContext) {
    try {
      const view = await this.service.getAttribution(String(params.allianceAttributionId))
      return response.status(200).json({ type: 'success', data: view })
    } catch (error) {
      const { status, ...body } = resolveAllianceApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/tenants/{businessUnitPublicId}/alliance-attributions:
   *   get:
   *     tags:
   *       - Platform Alliances
   *     summary: Histórico de atribuciones de una empresa cliente
   *     description: >
   *       Arreglo plano, viva y cerradas, orden id descendente. Sin
   *       atribuciones responde 200 con arreglo vacío. La ruta vive
   *       bajo /tenants pero se declara en este archivo.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: businessUnitPublicId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       '200':
   *         description: Histórico de atribuciones
   *       '404':
   *         description: Empresa cliente no encontrada (PLT.ALL.BUSINESS_UNIT_NOT_FOUND)
   */
  async indexByTenant({ params, response }: HttpContext) {
    try {
      const views = await this.service.listAttributionsByTenant(params.businessUnitPublicId)
      return response.status(200).json({ type: 'success', data: views })
    } catch (error) {
      const { status, ...body } = resolveAllianceApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/alliance-attributions/{allianceAttributionId}:
   *   patch:
   *     tags:
   *       - Platform Alliances
   *     summary: Ajustar las condiciones de una atribución viva
   *     description: >
   *       Cambia porcentaje, plazo o fecha de inicio de ese cliente.
   *       No acepta alianza ni empresa. Una atribución cerrada no se ajusta.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: allianceAttributionId
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
   *               allianceAttributionCommissionPercent:
   *                 type: number
   *               allianceAttributionTermPeriods:
   *                 type: integer
   *                 nullable: true
   *               allianceAttributionStartsAt:
   *                 type: string
   *                 format: date
   *     responses:
   *       '200':
   *         description: Atribución ajustada
   *       '404':
   *         description: Atribución no encontrada (PLT.ALL.ATTRIBUTION_NOT_FOUND)
   *       '409':
   *         description: Atribución cerrada (PLT.ALL.ATTRIBUTION_CLOSED_IMMUTABLE)
   *       '422':
   *         description: >
   *           Datos inválidos, comisión o plazo fuera de rango, o fecha
   *           de inicio en el futuro
   */
  async update({ params, request, response }: HttpContext) {
    try {
      this.service.assertUpdatePayloadScalars(request.body())
      const data = await request.validateUsing(updateAllianceAttributionValidator)
      const view = await this.service.updateAllianceAttribution(
        String(params.allianceAttributionId),
        data
      )
      return response.status(200).json({ type: 'success', data: view })
    } catch (error) {
      const { status, ...body } = resolveAllianceApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/alliance-attributions/{allianceAttributionId}/close:
   *   post:
   *     tags:
   *       - Platform Alliances
   *     summary: Cerrar una atribución viva
   *     description: >
   *       Exige fecha y motivo. Corta hacia adelante: no borra ni
   *       recalcula lo anterior. Libera el slot para otra atribución.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: allianceAttributionId
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
   *               - allianceAttributionClosedAt
   *               - allianceAttributionCloseReason
   *             properties:
   *               allianceAttributionClosedAt:
   *                 type: string
   *                 format: date
   *               allianceAttributionCloseReason:
   *                 type: string
   *     responses:
   *       '200':
   *         description: Atribución cerrada
   *       '404':
   *         description: Atribución no encontrada (PLT.ALL.ATTRIBUTION_NOT_FOUND)
   *       '422':
   *         description: >
   *           Sin motivo, ya cerrada o fecha de cierre fuera de rango
   */
  async close({ params, request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(closeAllianceAttributionValidator)
      const view = await this.service.closeAllianceAttribution(
        String(params.allianceAttributionId),
        data
      )
      return response.status(200).json({ type: 'success', data: view })
    } catch (error) {
      const { status, ...body } = resolveAllianceApiError(error)
      return response.status(status).json(body)
    }
  }
}
