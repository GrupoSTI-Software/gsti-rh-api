import type { HttpContext } from '@adonisjs/core/http'
import {
  assertComplianceRepsePermission,
  type ComplianceRepseAction,
} from '#helpers/compliance_repse_rbac'
import { REPSE_PROVIDER_ERROR_CODES } from '#constants/repse_provider_error_codes'
import { RepseProviderError } from '#exceptions/repse_provider_error'
import { resolveRepseProviderApiError } from '#helpers/repse_provider_api_error'
import { StandardResponseFormatter } from '#helpers/standard_response_formatter'
import ProvidersService, {
  type ProveedorRepseCreateInput,
  type ProveedorRepseUpdateInput,
} from './providers.service.js'
import {
  createProveedorRepseValidator,
} from './validators/create_provider.validator.js'
import { updateProveedorRepseValidator } from './validators/update_provider.validator.js'
import { listProveedoresRepseValidator } from './validators/list_providers.validator.js'

export const REPSE_PROVIDERS_MODULE_SLUG = 'repse-providers'
const RBAC_FORBIDDEN = {
  errorCode: REPSE_PROVIDER_ERROR_CODES.FORBIDDEN,
  i18nPrefix: 'repse_provider',
}

/**
 * Controlador REST del catálogo de proveedores REPSE del contratante
 * (USRH1784259105646). Expone CRUD bajo /api/repse-providers con permisos
 * granulares (`read`, `create`, `update`, `delete`) y aislamiento multi-tenant.
 */
export default class ProvidersController {
  /**
   * @swagger
   * /api/repse-providers:
   *   get:
   *     summary: Lista paginada del catálogo de proveedores REPSE del tenant
   *     description: |
   *       Devuelve el catálogo de proveedores REPSE de la(s) empresa(s)
   *       contratante(s) del tenant autenticado, con el indicador de próxima
   *       revisión (`nextReviewAt` + `reviewStatus`).
   *
   *       **Contrato i18n:** `title` y `message` varían con `Accept-Language`;
   *       el payload siempre va en `data.proveedoresRepse` (clave estable).
   *     tags: [RepseProviders]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *         description: "Bearer access token."
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string }
   *         description: "Unidad de negocio seleccionada (scope del tenant)."
   *       - in: header
   *         name: Accept-Language
   *         required: false
   *         schema: { type: string, enum: [es, en] }
   *         description: "Traduce title/message; no altera la clave data.proveedoresRepse."
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
   *         required: false
   *         schema: { type: integer, minimum: 1 }
   *     responses:
   *       '200':
   *         description: |
   *           Listado paginado ordenado por fecha de creación descendente.
   *           Con `Accept-Language: en`, title/message cambian pero la clave
   *           del payload permanece `data.proveedoresRepse`.
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Proveedores REPSE
   *               message: Proveedores REPSE obtenidos correctamente
   *               data:
   *                 proveedoresRepse:
   *                   meta: { total: 1, perPage: 20, currentPage: 1, lastPage: 1, page: 1 }
   *                   data:
   *                     - proveedorRepseId: 1
   *                       businessUnitId: 1
   *                       razonSocial: "Servicios Especializados Acme S.A. de C.V."
   *                       rfc: "ASE930101AB1"
   *                       folio: "REPSE-12345"
   *                       objetoRegistrado: "Servicios de limpieza industrial"
   *                       folioVencimiento: "2027-01-01"
   *                       periodicidadMeses: 1
   *                       nextReviewAt: "2026-08-01"
   *                       reviewStatus: on_track
   *                       proveedorRepseCreatedAt: "2026-07-17T10:00:00.000-06:00"
   *                       proveedorRepseUpdatedAt: null
   *             examples:
   *               englishAcceptLanguage:
   *                 summary: "Accept-Language en (misma clave proveedoresRepse)"
   *                 value:
   *                   type: success
   *                   title: REPSE Providers
   *                   message: REPSE providers retrieved successfully
   *                   data:
   *                     proveedoresRepse:
   *                       meta: { total: 1, perPage: 20, currentPage: 1, lastPage: 1, page: 1 }
   *                       data:
   *                         - proveedorRepseId: 1
   *                           businessUnitId: 1
   *                           razonSocial: "Servicios Especializados Acme S.A. de C.V."
   *                           rfc: "ASE930101AB1"
   *                           folio: "REPSE-12345"
   *                           objetoRegistrado: "Servicios de limpieza industrial"
   *                           folioVencimiento: "2027-01-01"
   *                           periodicidadMeses: 1
   *                           nextReviewAt: "2026-08-01"
   *                           reviewStatus: on_track
   *                           proveedorRepseCreatedAt: "2026-07-17T10:00:00.000-06:00"
   *                           proveedorRepseUpdatedAt: null
   *       '400':
   *         description: Validación VineJS (page, limit o businessUnitId inválidos)
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Error
   *               message: The page field must be defined
   *               errorCode: REPSEPROV.VAL.001
   *               data: null
   *       '401':
   *         description: Sin autenticación
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: No autorizado
   *               message: Usuario no autenticado
   *               errorCode: REPSEPROV.FORBID.001
   *               data: null
   *       '403':
   *         description: Sin permiso `read` o `gestion` del módulo
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Sin permiso de consulta
   *               message: No tienes permiso para consultar este módulo.
   *               key: sin-permiso
   *               errorCode: REPSEPROV.FORBID.001
   *               data: null
   *       '404':
   *         description: businessUnitId inexistente o ajeno al tenant (key `empresa-no-encontrada`)
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Error
   *               message: La empresa no existe o no pertenece al tenant actual.
   *               key: empresa-no-encontrada
   *               errorCode: REPSEPROV.NF.BU.001
   *               data: null
   */
  async index(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'read'))) return

      const filters = await request.validateUsing(listProveedoresRepseValidator)
      const service = new ProvidersService()
      const bundle = await service.listByTenant(filters.page, filters.limit, filters.businessUnitId)

      return StandardResponseFormatter.success(
        response,
        bundle,
        i18n.t('repse_provider_title', undefined, 'Proveedores REPSE'),
        i18n.t('repse_provider_listed_successfully', undefined, 'Proveedores REPSE obtenidos correctamente'),
        200,
        'proveedoresRepse'
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/repse-providers/{id}:
   *   get:
   *     summary: Obtener un proveedor REPSE por id
   *     description: |
   *       Payload estable en `data.proveedorRepse` (title/message i18n vía Accept-Language).
   *     tags: [RepseProviders]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string }
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200':
   *         description: Proveedor encontrado
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Proveedor REPSE
   *               message: Proveedor REPSE encontrado correctamente
   *               data:
   *                 proveedorRepse:
   *                   proveedorRepseId: 1
   *                   businessUnitId: 1
   *                   razonSocial: "Servicios Especializados Acme S.A. de C.V."
   *                   rfc: "ASE930101AB1"
   *                   folio: "REPSE-12345"
   *                   objetoRegistrado: "Servicios de limpieza industrial"
   *                   folioVencimiento: "2027-01-01"
   *                   periodicidadMeses: 1
   *                   nextReviewAt: null
   *                   reviewStatus: pending_first_validation
   *                   proveedorRepseCreatedAt: "2026-07-17T10:00:00.000-06:00"
   *                   proveedorRepseUpdatedAt: null
   *       '401':
   *         description: Sin autenticación
   *         content:
   *           application/json:
   *             example: { type: error, title: "No autorizado", message: "Usuario no autenticado", errorCode: REPSEPROV.FORBID.001, data: null }
   *       '403':
   *         description: Sin permiso `read` o `gestion`
   *         content:
   *           application/json:
   *             example: { type: error, title: "Sin permiso de consulta", message: "No tienes permiso para consultar este módulo.", key: sin-permiso, errorCode: REPSEPROV.FORBID.001, data: null }
   *       '404':
   *         description: Proveedor inexistente o ajeno al tenant (key `proveedor-repse-no-encontrado`)
   *         content:
   *           application/json:
   *             example: { type: error, title: "Error", message: "El proveedor REPSE no existe o no pertenece al tenant actual.", key: proveedor-repse-no-encontrado, errorCode: REPSEPROV.NF.PROV.001, data: null }
   */
  async show(ctx: HttpContext) {
    const { params, response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'read'))) return

      const id = this.parseResourceId(params.id)
      const service = new ProvidersService()
      const provider = await service.findById(id)

      return StandardResponseFormatter.success(
        response,
        provider,
        i18n.t('repse_provider_detail_title', undefined, 'Proveedor REPSE'),
        i18n.t('repse_provider_found_successfully', undefined, 'Proveedor REPSE encontrado correctamente'),
        200,
        'proveedorRepse'
      )
    } catch (error) {
      return this.respondError(error, response, 404, i18n)
    }
  }

  /**
   * @swagger
   * /api/repse-providers:
   *   post:
   *     summary: Registrar un proveedor REPSE en el catálogo del contratante
   *     tags: [RepseProviders]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [businessUnitId, razonSocial, rfc, folio, objetoRegistrado, folioVencimiento]
   *             properties:
   *               businessUnitId: { type: integer }
   *               razonSocial: { type: string, maxLength: 255 }
   *               rfc: { type: string, minLength: 12, maxLength: 13 }
   *               folio: { type: string, maxLength: 50 }
   *               objetoRegistrado: { type: string, maxLength: 1000 }
   *               folioVencimiento: { type: string, format: date }
   *               periodicidadMeses: { type: integer, minimum: 1, maximum: 60, default: 1 }
   *     responses:
   *       '201':
   *         description: Proveedor creado
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Proveedor REPSE
   *               message: Proveedor REPSE creado correctamente
   *               data:
   *                 proveedorRepse:
   *                   proveedorRepseId: 1
   *                   businessUnitId: 1
   *                   razonSocial: "Servicios Especializados Acme S.A. de C.V."
   *                   rfc: "ASE930101AB1"
   *                   folio: "REPSE-12345"
   *                   objetoRegistrado: "Servicios de limpieza industrial"
   *                   folioVencimiento: "2027-01-01"
   *                   periodicidadMeses: 1
   *                   nextReviewAt: null
   *                   reviewStatus: pending_first_validation
   *                   proveedorRepseCreatedAt: "2026-07-17T10:00:00.000-06:00"
   *                   proveedorRepseUpdatedAt: null
   *       '401':
   *         description: Sin autenticación
   *         content:
   *           application/json:
   *             example: { type: error, title: "No autorizado", message: "Usuario no autenticado", errorCode: REPSEPROV.FORBID.001, data: null }
   *       '403':
   *         description: Sin permiso `create` o `gestion`
   *         content:
   *           application/json:
   *             example: { type: error, title: "Sin permiso", message: "No tienes permiso para realizar esta operación.", key: sin-permiso, errorCode: REPSEPROV.FORBID.001, data: null }
   *       '404':
   *         description: businessUnitId inexistente o ajeno al tenant
   *         content:
   *           application/json:
   *             example: { type: error, title: "Error", message: "La empresa no existe o no pertenece al tenant actual.", key: empresa-no-encontrada, errorCode: REPSEPROV.NF.BU.001, data: null }
   *       '409':
   *         description: Folio repetido en la misma empresa (key `folio-proveedor-repse-ya-registrado`)
   *         content:
   *           application/json:
   *             example: { type: error, title: "Error", message: "El folio del proveedor REPSE ya está registrado para esta empresa.", key: folio-proveedor-repse-ya-registrado, errorCode: REPSEPROV.CONFLICT.FOLIO.001, data: null }
   *       '422':
   *         description: Validación VineJS (RFC, folio, fechas o campos requeridos) o `folioVencimiento` anterior a hoy (key `folio-vencimiento-pasado`)
   *         content:
   *           application/json:
   *             example: { type: error, title: "Error", message: "Entrada inválida", detail: "El RFC no cumple con el formato del SAT o el dígito verificador es incorrecto.", key: entrada-invalida, data: null }
   */
  async store(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'create'))) return

      const body = await request.validateUsing(createProveedorRepseValidator)
      const payload = this.toCreateInput(body)
      const service = new ProvidersService()
      const created = await service.create(payload)

      return StandardResponseFormatter.success(
        response,
        created,
        i18n.t('repse_provider_detail_title', undefined, 'Proveedor REPSE'),
        i18n.t('repse_provider_created_successfully', undefined, 'Proveedor REPSE creado correctamente'),
        201,
        'proveedorRepse'
      )
    } catch (error) {
      return this.respondError(error, response, 422, i18n)
    }
  }

  /**
   * @swagger
   * /api/repse-providers/{id}:
   *   put:
   *     summary: Actualizar un proveedor REPSE
   *     tags: [RepseProviders]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string }
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
   *               razonSocial: { type: string, maxLength: 255 }
   *               rfc: { type: string, minLength: 12, maxLength: 13 }
   *               folio: { type: string, maxLength: 50 }
   *               objetoRegistrado: { type: string, maxLength: 1000 }
   *               folioVencimiento: { type: string, format: date }
   *               periodicidadMeses: { type: integer, minimum: 1, maximum: 60 }
   *     responses:
   *       '200':
   *         description: Actualizado
   *         content:
   *           application/json:
   *             example: { type: success, title: "Proveedor REPSE", message: "Proveedor REPSE actualizado correctamente", data: { proveedorRepse: { proveedorRepseId: 1, businessUnitId: 1, razonSocial: "Servicios Especializados Acme S.A. de C.V.", rfc: "ASE930101AB1", folio: "REPSE-12345", objetoRegistrado: "Servicios de limpieza industrial", folioVencimiento: "2027-06-01", periodicidadMeses: 1, nextReviewAt: null, reviewStatus: pending_first_validation, proveedorRepseCreatedAt: "2026-07-17T10:00:00.000-06:00", proveedorRepseUpdatedAt: "2026-07-17T11:00:00.000-06:00" } } }
   *       '401':
   *         description: Sin autenticación
   *         content:
   *           application/json:
   *             example: { type: error, title: "No autorizado", message: "Usuario no autenticado", errorCode: REPSEPROV.FORBID.001, data: null }
   *       '403':
   *         description: Sin permiso `update` o `gestion`
   *         content:
   *           application/json:
   *             example: { type: error, title: "Sin permiso", message: "No tienes permiso para realizar esta operación.", key: sin-permiso, errorCode: REPSEPROV.FORBID.001, data: null }
   *       '404':
   *         description: Proveedor o businessUnitId inexistente/ajeno al tenant
   *         content:
   *           application/json:
   *             example: { type: error, title: "Error", message: "El proveedor REPSE no existe o no pertenece al tenant actual.", key: proveedor-repse-no-encontrado, errorCode: REPSEPROV.NF.PROV.001, data: null }
   *       '409':
   *         description: Folio repetido en la misma empresa
   *         content:
   *           application/json:
   *             example: { type: error, title: "Error", message: "El folio del proveedor REPSE ya está registrado para esta empresa.", key: folio-proveedor-repse-ya-registrado, errorCode: REPSEPROV.CONFLICT.FOLIO.001, data: null }
   *       '422':
   *         description: |
   *           Validación VineJS o `folioVencimiento` anterior a hoy (key `folio-vencimiento-pasado`).
   *           Si se cambia `periodicidadMeses`, `nextReviewAt` se recalcula a partir de la última validación.
   *         content:
   *           application/json:
   *             example: { type: error, title: "Error", message: "Entrada inválida", key: entrada-invalida, data: null }
   */
  async update(ctx: HttpContext) {
    const { params, request, response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'update'))) return

      const id = this.parseResourceId(params.id)
      const body = await request.validateUsing(updateProveedorRepseValidator)
      const payload = this.toUpdateInput(body)
      const service = new ProvidersService()
      const updated = await service.update(id, payload)

      return StandardResponseFormatter.success(
        response,
        updated,
        i18n.t('repse_provider_detail_title', undefined, 'Proveedor REPSE'),
        i18n.t('repse_provider_updated_successfully', undefined, 'Proveedor REPSE actualizado correctamente'),
        200,
        'proveedorRepse'
      )
    } catch (error) {
      return this.respondError(error, response, 422, i18n)
    }
  }

  /**
   * @swagger
   * /api/repse-providers/{id}:
   *   delete:
   *     summary: Borrado lógico de un proveedor REPSE
   *     tags: [RepseProviders]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string }
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200':
   *         description: Borrado lógico aplicado
   *         content:
   *           application/json:
   *             example: { type: success, title: "Proveedor REPSE", message: "Proveedor REPSE eliminado correctamente", data: { proveedorRepse: { proveedorRepseId: 1, businessUnitId: 1, razonSocial: "Servicios Especializados Acme S.A. de C.V.", rfc: "ASE930101AB1", folio: "REPSE-12345", objetoRegistrado: "Servicios de limpieza industrial", folioVencimiento: "2027-01-01", periodicidadMeses: 1, nextReviewAt: null, reviewStatus: pending_first_validation, proveedorRepseCreatedAt: "2026-07-17T10:00:00.000-06:00", proveedorRepseUpdatedAt: null } } }
   *       '401':
   *         description: Sin autenticación
   *         content:
   *           application/json:
   *             example: { type: error, title: "No autorizado", message: "Usuario no autenticado", errorCode: REPSEPROV.FORBID.001, data: null }
   *       '403':
   *         description: Sin permiso `delete` o `gestion`
   *         content:
   *           application/json:
   *             example: { type: error, title: "Sin permiso", message: "No tienes permiso para realizar esta operación.", key: sin-permiso, errorCode: REPSEPROV.FORBID.001, data: null }
   *       '404':
   *         description: Proveedor inexistente o ajeno al tenant
   *         content:
   *           application/json:
   *             example: { type: error, title: "Error", message: "El proveedor REPSE no existe o no pertenece al tenant actual.", key: proveedor-repse-no-encontrado, errorCode: REPSEPROV.NF.PROV.001, data: null }
   */
  async destroy(ctx: HttpContext) {
    const { params, response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'delete'))) return

      const id = this.parseResourceId(params.id)
      const service = new ProvidersService()
      const deleted = await service.destroy(id)

      return StandardResponseFormatter.success(
        response,
        deleted,
        i18n.t('repse_provider_detail_title', undefined, 'Proveedor REPSE'),
        i18n.t('repse_provider_deleted_successfully', undefined, 'Proveedor REPSE eliminado correctamente'),
        200,
        'proveedorRepse'
      )
    } catch (error) {
      return this.respondError(error, response, 404, i18n)
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async assertAuthenticated(ctx: HttpContext) {
    await ctx.auth.check()
    if (!ctx.auth.user) {
      ctx.response.status(401).json({
        type: 'error',
        title: ctx.i18n.t('repse_provider_unauthorized_title', undefined, 'No autorizado'),
        message: ctx.i18n.t('repse_provider_unauthorized_message', undefined, 'Usuario no autenticado'),
        errorCode: REPSE_PROVIDER_ERROR_CODES.FORBIDDEN,
        data: null,
      })
      return false
    }
    return true
  }

  private async assertHasPermission(ctx: HttpContext, action: ComplianceRepseAction) {
    return assertComplianceRepsePermission(ctx, REPSE_PROVIDERS_MODULE_SLUG, action, RBAC_FORBIDDEN)
  }

  private parseResourceId(raw: unknown) {
    const id = Number(raw)
    if (!Number.isFinite(id) || id <= 0) {
      throw new RepseProviderError(
        'El identificador del proveedor REPSE es inválido.',
        REPSE_PROVIDER_ERROR_CODES.VAL_INPUT,
        422,
        'entrada-invalida'
      )
    }
    return id
  }

  private toCreateInput(body: Record<string, unknown>): ProveedorRepseCreateInput {
    return {
      businessUnitId: Number(body.businessUnitId),
      razonSocial: String(body.razonSocial),
      rfc: String(body.rfc),
      folio: String(body.folio),
      objetoRegistrado: String(body.objetoRegistrado),
      folioVencimiento: this.dateLikeToIso(body.folioVencimiento),
      periodicidadMeses: body.periodicidadMeses !== undefined ? Number(body.periodicidadMeses) : undefined,
    }
  }

  private toUpdateInput(body: Record<string, unknown>): ProveedorRepseUpdateInput {
    const payload: ProveedorRepseUpdateInput = {}
    if (body.businessUnitId !== undefined) payload.businessUnitId = Number(body.businessUnitId)
    if (body.razonSocial !== undefined) payload.razonSocial = String(body.razonSocial)
    if (body.rfc !== undefined) payload.rfc = String(body.rfc)
    if (body.folio !== undefined) payload.folio = String(body.folio)
    if (body.objetoRegistrado !== undefined) payload.objetoRegistrado = String(body.objetoRegistrado)
    if (body.folioVencimiento !== undefined) {
      payload.folioVencimiento = this.dateLikeToIso(body.folioVencimiento)
    }
    if (body.periodicidadMeses !== undefined) payload.periodicidadMeses = Number(body.periodicidadMeses)
    return payload
  }

  /** Vine convierte `vine.date()` a un `Date` JS; se normaliza a `YYYY-MM-DD`. */
  private dateLikeToIso(value: unknown): string {
    if (value instanceof Date) {
      return value.toISOString().substring(0, 10)
    }
    return String(value)
  }

  private respondError(
    error: unknown,
    response: HttpContext['response'],
    fallback: number,
    i18n: HttpContext['i18n']
  ) {
    const resolved = resolveRepseProviderApiError(error, fallback, i18n)
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
