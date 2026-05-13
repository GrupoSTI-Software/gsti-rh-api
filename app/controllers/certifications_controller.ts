import Certification from '#models/certification'
import CertificationService, {
  serializeCertificationRow,
  type CertificationUpsertPayload,
} from '#services/certification_service'
import {
  certificationListValidator,
  createCertificationValidator,
  updateCertificationValidator,
} from '#validators/certification'
import type { HttpContext } from '@adonisjs/core/http'
import { CertificationServiceError } from '../exceptions/certification_service_error.js'
import { resolveCertificationApiError } from '../helpers/certification_api_error.js'
import { StandardResponseFormatter } from '../helpers/standard_response_formatter.js'
import { CERTIFICATION_ERROR_CODES } from '../constants/certification_error_codes.js'

/** Controlador REST del catálogo de certificaciones (catálogo RH / ONEST). */
export default class CertificationsController {
  /**
   * @swagger
   * /api/certification-categories:
   *   get:
   *     summary: Lista categorías de certificación activas (solo lectura)
   *     tags: [Certifications]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       '200':
   *         description: Arreglo con id, key, name, displayOrder, isActive
   */
  async indexCategories({ response }: HttpContext) {
    try {
      const service = new CertificationService()
      const data = await service.listCategories()
      return StandardResponseFormatter.success(
        response,
        data,
        'Certification Categories',
        'Categorías de certificación obtenidas correctamente'
      )
    } catch (error) {
      const resolved = resolveCertificationApiError(error, 500)
      return StandardResponseFormatter.error(
        response,
        resolved.message,
        resolved.status,
        resolved.errorCode
      )
    }
  }

  /**
   * @swagger
   * /api/certifications:
   *   get:
   *     summary: Lista paginada de certificaciones
   *     tags: [Certifications]
   *     parameters:
   *       - in: query
   *         name: page
   *         schema: { type: integer }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, maximum: 500 }
   *     responses:
   *       '200':
   *         description: Datos paginados con category, appliesToAllBusinessUnits, businessUnits…
   */
  async index({ request, response }: HttpContext) {
    try {
      const filters = await request.validateUsing(certificationListValidator)
      const page = filters.page ?? 1
      const limit = filters.limit ?? 25
      const service = new CertificationService()
      const bundle = await service.listPaginated(page, limit)
      return StandardResponseFormatter.success(
        response,
        bundle,
        'Certifications',
        'Certificaciones obtenidas correctamente'
      )
    } catch (error) {
      const resolved = resolveCertificationApiError(error, 400)
      return StandardResponseFormatter.error(
        response,
        resolved.message,
        resolved.status,
        resolved.errorCode
      )
    }
  }

  /**
   * @swagger
   * /api/certifications:
   *   post:
   *     summary: Crear certificación
   *     tags: [Certifications]
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [ name, categoryId, isExternal ]
   *             properties:
   *               name:
   *                 type: string
   *               categoryId:
   *                 type: integer
   *               isExternal:
   *                 type: boolean
   *               externalUrl:
   *                 type: string
   *                 nullable: true
   *               renewalPeriodDays:
   *                 type: integer
   *                 nullable: true
   *               businessUnitIds:
   *                 type: array
   *                 items: { type: integer }
   *     responses:
   *       '201':
   *         description: Creado
   *       '400':
   *         description: Validación Vine o URL inválida
   *       '404':
   *         description: Categoría o unidad inválida
   *       '409':
   *         description: Nombre repetido dentro de categoría (`certificacion-duplicada`)
   */
  async store({ auth, request, response }: HttpContext) {
    try {
      const body = await request.validateUsing(createCertificationValidator)
      const payload = this.toUpsertPayload(body)
      const service = new CertificationService()
      const created = await service.create(payload)

      await this.persistLog(auth, request, service, 'store', null, created)

      return StandardResponseFormatter.success(
        response,
        created,
        'Certification',
        'Certificación creada correctamente',
        201
      )
    } catch (error) {
      return this.respondError(error, response, 400)
    }
  }

  /**
   * @swagger
   * /api/certifications/{id}:
   *   put:
   *     summary: Actualizar certificación
   *     tags: [Certifications]
   *     responses:
   *       '200':
   *         description: Actualizado
   *       '404':
   *         description: Certificación no encontrada
   *       '409':
   *         description: Duplicado
   */
  async update({ auth, params, request, response }: HttpContext) {
    try {
      const id = Number(params.id)
      if (Number.isNaN(id)) {
        throw new CertificationServiceError(
          'El identificador de certificación es inválido.',
          CERTIFICATION_ERROR_CODES.VAL_INPUT,
          400
        )
      }
      const prevRow = await this.loadCertificationAuditSnapshot(id)

      const body = await request.validateUsing(updateCertificationValidator)
      const payload = this.toUpsertPayload(body)
      const service = new CertificationService()
      const updated = await service.update(id, payload)

      await this.persistLog(auth, request, service, 'update', prevRow, updated)

      return StandardResponseFormatter.success(
        response,
        updated,
        'Certification',
        'Certificación actualizada correctamente'
      )
    } catch (error) {
      return this.respondError(error, response, 400)
    }
  }

  /**
   * @swagger
   * /api/certifications/{id}:
   *   delete:
   *     summary: Eliminar certificación
   *     tags: [Certifications]
   *     responses:
   *       '204':
   *         description: Sin cuerpo
   *       '404':
   *         description: No encontrado
   */
  async destroy({ auth, params, request, response }: HttpContext) {
    try {
      const id = Number(params.id)
      if (Number.isNaN(id)) {
        throw new CertificationServiceError(
          'El identificador de certificación es inválido.',
          CERTIFICATION_ERROR_CODES.VAL_INPUT,
          400
        )
      }

      const service = new CertificationService()
      const prevRow = await this.loadCertificationAuditSnapshot(id)

      await service.delete(id)

      await this.persistLog(auth, request, service, 'delete', prevRow, {
        deletedCertificationId: id,
      })

      return response.noContent()
    } catch (error) {
      return this.respondError(error, response, 404)
    }
  }

  private respondError(error: unknown, response: HttpContext['response'], fallback: number) {
    if (
      error instanceof CertificationServiceError &&
      error.errorCode === CERTIFICATION_ERROR_CODES.CERTIFICATION_DUPLICATE
    ) {
      return response.status(409).json({
        type: 'error',
        title: 'Certificación duplicada',
        key: 'certificacion-duplicada',
        detail: error.message,
        message: error.message,
        errorCode: error.errorCode,
        data: null,
      })
    }

    const resolved = resolveCertificationApiError(error, fallback)
    return StandardResponseFormatter.error(response, resolved.message, resolved.status, resolved.errorCode)
  }

  private toUpsertPayload(body: Record<string, unknown>): CertificationUpsertPayload {
    const externalRaw = body.externalUrl
    let externalUrl: string | null
    if (
      externalRaw === null ||
      externalRaw === undefined ||
      String(externalRaw).trim() === ''
    ) {
      externalUrl = null
    } else {
      externalUrl = String(externalRaw).trim()
    }

    let renewalPayload: number | null
    const renewalRaw = body.renewalPeriodDays
    if (renewalRaw === null || renewalRaw === undefined) {
      renewalPayload = null
    } else if (renewalRaw === '') {
      renewalPayload = null
    } else {
      renewalPayload = Number(renewalRaw)
    }

    return {
      name: String(body.name),
      categoryId: Number(body.categoryId),
      isExternal: Boolean(body.isExternal),
      externalUrl,
      renewalPeriodDays: renewalPayload,
      businessUnitIds: Array.isArray(body.businessUnitIds)
        ? (body.businessUnitIds as number[])
        : undefined,
    }
  }

  private async persistLog(
    auth: HttpContext['auth'],
    request: HttpContext['request'],
    service: CertificationService,
    verb: string,
    recordPrevious: Record<string, unknown> | null,
    recordCurrent: Record<string, unknown> | null
  ) {
    const userId = auth.user?.userId
    if (!userId) {
      return
    }
    const rawHeaders = request.request.rawHeaders
    const partial = service.createActionLog(rawHeaders, verb)
    await service.saveActionOnLog({
      ...partial,
      user_id: userId,
      ...(recordPrevious ? { record_previous: recordPrevious } : {}),
      record_current: recordCurrent ?? {},
    })
  }

  private async loadCertificationAuditSnapshot(certificationId: number) {
    const cert = await Certification.query()
      .where('certification_id', certificationId)
      .preload('category')
      .preload('businessUnits', (q) => q.whereNull('business_unit_deleted_at'))
      .first()
    return cert ? (serializeCertificationRow(cert) as Record<string, unknown>) : null
  }
}
