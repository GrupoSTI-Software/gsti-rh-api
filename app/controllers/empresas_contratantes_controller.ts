import type { HttpContext } from '@adonisjs/core/http'
import RoleService from '#services/role_service'
import EmpresaContratanteService, {
  type EmpresaContratanteCreatePayload,
  type EmpresaContratanteUpdatePayload,
} from '#services/empresa_contratante_service'
import {
  createEmpresaContratanteValidator,
  listEmpresasContratantesValidator,
  updateEmpresaContratanteValidator,
} from '#validators/compliance-repse/empresa_contratante.validator'
import { EMPRESA_CONTRATANTE_ERROR_CODES } from '../constants/empresa_contratante_error_codes.js'
import { EmpresaContratanteError } from '../exceptions/empresa_contratante_error.js'
import { resolveEmpresaContratanteApiError } from '../helpers/empresa_contratante_api_error.js'
import { StandardResponseFormatter } from '../helpers/standard_response_formatter.js'

const MODULE_SLUG = 'compliance-contratantes'

/**
 * Controlador REST del catálogo de empresas contratantes REPSE.
 *
 * Expone CRUD bajo /api/empresas-contratantes con permiso único `gestion`
 * (compliance.contratantes.gestion) y aislamiento multi-tenant por business unit.
 */
export default class EmpresasContratantesController {
  /**
   * @swagger
   * /api/empresas-contratantes:
   *   get:
   *     summary: Lista paginada de empresas contratantes
   *     tags: [EmpresasContratantes]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: page
   *         schema: { type: integer, minimum: 1, default: 1 }
   *       - in: query
   *         name: perPage
   *         schema: { type: integer, minimum: 1, maximum: 500, default: 20 }
   *       - in: query
   *         name: q
   *         schema: { type: string }
   *       - in: query
   *         name: businessUnitId
   *         schema: { type: integer }
   *     responses:
   *       '200': { description: Listado paginado }
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso gestion }
   */
  async index(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx))) return

      const filters = await request.validateUsing(listEmpresasContratantesValidator)
      const service = new EmpresaContratanteService()
      const bundle = await service.listPaginated(
        filters.page ?? 1,
        filters.perPage ?? 20,
        filters.q,
        filters.businessUnitId
      )

      return StandardResponseFormatter.success(
        response,
        bundle,
        i18n.t('empresas_contratantes_title', undefined, 'Empresas Contratantes'),
        i18n.t(
          'empresas_contratantes_listed_successfully',
          undefined,
          'Empresas contratantes obtenidas correctamente'
        )
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/empresas-contratantes/{id}:
   *   get:
   *     summary: Detalle de empresa contratante
   *     tags: [EmpresasContratantes]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200': { description: Detalle encontrado }
   *       '404': { description: key empresa-contratante-no-encontrada }
   */
  async show(ctx: HttpContext) {
    const { params, response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx))) return

      const id = this.parseResourceId(params.id)
      const service = new EmpresaContratanteService()
      const row = await service.findById(id)

      return StandardResponseFormatter.success(
        response,
        row,
        i18n.t('empresa_contratante_title', undefined, 'Empresa Contratante'),
        i18n.t(
          'empresa_contratante_found_successfully',
          undefined,
          'Empresa contratante encontrada correctamente'
        )
      )
    } catch (error) {
      return this.respondError(error, response, 404, i18n)
    }
  }

  /**
   * @swagger
   * /api/empresas-contratantes:
   *   post:
   *     summary: Crear empresa contratante
   *     tags: [EmpresasContratantes]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [businessUnitId, razonSocial, rfc, domicilioFiscal]
   *             properties:
   *               businessUnitId: { type: integer }
   *               razonSocial: { type: string, minLength: 3, maxLength: 255 }
   *               rfc: { type: string, minLength: 12, maxLength: 13 }
   *               domicilioFiscal: { type: string, minLength: 10, maxLength: 500 }
   *               representanteLegal: { type: string, nullable: true }
   *               correo: { type: string, format: email, nullable: true }
   *               telefono: { type: string, minLength: 10, maxLength: 20, nullable: true }
   *     responses:
   *       '201': { description: Creado }
   *       '400': { description: key rfc-invalido }
   *       '409': { description: key rfc-duplicado }
   */
  async store(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx))) return

      const body = await request.validateUsing(createEmpresaContratanteValidator)
      const payload = this.toCreatePayload(body)
      const service = new EmpresaContratanteService()
      const created = await service.create(payload)

      return StandardResponseFormatter.success(
        response,
        created,
        i18n.t('empresa_contratante_title', undefined, 'Empresa Contratante'),
        i18n.t(
          'empresa_contratante_created_successfully',
          undefined,
          'Empresa contratante creada correctamente'
        ),
        201
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/empresas-contratantes/{id}:
   *   patch:
   *     summary: Actualizar empresa contratante
   *     tags: [EmpresasContratantes]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200': { description: Actualizado }
   *       '409': { description: key rfc-duplicado }
   */
  async update(ctx: HttpContext) {
    const { params, request, response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx))) return

      if (request.input('businessUnitId') !== undefined) {
        throw new EmpresaContratanteError(
          'No se permite modificar la unidad de negocio de la empresa contratante.',
          EMPRESA_CONTRATANTE_ERROR_CODES.VAL_INPUT,
          400
        )
      }

      const id = this.parseResourceId(params.id)
      const body = await request.validateUsing(updateEmpresaContratanteValidator)
      const payload = this.toUpdatePayload(body)
      const service = new EmpresaContratanteService()
      const updated = await service.update(id, payload)

      return StandardResponseFormatter.success(
        response,
        updated,
        i18n.t('empresa_contratante_title', undefined, 'Empresa Contratante'),
        i18n.t(
          'empresa_contratante_updated_successfully',
          undefined,
          'Empresa contratante actualizada correctamente'
        )
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/empresas-contratantes/{id}:
   *   delete:
   *     summary: Soft delete de empresa contratante
   *     tags: [EmpresasContratantes]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '204': { description: Eliminado lógicamente }
   */
  async destroy(ctx: HttpContext) {
    const { params, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx))) return

      const id = this.parseResourceId(params.id)
      const service = new EmpresaContratanteService()
      await service.destroy(id)

      return response.noContent()
    } catch (error) {
      return this.respondError(error, response, 404, ctx.i18n)
    }
  }

  private async assertAuthenticated(ctx: HttpContext) {
    await ctx.auth.check()
    if (!ctx.auth.user) {
      ctx.response.status(401).json({
        type: 'error',
        title: ctx.i18n.t('empresa_contratante_unauthorized_title', undefined, 'No autorizado'),
        message: ctx.i18n.t(
          'empresa_contratante_unauthorized_message',
          undefined,
          'Usuario no autenticado'
        ),
        errorCode: EMPRESA_CONTRATANTE_ERROR_CODES.FORBIDDEN,
        data: null,
      })
      return false
    }
    return true
  }

  private async assertHasPermission(ctx: HttpContext) {
    const user = ctx.auth.user!
    await user.preload('role')
    const roleSlug = user.role?.roleSlug
    if (roleSlug === 'root' || roleSlug === 'super-administrador') {
      return true
    }

    const roleService = new RoleService()
    const allowed = await roleService.hasAccess(user.roleId, MODULE_SLUG, 'gestion')
    if (!allowed) {
      ctx.response.status(403).json({
        type: 'error',
        title: ctx.i18n.t('empresa_contratante_forbidden_title', undefined, 'Sin permiso'),
        message: ctx.i18n.t(
          'empresa_contratante_forbidden_message',
          undefined,
          'No tienes permiso para gestionar empresas contratantes.'
        ),
        key: 'sin-permiso',
        errorCode: EMPRESA_CONTRATANTE_ERROR_CODES.FORBIDDEN,
        data: null,
      })
      return false
    }
    return true
  }

  private parseResourceId(raw: unknown) {
    const id = Number(raw)
    if (!Number.isFinite(id) || id <= 0) {
      throw new EmpresaContratanteError(
        'El identificador de la empresa contratante es inválido.',
        EMPRESA_CONTRATANTE_ERROR_CODES.VAL_INPUT,
        400
      )
    }
    return id
  }

  private toCreatePayload(body: Record<string, unknown>): EmpresaContratanteCreatePayload {
    return {
      businessUnitId: Number(body.businessUnitId),
      razonSocial: String(body.razonSocial),
      rfc: String(body.rfc),
      domicilioFiscal: String(body.domicilioFiscal),
      representanteLegal:
        body.representanteLegal === undefined
          ? null
          : (body.representanteLegal as string | null),
      correo: body.correo === undefined ? null : (body.correo as string | null),
      telefono: body.telefono === undefined ? null : (body.telefono as string | null),
    }
  }

  private toUpdatePayload(body: Record<string, unknown>): EmpresaContratanteUpdatePayload {
    const payload: EmpresaContratanteUpdatePayload = {}
    if (body.razonSocial !== undefined) payload.razonSocial = String(body.razonSocial)
    if (body.rfc !== undefined) payload.rfc = String(body.rfc)
    if (body.domicilioFiscal !== undefined) payload.domicilioFiscal = String(body.domicilioFiscal)
    if (body.representanteLegal !== undefined) {
      payload.representanteLegal = body.representanteLegal as string | null
    }
    if (body.correo !== undefined) payload.correo = body.correo as string | null
    if (body.telefono !== undefined) payload.telefono = body.telefono as string | null
    return payload
  }

  private respondError(
    error: unknown,
    response: HttpContext['response'],
    fallback: number,
    i18n: HttpContext['i18n']
  ) {
    const resolved = resolveEmpresaContratanteApiError(error, fallback, i18n)
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
