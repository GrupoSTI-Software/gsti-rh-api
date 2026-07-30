import type { HttpContext } from '@adonisjs/core/http'
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
import {
  assertComplianceRepsePermission,
  type ComplianceRepseAction,
} from '../helpers/compliance_repse_rbac.js'
import { StandardResponseFormatter } from '../helpers/standard_response_formatter.js'

const MODULE_SLUG = 'repse-registrations'
const RBAC_FORBIDDEN = {
  errorCode: EMPRESA_CONTRATANTE_ERROR_CODES.FORBIDDEN,
  i18nPrefix: 'empresa_contratante',
}

/**
 * Controlador REST del catálogo de empresas contratantes REPSE.
 *
 * Expone CRUD bajo /api/empresas-contratantes con permisos granulares
 * (`read`, `create`, `update`, `delete` o `gestion`) y aislamiento multi-tenant.
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
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string, format: uuid }
   *         description: Código público UUID v4 de la empresa activa
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
   *         schema:
   *           oneOf:
   *             - { type: string, format: uuid }
   *             - { type: integer, minimum: 1 }
   *         description: UUID v4 (preferido) o ID interno legacy; businessScope lo resuelve
   *     responses:
   *       '200':
   *         description: Listado paginado de empresas contratantes
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/EmpresasContratantesListSuccess'
   *       '401':
   *         description: Sin autenticación
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   *       '403':
   *         description: Sin permiso read o gestion (key sin-permiso)
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   *       '400':
   *         description: Validación de filtros de consulta
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   */
  async index(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'read'))) return

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
   *       '200':
   *         description: Detalle de empresa contratante
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/EmpresaContratanteSuccess'
   *       '401':
   *         description: Sin autenticación
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   *       '403':
   *         description: Sin permiso read o gestion (key sin-permiso)
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   *       '404':
   *         description: key empresa-contratante-no-encontrada
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   */
  async show(ctx: HttpContext) {
    const { params, response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'read'))) return

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
   *             $ref: '#/components/schemas/EmpresaContratanteCreate'
   *     responses:
   *       '201':
   *         description: Empresa contratante creada
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/EmpresaContratanteSuccess'
   *       '400':
   *         description: RFC inválido (key rfc-invalido) o validación VineJS
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   *       '401':
   *         description: Sin autenticación
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   *       '403':
   *         description: Sin permiso create o gestion (key sin-permiso)
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   *       '404':
   *         description: Empresa prestadora no encontrada en el tenant
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   *       '409':
   *         description: RFC duplicado (key rfc-duplicado)
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   */
  async store(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'create'))) return

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
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               razonSocial: { type: string, minLength: 3, maxLength: 255 }
   *               rfc: { type: string, minLength: 12, maxLength: 13 }
   *               domicilioFiscal: { type: string, minLength: 10, maxLength: 500 }
   *               representanteLegal: { type: string, nullable: true }
   *               correo: { type: string, format: email, nullable: true }
   *               telefono: { type: string, minLength: 10, maxLength: 20, nullable: true }
   *     responses:
   *       '200':
   *         description: Empresa contratante actualizada
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/EmpresaContratanteSuccess'
   *       '400':
   *         description: Validación VineJS o businessUnitId no modificable
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   *       '401':
   *         description: Sin autenticación
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   *       '403':
   *         description: Sin permiso update o gestion (key sin-permiso)
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   *       '404':
   *         description: key empresa-contratante-no-encontrada
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   *       '409':
   *         description: RFC duplicado (key rfc-duplicado)
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   */
  async update(ctx: HttpContext) {
    const { params, request, response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'update'))) return

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
   *       '204':
   *         description: Eliminado lógicamente (sin cuerpo)
   *       '401':
   *         description: Sin autenticación
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   *       '403':
   *         description: Sin permiso delete o gestion (key sin-permiso)
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   *       '404':
   *         description: key empresa-contratante-no-encontrada
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   *       '409':
   *         description: Empresa con contratos asociados (key empresa-con-contratos-activos)
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   *       '422':
   *         description: Empresa con sitios de servicio ligados (key empresa-con-sitios-ligados)
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   */
  async destroy(ctx: HttpContext) {
    const { params, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'delete'))) return

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

  private async assertHasPermission(ctx: HttpContext, action: ComplianceRepseAction) {
    return assertComplianceRepsePermission(ctx, MODULE_SLUG, action, RBAC_FORBIDDEN)
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
