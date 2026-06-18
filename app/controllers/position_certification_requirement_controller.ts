import type { HttpContext } from '@adonisjs/core/http'
import PositionCertificationRequirementService from '#services/position_certification_requirement_service'
import { addPositionCertificationRequirementsValidator } from '#validators/position_certification_requirement'
import { resolvePcrApiError } from '../helpers/position_certification_requirement_api_error.js'
import { PositionCertificationRequirementError } from '../exceptions/position_certification_requirement_error.js'
import { PCR_ERROR_CODES } from '../constants/position_certification_requirement_error_codes.js'

export default class PositionCertificationRequirementController {
  /**
   * @swagger
   * /api/positions/{positionId}/certification-requirements:
   *   get:
   *     summary: Listar certificaciones requeridas de un puesto
   *     tags: [PositionCertificationRequirements]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: positionId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200':
   *         description: Lista de requerimientos con certificación y categoría
   *       '404':
   *         description: Puesto no encontrado
   */
  async index({ params, response }: HttpContext) {
    try {
      const positionId = Number(params.positionId)
      this.assertNumericId(positionId)

      const service = new PositionCertificationRequirementService()
      const requirements = await service.getByPosition(positionId)

      const data = requirements.map(this.serialize)

      return response.status(200).json({
        type: 'success',
        title: 'Certificaciones requeridas',
        message: 'Certificaciones requeridas obtenidas correctamente',
        data: { positionCertificationRequirements: data },
      })
    } catch (error) {
      return this.respondError(error, response, 400)
    }
  }

  /**
   * @swagger
   * /api/positions/{positionId}/certification-requirements:
   *   post:
   *     summary: Agregar certificaciones requeridas a un puesto (lote)
   *     tags: [PositionCertificationRequirements]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: positionId
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [certificationIds]
   *             properties:
   *               certificationIds:
   *                 type: array
   *                 items: { type: integer }
   *                 minItems: 1
   *     responses:
   *       '201':
   *         description: Creados
   *       '400':
   *         description: Validación
   *       '404':
   *         description: Puesto o certificación no encontrado
   *       '409':
   *         description: Certificación ya asignada al puesto
   *       '422':
   *         description: Certificación no aplicable por unidad de negocio
   */
  async store({ auth, params, request, response }: HttpContext) {
    try {
      const positionId = Number(params.positionId)
      this.assertNumericId(positionId)

      const body = await request.validateUsing(addPositionCertificationRequirementsValidator)

      const service = new PositionCertificationRequirementService()
      const created = await service.addBatch(positionId, body.certificationIds)

      await this.logAction(auth, request, 'store', positionId, body.certificationIds)

      return response.status(201).json({
        type: 'success',
        title: 'Certificaciones requeridas',
        message: 'Certificaciones agregadas al puesto correctamente',
        data: { positionCertificationRequirements: created.map(this.serialize) },
      })
    } catch (error) {
      return this.respondError(error, response, 400)
    }
  }

  /**
   * @swagger
   * /api/positions/{positionId}/certification-requirements/{certificationId}:
   *   delete:
   *     summary: Quitar certificación requerida de un puesto (soft delete)
   *     tags: [PositionCertificationRequirements]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: positionId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: certificationId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '204':
   *         description: Sin cuerpo
   *       '404':
   *         description: Relación inexistente
   */
  async destroy({ auth, params, request, response }: HttpContext) {
    try {
      const positionId = Number(params.positionId)
      const certificationId = Number(params.certificationId)
      this.assertNumericId(positionId)
      this.assertNumericId(certificationId)

      const service = new PositionCertificationRequirementService()
      await service.remove(positionId, certificationId)

      await this.logAction(auth, request, 'delete', positionId, [certificationId])

      return response.noContent()
    } catch (error) {
      return this.respondError(error, response, 404)
    }
  }

  private serialize(req: import('#models/position_certification_requirement').default) {
    const cert = req.certification
    const category = cert?.category
    return {
      positionCertificationRequirementId: req.positionCertificationRequirementId,
      certificationId: req.certificationId,
      certification: cert
        ? {
            id: cert.certificationId,
            name: cert.certificationName,
            isExternal: !!cert.isExternal,
            externalUrl: cert.externalUrl,
            renewalPeriodDays: cert.renewalPeriodDays,
            category: category
              ? {
                  id: category.certificationCategoryId,
                  key: category.certificationCategoryKey,
                  name: category.certificationCategoryName,
                }
              : null,
          }
        : null,
    }
  }

  private assertNumericId(id: number) {
    if (Number.isNaN(id) || id <= 0) {
      throw new PositionCertificationRequirementError(
        'El identificador proporcionado es inválido.',
        PCR_ERROR_CODES.VAL_INPUT,
        400
      )
    }
  }

  private respondError(error: unknown, response: HttpContext['response'], fallback: number) {
    const pcr = error instanceof PositionCertificationRequirementError ? error : null

    if (pcr?.errorCode === PCR_ERROR_CODES.REQUIREMENT_DUPLICATE) {
      return response.status(409).json({
        type: 'error',
        title: 'Certificación duplicada en puesto',
        key: 'certificacion-ya-asignada',
        detail: pcr.message,
        message: pcr.message,
        errorCode: pcr.errorCode,
        data: null,
      })
    }

    if (pcr?.errorCode === PCR_ERROR_CODES.CERTIFICATION_NOT_APPLICABLE) {
      return response.status(422).json({
        type: 'error',
        title: 'Certificación no aplicable',
        key: 'certificacion-no-aplicable',
        detail: pcr.message,
        message: pcr.message,
        errorCode: pcr.errorCode,
        data: null,
      })
    }

    const { message, status, errorCode } = resolvePcrApiError(error, fallback)
    return response.status(status).json({
      type: 'error',
      title: 'Error',
      message,
      errorCode,
      data: null,
    })
  }

  private async logAction(
    auth: HttpContext['auth'],
    request: HttpContext['request'],
    verb: string,
    positionId: number,
    certificationIds: number[]
  ) {
    const userId = auth.user?.userId
    if (!userId) {
      return
    }
    try {
      const { LogStore } = await import('#models/MongoDB/log_store')
      const { DateTime } = await import('luxon')
      const rawHeaders = request.request.rawHeaders
      const getHeader = (name: string) => {
        const i = rawHeaders.indexOf(name)
        return i !== -1 ? rawHeaders[i + 1] : ''
      }
      await LogStore.set('log_position_certification_requirements', {
        user_id: userId,
        action: verb,
        user_agent: getHeader('User-Agent'),
        sec_ch_ua_platform: getHeader('sec-ch-ua-platform'),
        sec_ch_ua: getHeader('sec-ch-ua'),
        origin: getHeader('Origin'),
        date: DateTime.local().setZone('utc').toISO() ?? '',
        record_current: { positionId, certificationIds },
      })
    } catch {
      //
    }
  }
}
