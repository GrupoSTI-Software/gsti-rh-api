import type { HttpContext } from '@adonisjs/core/http'
import RepseRegistrationService, {
  type RepseRegistrationCreatePayload,
  type RepseRegistrationUpdatePayload,
} from '#services/repse_registration_service'
import RepseFolioAvisoService from '#services/repse_folio_aviso_service'
import {
  createRepseRegistrationValidator,
  repseRegistrationListValidator,
  updateRepseRegistrationValidator,
} from '#validators/repse_registration'
import type { RepseRegistrationStatus } from '#models/repse_registration'
import { REPSE_ERROR_CODES } from '../constants/repse_registration_error_codes.js'
import { RepseRegistrationError } from '../exceptions/repse_registration_error.js'
import { resolveRepseRegistrationApiError } from '../helpers/repse_registration_api_error.js'
import {
  assertComplianceRepsePermission,
  type ComplianceRepseAction,
} from '../helpers/compliance_repse_rbac.js'
import { StandardResponseFormatter } from '../helpers/standard_response_formatter.js'

const MODULE_SLUG = 'repse-registrations'
const RBAC_FORBIDDEN = {
  errorCode: REPSE_ERROR_CODES.FORBIDDEN,
  i18nPrefix: 'repse_registration',
}

/**
 * Controlador REST del catálogo Repse de cada empresa.
 *
 * Expone CRUD completo bajo /api/repse-registrations con permisos granulares
 * (`read`, `create`, `update`, `delete` o `gestion`) y aislamiento multi-tenant.
 */
export default class RepseRegistrationsController {
  /**
   * @swagger
   * /api/repse-registrations:
   *   get:
   *     summary: Lista paginada de Repse filtrada por empresa
   *     tags: [RepseRegistrations]
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
   *         name: businessUnitId
   *         required: true
   *         schema: { type: integer, minimum: 1 }
   *     responses:
   *       '200': { description: Listado paginado ordenado por registeredAt DESC }
   *       '400': { description: Validación inválida (page, limit, businessUnitId) }
   *       '401': { description: Sin autenticación }
   *       '404':
   *         description: Empresa inexistente o ajena al tenant (key `empresa-no-encontrada`)
   */
  async index(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'read'))) return

      const filters = await request.validateUsing(repseRegistrationListValidator)
      const service = new RepseRegistrationService()
      const bundle = await service.listByBusinessUnit(
        filters.page,
        filters.limit,
        filters.businessUnitId
      )

      return StandardResponseFormatter.success(
        response,
        bundle,
        i18n.t('repse_registrations_title', undefined, 'Repse'),
        i18n.t(
          'repse_registrations_listed_successfully',
          undefined,
          'Repse obtenidos correctamente'
        )
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/repse-registrations/{id}:
   *   get:
   *     summary: Obtener un registro REPSE por id
   *     tags: [RepseRegistrations]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200': { description: Registro encontrado }
   *       '401': { description: Sin autenticación }
   *       '404':
   *         description: Recurso ajeno o inexistente (key `repse-no-encontrado`)
   */
  async show(ctx: HttpContext) {
    const { params, response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'read'))) return

      const id = this.parseResourceId(params.id)
      const service = new RepseRegistrationService()
      const registration = await service.findById(id)

      return StandardResponseFormatter.success(
        response,
        registration,
        i18n.t('repse_registration_title', undefined, 'Repse Registration'),
        i18n.t(
          'repse_registration_found_successfully',
          undefined,
          'Registro REPSE encontrado correctamente'
        )
      )
    } catch (error) {
      return this.respondError(error, response, 404, i18n)
    }
  }

  /**
   * @swagger
   * /api/repse-registrations:
   *   post:
   *     summary: Crear un registro REPSE para una empresa
   *     tags: [RepseRegistrations]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - businessUnitId
   *               - folio
   *               - registeredAt
   *               - expiresAt
   *             properties:
   *               businessUnitId: { type: integer }
   *               folio:
   *                 type: string
   *                 minLength: 1
   *                 maxLength: 50
   *               registeredAt: { type: string, format: date }
   *               expiresAt: { type: string, format: date }
   *               status:
   *                 type: string
   *                 enum: [active]
   *     responses:
   *       '201': { description: Creado }
   *       '400':
   *         description: Validación VineJS o expiresAt <= registeredAt (key `fechas-invalidas`)
   *       '401': { description: Sin autenticación }
   *       '404':
   *         description: Empresa inexistente o ajena al tenant (key `empresa-no-encontrada`)
   *       '409':
   *         description: Folio repetido en la misma empresa (key `folio-repse-ya-registrado`)
   */
  async store(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'create'))) return

      const body = await request.validateUsing(createRepseRegistrationValidator)
      const payload = this.toCreatePayload(body)
      const service = new RepseRegistrationService()
      const created = await service.create(payload)

      return StandardResponseFormatter.success(
        response,
        created,
        i18n.t('repse_registration_title', undefined, 'Repse Registration'),
        i18n.t(
          'repse_registration_created_successfully',
          undefined,
          'Registro REPSE creado correctamente'
        ),
        201
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/repse-registrations/{id}:
   *   put:
   *     summary: Actualizar un registro REPSE
   *     tags: [RepseRegistrations]
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
   *               businessUnitId: { type: integer }
   *               folio:
   *                 type: string
   *                 minLength: 1
   *                 maxLength: 50
   *               registeredAt: { type: string, format: date }
   *               expiresAt: { type: string, format: date }
   *               status:
   *                 type: string
   *                 enum: [active]
   *     responses:
   *       '200': { description: Actualizado }
   *       '400':
   *         description: Validación VineJS o coherencia de fechas (key `fechas-invalidas`)
   *       '401': { description: Sin autenticación }
   *       '404':
   *         description: Recurso ajeno o inexistente (key `repse-no-encontrado` o `empresa-no-encontrada`)
   *       '409':
   *         description: Folio repetido en la misma empresa (key `folio-repse-ya-registrado`)
   */
  async update(ctx: HttpContext) {
    const { params, request, response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'update'))) return

      const id = this.parseResourceId(params.id)
      const body = await request.validateUsing(updateRepseRegistrationValidator)
      const payload = this.toUpdatePayload(body)
      const service = new RepseRegistrationService()
      const updated = await service.update(id, payload)

      return StandardResponseFormatter.success(
        response,
        updated,
        i18n.t('repse_registration_title', undefined, 'Repse Registration'),
        i18n.t(
          'repse_registration_updated_successfully',
          undefined,
          'Registro REPSE actualizado correctamente'
        )
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/repse-registrations/{id}:
   *   delete:
   *     summary: Soft delete del registro REPSE
   *     tags: [RepseRegistrations]
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
   *         description: Recurso ajeno o inexistente (key `repse-no-encontrado`)
   */
  async destroy(ctx: HttpContext) {
    const { params, response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'delete'))) return

      const id = this.parseResourceId(params.id)
      const service = new RepseRegistrationService()
      const deleted = await service.destroy(id)

      return StandardResponseFormatter.success(
        response,
        deleted,
        i18n.t('repse_registration_title', undefined, 'Repse Registration'),
        i18n.t(
          'repse_registration_deleted_successfully',
          undefined,
          'Registro REPSE eliminado correctamente'
        )
      )
    } catch (error) {
      return this.respondError(error, response, 404, i18n)
    }
  }

  /**
   * @swagger
   * /api/repse-registrations/notifications/run-expiring-check:
   *   post:
   *     summary: Ejecuta manualmente la verificación de avisos de vigencia del folio REPSE
   *     description: |
   *       Endpoint de **prueba/reproceso** que dispara la misma rutina que el
   *       comando agendado `repse:notify-folio-expiring`. Detecta registros
   *       REPSE activos con avisos de renovación (90 días antes de expiresAt)
   *       o informativa (15 días antes del 17 ene/may/sep) pendientes, agrupa
   *       por empresa y envía un correo a los destinatarios configurados en
   *       `system_setting_notification_emails`.
   *
   *       Es **idempotente** y **global segmentado por empresa** (no acotado
   *       a la unidad seleccionada en el header). Requiere permiso `update`
   *       en el módulo `repse-registrations`.
   *     tags: [RepseRegistrations]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       '200':
   *         description: Verificación ejecutada correctamente
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type: { type: string, example: success }
   *                 title: { type: string }
   *                 message: { type: string }
   *                 data:
   *                   type: object
   *                   properties:
   *                     sentCount:
   *                       type: integer
   *                       description: Avisos para los que SÍ se registró un envío.
   *                     skippedAlreadyNotified:
   *                       type: integer
   *                       description: Avisos elegibles omitidos por idempotencia.
   *                     companiesWithoutRecipients:
   *                       type: array
   *                       items: { type: integer }
   *                       description: IDs de SystemSetting sin destinatarios configurados.
   *                     companiesWithMailErrors:
   *                       type: array
   *                       items: { type: integer }
   *                       description: IDs de SystemSetting donde el envío del correo falló.
   *                     companiesNotified:
   *                       type: integer
   *                       description: Empresas que recibieron al menos un correo.
   *                     candidatesScanned:
   *                       type: integer
   *                       description: Avisos elegibles antes del filtro de idempotencia.
   *                     ranAt:
   *                       type: string
   *                       format: date-time
   *       '401':
   *         description: Sin autenticación
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type: { type: string, example: error }
   *                 title: { type: string }
   *                 message: { type: string }
   *                 errorCode: { type: string }
   *                 data: { nullable: true }
   *       '403':
   *         description: Sin permiso update en repse-registrations
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type: { type: string, example: error }
   *                 title: { type: string }
   *                 message: { type: string }
   *                 detail: { type: string }
   *                 key: { type: string, example: sin-permiso }
   *                 errorCode: { type: string, example: REPSE.FORBID.001 }
   *                 data: { nullable: true }
   *       '500':
   *         description: Error no clasificado
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type: { type: string, example: error }
   *                 title: { type: string }
   *                 message: { type: string }
   *                 errorCode: { type: string, example: REPSE.SYS.001 }
   *                 data: { nullable: true }
   */
  async runExpiringCheck(ctx: HttpContext) {
    const { response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'update'))) return

      const service = new RepseFolioAvisoService()
      const result = await service.runExpiringCheck({
        info: (m, meta) =>
          // eslint-disable-next-line no-console
          console.info(`[repse:notify-folio-expiring] ${m}`, meta ?? ''),
        warn: (m, meta) =>
          // eslint-disable-next-line no-console
          console.warn(`[repse:notify-folio-expiring] ${m}`, meta ?? ''),
        error: (m, meta) =>
          // eslint-disable-next-line no-console
          console.error(`[repse:notify-folio-expiring] ${m}`, meta ?? ''),
      })

      return StandardResponseFormatter.success(
        response,
        result,
        i18n.t('repse_registration_title', undefined, 'Repse Registration'),
        i18n.t(
          'repse_folio_expiring_notification_run_success',
          undefined,
          'Verificación de avisos de vigencia del folio REPSE ejecutada correctamente'
        )
      )
    } catch (error) {
      return this.respondError(error, response, 500, i18n)
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
        title: ctx.i18n.t('repse_unauthorized_title', undefined, 'No autorizado'),
        message: ctx.i18n.t('repse_unauthorized_message', undefined, 'Usuario no autenticado'),
        errorCode: REPSE_ERROR_CODES.FORBIDDEN,
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
      throw new RepseRegistrationError(
        'El identificador del registro REPSE es inválido.',
        REPSE_ERROR_CODES.VAL_INPUT,
        400
      )
    }
    return id
  }

  private toCreatePayload(body: Record<string, unknown>): RepseRegistrationCreatePayload {
    return {
      businessUnitId: Number(body.businessUnitId),
      folio: String(body.folio),
      registeredAt: this.dateLikeToIso(body.registeredAt),
      expiresAt: this.dateLikeToIso(body.expiresAt),
      status: body.status as RepseRegistrationStatus | undefined,
    }
  }

  private toUpdatePayload(body: Record<string, unknown>): RepseRegistrationUpdatePayload {
    const payload: RepseRegistrationUpdatePayload = {}
    if (body.businessUnitId !== undefined) {
      payload.businessUnitId = Number(body.businessUnitId)
    }
    if (body.folio !== undefined) {
      payload.folio = String(body.folio)
    }
    if (body.registeredAt !== undefined) {
      payload.registeredAt = this.dateLikeToIso(body.registeredAt)
    }
    if (body.expiresAt !== undefined) {
      payload.expiresAt = this.dateLikeToIso(body.expiresAt)
    }
    if (body.status !== undefined) {
      payload.status = body.status as RepseRegistrationStatus
    }
    return payload
  }

  /**
   * Vine convierte `vine.date()` a un `Date` JS. Lo normalizamos al formato
   * `YYYY-MM-DD` que consume el servicio.
   */
  private dateLikeToIso(value: unknown): string {
    if (value instanceof Date) {
      const iso = value.toISOString()
      return iso.substring(0, 10)
    }
    return String(value)
  }

  private respondError(
    error: unknown,
    response: HttpContext['response'],
    fallback: number,
    i18n: HttpContext['i18n']
  ) {
    const resolved = resolveRepseRegistrationApiError(error, fallback, i18n)
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
