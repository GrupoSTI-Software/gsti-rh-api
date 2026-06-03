import type { HttpContext } from '@adonisjs/core/http'
import RepseSpecializedServiceService, {
  type RepseSpecializedServiceCreatePayload,
  type RepseSpecializedServiceUpdatePayload,
} from '#services/repse_specialized_service_service'
import {
  createRepseSpecializedServiceValidator,
  repseSpecializedServiceListValidator,
  updateRepseSpecializedServiceValidator,
} from '#validators/repse_specialized_service'
import type { RepseSpecializedServiceStatus } from '#models/repse_specialized_service'
import { REPSE_SPECIALIZED_SERVICE_ERROR_CODES } from '../constants/repse_specialized_service_error_codes.js'
import { RepseSpecializedServiceError } from '../exceptions/repse_specialized_service_error.js'
import { resolveRepseSpecializedServiceApiError } from '../helpers/repse_specialized_service_api_error.js'
import {
  assertComplianceRepsePermission,
  type ComplianceRepseAction,
} from '../helpers/compliance_repse_rbac.js'
import { StandardResponseFormatter } from '../helpers/standard_response_formatter.js'

const MODULE_SLUG = 'repse-registrations'
const RBAC_FORBIDDEN = {
  errorCode: REPSE_SPECIALIZED_SERVICE_ERROR_CODES.FORBIDDEN,
  i18nPrefix: 'repse_specialized_service',
}

/**
 * Controlador REST del catálogo de servicios especializados REPSE.
 *
 * Expone CRUD bajo /api/repse-specialized-services con permisos del módulo
 * `repse-registrations` (`read`, `create`, `update`, `delete` o `gestion`).
 */
export default class RepseSpecializedServicesController {
  /**
   * @swagger
   * /api/repse-specialized-services:
   *   get:
   *     summary: Lista paginada de servicios especializados de un registro REPSE
   *     tags: [RepseSpecializedServices]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: page
   *         required: true
   *         schema: { type: integer, minimum: 1 }
   *       - in: query
   *         name: limit
   *         required: true
   *         schema: { type: integer, minimum: 1, maximum: 500 }
   *       - in: query
   *         name: repseRegistrationId
   *         required: true
   *         schema: { type: integer, minimum: 1 }
   *     responses:
   *       '200': { description: Listado paginado ordenado por createdAt DESC }
   *       '400': { description: Validación inválida (page, limit, repseRegistrationId) }
   *       '401': { description: Sin autenticación }
   *       '404':
   *         description: Registro REPSE padre ajeno o inexistente (key `registro-repse-no-encontrado`)
   */
  async index(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'read'))) return

      const filters = await request.validateUsing(repseSpecializedServiceListValidator)
      const service = new RepseSpecializedServiceService()
      const bundle = await service.listByRepseRegistration(
        filters.page,
        filters.limit,
        filters.repseRegistrationId
      )

      return StandardResponseFormatter.success(
        response,
        bundle,
        i18n.t('repse_specialized_services_title', undefined, 'Repse Specialized Services'),
        i18n.t(
          'repse_specialized_services_listed_successfully',
          undefined,
          'Servicios especializados REPSE obtenidos correctamente'
        )
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/repse-specialized-services/{id}:
   *   get:
   *     summary: Obtener un servicio especializado por id
   *     tags: [RepseSpecializedServices]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200': { description: Servicio encontrado }
   *       '401': { description: Sin autenticación }
   *       '404':
   *         description: Servicio ajeno o inexistente (key `servicio-especializado-no-encontrado`)
   */
  async show(ctx: HttpContext) {
    const { params, response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'read'))) return

      const id = this.parseResourceId(params.id)
      const service = new RepseSpecializedServiceService()
      const item = await service.findById(id)

      return StandardResponseFormatter.success(
        response,
        item,
        i18n.t('repse_specialized_service_title', undefined, 'Repse Specialized Service'),
        i18n.t(
          'repse_specialized_service_found_successfully',
          undefined,
          'Servicio especializado REPSE encontrado correctamente'
        )
      )
    } catch (error) {
      return this.respondError(error, response, 404, i18n)
    }
  }

  /**
   * @swagger
   * /api/repse-specialized-services:
   *   post:
   *     summary: Crear un servicio especializado bajo un registro REPSE
   *     tags: [RepseSpecializedServices]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - repseRegistrationId
   *               - name
   *               - objectDescription
   *             properties:
   *               repseRegistrationId: { type: integer }
   *               name:
   *                 type: string
   *                 minLength: 3
   *                 maxLength: 150
   *               objectDescription:
   *                 type: string
   *                 minLength: 1
   *               status:
   *                 type: string
   *                 enum: [active]
   *     responses:
   *       '201': { description: Creado }
   *       '400': { description: Validación VineJS (p.ej. sin name) }
   *       '401': { description: Sin autenticación }
   *       '404':
   *         description: Registro REPSE padre ajeno o inexistente (key `registro-repse-no-encontrado`)
   *       '409':
   *         description: Nombre duplicado dentro de la misma empresa (key `nombre-servicio-especializado-ya-registrado`, errorCode `REPSE.SVC.DUP.001`)
   */
  async store(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'create'))) return

      const body = await request.validateUsing(createRepseSpecializedServiceValidator)
      const payload = this.toCreatePayload(body)
      const service = new RepseSpecializedServiceService()
      const created = await service.create(payload)

      return StandardResponseFormatter.success(
        response,
        created,
        i18n.t('repse_specialized_service_title', undefined, 'Repse Specialized Service'),
        i18n.t(
          'repse_specialized_service_created_successfully',
          undefined,
          'Servicio especializado REPSE creado correctamente'
        ),
        201
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/repse-specialized-services/{id}:
   *   put:
   *     summary: Actualizar un servicio especializado
   *     tags: [RepseSpecializedServices]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               repseRegistrationId: { type: integer }
   *               name:
   *                 type: string
   *                 minLength: 3
   *                 maxLength: 150
   *               objectDescription:
   *                 type: string
   *                 minLength: 1
   *               status:
   *                 type: string
   *                 enum: [active]
   *     responses:
   *       '200': { description: Actualizado }
   *       '400': { description: Validación VineJS }
   *       '401': { description: Sin autenticación }
   *       '404':
   *         description: Recurso ajeno o inexistente (key `servicio-especializado-no-encontrado` o `registro-repse-no-encontrado`)
   *       '409':
   *         description: Nombre duplicado dentro de la misma empresa (key `nombre-servicio-especializado-ya-registrado`, errorCode `REPSE.SVC.DUP.001`)
   */
  async update(ctx: HttpContext) {
    const { params, request, response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'update'))) return

      const id = this.parseResourceId(params.id)
      const body = await request.validateUsing(updateRepseSpecializedServiceValidator)
      const payload = this.toUpdatePayload(body)
      const service = new RepseSpecializedServiceService()
      const updated = await service.update(id, payload)

      return StandardResponseFormatter.success(
        response,
        updated,
        i18n.t('repse_specialized_service_title', undefined, 'Repse Specialized Service'),
        i18n.t(
          'repse_specialized_service_updated_successfully',
          undefined,
          'Servicio especializado REPSE actualizado correctamente'
        )
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/repse-specialized-services/{id}:
   *   delete:
   *     summary: Soft delete del servicio especializado
   *     tags: [RepseSpecializedServices]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200': { description: Borrado lógico aplicado }
   *       '401': { description: Sin autenticación }
   *       '404':
   *         description: Recurso ajeno o inexistente (key `servicio-especializado-no-encontrado`)
   */
  async destroy(ctx: HttpContext) {
    const { params, response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'delete'))) return

      const id = this.parseResourceId(params.id)
      const service = new RepseSpecializedServiceService()
      const deleted = await service.destroy(id)

      return StandardResponseFormatter.success(
        response,
        deleted,
        i18n.t('repse_specialized_service_title', undefined, 'Repse Specialized Service'),
        i18n.t(
          'repse_specialized_service_deleted_successfully',
          undefined,
          'Servicio especializado REPSE eliminado correctamente'
        )
      )
    } catch (error) {
      return this.respondError(error, response, 404, i18n)
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Devuelve `true` si el usuario está autenticado; en caso contrario emite 401. */
  private async assertAuthenticated(ctx: HttpContext) {
    await ctx.auth.check()
    if (!ctx.auth.user) {
      ctx.response.status(401).json({
        type: 'error',
        title: ctx.i18n.t(
          'repse_specialized_service_unauthorized_title',
          undefined,
          'No autorizado'
        ),
        message: ctx.i18n.t(
          'repse_specialized_service_unauthorized_message',
          undefined,
          'Usuario no autenticado'
        ),
        errorCode: REPSE_SPECIALIZED_SERVICE_ERROR_CODES.FORBIDDEN,
        data: null,
      })
      return false
    }
    return true
  }

  private async assertHasPermission(ctx: HttpContext, action: ComplianceRepseAction) {
    return assertComplianceRepsePermission(ctx, MODULE_SLUG, action, RBAC_FORBIDDEN)
  }

  private parseResourceId(raw: unknown) {
    const id = Number(raw)
    if (!Number.isFinite(id) || id <= 0) {
      throw new RepseSpecializedServiceError(
        'El identificador del servicio especializado es inválido.',
        REPSE_SPECIALIZED_SERVICE_ERROR_CODES.VAL_INPUT,
        400
      )
    }
    return id
  }

  private toCreatePayload(body: Record<string, unknown>): RepseSpecializedServiceCreatePayload {
    return {
      repseRegistrationId: Number(body.repseRegistrationId),
      name: String(body.name),
      objectDescription: String(body.objectDescription),
      status: body.status as RepseSpecializedServiceStatus | undefined,
    }
  }

  private toUpdatePayload(body: Record<string, unknown>): RepseSpecializedServiceUpdatePayload {
    const payload: RepseSpecializedServiceUpdatePayload = {}
    if (body.repseRegistrationId !== undefined) {
      payload.repseRegistrationId = Number(body.repseRegistrationId)
    }
    if (body.name !== undefined) {
      payload.name = String(body.name)
    }
    if (body.objectDescription !== undefined) {
      payload.objectDescription = String(body.objectDescription)
    }
    if (body.status !== undefined) {
      payload.status = body.status as RepseSpecializedServiceStatus
    }
    return payload
  }

  private respondError(
    error: unknown,
    response: HttpContext['response'],
    fallback: number,
    i18n: HttpContext['i18n']
  ) {
    const resolved = resolveRepseSpecializedServiceApiError(error, fallback, i18n)
    const body: Record<string, unknown> = {
      type: 'error',
      title: resolved.title,
      message: resolved.message,
      errorCode: resolved.errorCode,
      data: null,
    }
    if (resolved.key) {
      body.key = resolved.key
      body.detail = resolved.message
    }
    return response.status(resolved.status).json(body)
  }
}
