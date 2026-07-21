import type { HttpContext } from '@adonisjs/core/http'
import type { MessagesProviderContact, FieldContext } from '@vinejs/vine/types'
import {
  assertComplianceRepsePermission,
  type ComplianceRepseAction,
} from '#helpers/compliance_repse_rbac'
import { REPSE_PROVIDER_ERROR_CODES } from '#constants/repse_provider_error_codes'
import { RepseProviderError } from '#exceptions/repse_provider_error'
import { resolveRepseProviderApiError } from '#helpers/repse_provider_api_error'
import { StandardResponseFormatter } from '#helpers/standard_response_formatter'
import { REPSE_PROVIDERS_MODULE_SLUG } from '../providers/providers.controller.js'
import ValidationsService from './validations.service.js'
import { createProveedorRepseValidacionValidator } from './validators/create_validation.validator.js'

const RBAC_FORBIDDEN = {
  errorCode: REPSE_PROVIDER_ERROR_CODES.FORBIDDEN,
  i18nPrefix: 'repse_provider',
}

/**
 * Bit?cora de validaciones peri?dicas del folio de un proveedor REPSE
 * (USRH1784259105646). Append-only: solo `index` (listar) y `store` (alta
 * con evidencia); nunca se edita ni se borra un registro. `download`
 * es la contraparte de lectura de la evidencia adjuntada en `store`.
 */
export default class ValidationsController {
  /**
   * @swagger
   * /api/repse-providers/{providerId}/validations:
   *   get:
   *     summary: Bit?cora completa de validaciones de un proveedor REPSE
   *     description: |
   *       Payload estable en `data.validaciones` (title/message i18n vía Accept-Language).
   *     tags: [RepseProviderValidations]
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
   *         name: providerId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200':
   *         description: Listado cronol?gico descendente (m?s reciente primero)
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Validaciones de Proveedor REPSE
   *               message: Validaciones obtenidas correctamente
   *               data:
   *                 validaciones:
   *                   - proveedorRepseValidacionId: 1
   *                     proveedorRepseId: 1
   *                     businessUnitId: 1
   *                     estatus: vigente
   *                     fecha: "2026-07-01"
   *                     autorUserId: 5
   *                     evidenciaNombreArchivo: "captura-repse.pdf"
   *                     evidenciaMimeType: "application/pdf"
   *                     evidenciaTamanoBytes: 245678
   *                     proveedorRepseValidacionCreatedAt: "2026-07-01T09:00:00.000-06:00"
   *       '401':
   *         description: Sin autenticaci?n
   *         content:
   *           application/json:
   *             example: { type: error, title: "No autorizado", message: "Usuario no autenticado", errorCode: REPSEPROV.FORBID.001, data: null }
   *       '403':
   *         description: Sin permiso `read` o `gestion`
   *         content:
   *           application/json:
   *             example: { type: error, title: "Sin permiso de consulta", message: "No tienes permiso para consultar este m?dulo.", key: sin-permiso, errorCode: REPSEPROV.FORBID.001, data: null }
   *       '404':
   *         description: Proveedor inexistente o ajeno al tenant
   *         content:
   *           application/json:
   *             example: { type: error, title: "Error", message: "El proveedor REPSE no existe o no pertenece al tenant actual.", key: proveedor-repse-no-encontrado, errorCode: REPSEPROV.NF.PROV.001, data: null }
   */
  async index(ctx: HttpContext) {
    const { params, response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'read'))) return

      const providerId = this.parseProviderId(params.providerId)
      const service = new ValidationsService()
      const validaciones = await service.listByProveedor(providerId)

      return StandardResponseFormatter.success(
        response,
        validaciones,
        i18n.t('repse_provider_validation_title', undefined, 'Validaciones de Proveedor REPSE'),
        i18n.t(
          'repse_provider_validation_listed_successfully',
          undefined,
          'Validaciones obtenidas correctamente'
        ),
        200,
        'validaciones'
      )
    } catch (error) {
      return this.respondError(error, response, 404, i18n)
    }
  }

  /**
   * @swagger
   * /api/repse-providers/{providerId}/validations/{validationId}/download:
   *   get:
   *     summary: Descargar la evidencia (captura del padr?n REPSE) de una validaci?n
   *     description: |
   *       Hace stream del archivo de evidencia adjuntado al registrar la validaci?n
   *       (`POST .../validations`). Es la contraparte de lectura necesaria para poder
   *       demostrar diligencia ante una auditor?a: guardar la evidencia sin poder
   *       recuperarla despu?s no cumple ese prop?sito.
   *     tags: [RepseProviderValidations]
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
   *         name: providerId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: validationId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200':
   *         description: Stream del archivo de evidencia (Content-Type application/pdf|image/png|image/jpeg, Content-Disposition attachment)
   *         content:
   *           application/octet-stream:
   *             schema:
   *               type: string
   *               format: binary
   *       '401':
   *         description: Sin autenticaci?n
   *         content:
   *           application/json:
   *             example: { type: error, title: "No autorizado", message: "Usuario no autenticado", errorCode: REPSEPROV.FORBID.001, data: null }
   *       '403':
   *         description: Sin permiso `read` o `gestion`
   *         content:
   *           application/json:
   *             example: { type: error, title: "Sin permiso de consulta", message: "No tienes permiso para consultar este m?dulo.", key: sin-permiso, errorCode: REPSEPROV.FORBID.001, data: null }
   *       '404':
   *         description: Proveedor, validaci?n o archivo de evidencia inexistente (key `proveedor-repse-no-encontrado`, `validacion-no-encontrada` o `evidencia-invalida`)
   *         content:
   *           application/json:
   *             example: { type: error, title: "Validaci?n no encontrada", message: "La validaci?n indicada no existe o no pertenece a este proveedor REPSE.", key: validacion-no-encontrada, errorCode: REPSEPROV.NF.VAL.001, data: null }
   */
  async download(ctx: HttpContext) {
    const { params, response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'read'))) return

      const providerId = this.parseProviderId(params.providerId)
      const validationId = this.parseValidationId(params.validationId)

      const service = new ValidationsService()
      const { validacion, object } = await service.getEvidenceStream(providerId, validationId)

      const safeName = validacion.evidenciaNombreArchivo.replace(/[^\w.\- ]/g, '_')
      response.header('Content-Type', object.contentType || validacion.evidenciaMimeType)
      response.header('Content-Disposition', `attachment; filename="${safeName}"`)
      response.header('Cache-Control', 'private, no-store')
      if (object.contentLength !== undefined) {
        response.header('Content-Length', String(object.contentLength))
      }
      if (object.etag) {
        response.header('ETag', object.etag)
      }
      if (object.lastModified) {
        response.header('Last-Modified', object.lastModified.toUTCString())
      }

      response.status(200)
      return response.stream(object.stream)
    } catch (error) {
      return this.respondError(error, response, 404, i18n)
    }
  }

  /**
   * @swagger
   * /api/repse-providers/{providerId}/validations:
   *   post:
   *     summary: Registrar una validaci?n peri?dica del folio (con evidencia)
   *     description: |
   *       Alta append-only: cada validaci?n deja qui?n (usuario autenticado),
   *       cu?ndo (`fecha`) y con qu? evidencia (`archivo`) se comprob? el
   *       estatus del folio en el padr?n REPSE de la STPS. Tras guardar,
   *       recalcula `nextReviewAt` del proveedor (`fecha + periodicidadMeses`).
   *     tags: [RepseProviderValidations]
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
   *         name: providerId
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required: [estatus, fecha, archivo]
   *             properties:
   *               estatus: { type: string, enum: [vigente, no_vigente] }
   *               fecha: { type: string, format: date }
   *               archivo:
   *                 type: string
   *                 format: binary
   *                 description: Evidencia PDF/PNG/JPG (m?x. 10 MB)
   *     responses:
   *       '201':
   *         description: Validaci?n registrada; `nextReviewAt` del proveedor actualizado
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Validaciones de Proveedor REPSE
   *               message: Validaci?n registrada correctamente
   *               data:
   *                 validacion:
   *                   proveedorRepseValidacionId: 1
   *                   proveedorRepseId: 1
   *                   businessUnitId: 1
   *                   estatus: vigente
   *                   fecha: "2026-07-01"
   *                   autorUserId: 5
   *                   evidenciaNombreArchivo: "captura-repse.pdf"
   *                   evidenciaMimeType: "application/pdf"
   *                   evidenciaTamanoBytes: 245678
   *                   proveedorRepseValidacionCreatedAt: "2026-07-01T09:00:00.000-06:00"
   *       '401':
   *         description: Sin autenticaci?n
   *         content:
   *           application/json:
   *             example: { type: error, title: "No autorizado", message: "Usuario no autenticado", errorCode: REPSEPROV.FORBID.001, data: null }
   *       '403':
   *         description: Sin permiso `create` o `gestion`
   *         content:
   *           application/json:
   *             example: { type: error, title: "Sin permiso", message: "No tienes permiso para realizar esta operaci?n.", key: sin-permiso, errorCode: REPSEPROV.FORBID.001, data: null }
   *       '404':
   *         description: Proveedor inexistente o ajeno al tenant
   *         content:
   *           application/json:
   *             example: { type: error, title: "Error", message: "El proveedor REPSE no existe o no pertenece al tenant actual.", key: proveedor-repse-no-encontrado, errorCode: REPSEPROV.NF.PROV.001, data: null }
   *       '422':
   *         description: |
   *           Validaci?n VineJS, evidencia inv?lida (key `evidencia-invalida`) o incoherencia
   *           de fecha: `fecha` futura (key `fecha-futura`) o anterior a la ?ltima validaci?n
   *           ya registrada para el proveedor (key `fecha-anterior-a-ultima-validacion`).
   *         content:
   *           application/json:
   *             example: { type: error, title: "Error", message: "Tipo de archivo no permitido para la evidencia. Solo se acepta PDF, PNG o JPG.", key: evidencia-invalida, errorCode: REPSEPROV.VAL.EVID.001, data: null }
   */
  async store(ctx: HttpContext) {
    const { params, request, response, i18n, auth } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'create'))) return

      const providerId = this.parseProviderId(params.providerId)
      const body = await parseCreateValidacionBody(request, i18n)
      const file = request.file('archivo')

      const service = new ValidationsService()
      const created = await service.create({
        proveedorRepseId: providerId,
        estatus: body.estatus,
        fecha: this.dateLikeToIso(body.fecha),
        autorUserId: auth.user!.userId,
        file,
      })

      return StandardResponseFormatter.success(
        response,
        created,
        i18n.t('repse_provider_validation_detail_title', undefined, 'Validaci?n de Proveedor REPSE'),
        i18n.t(
          'repse_provider_validation_created_successfully',
          undefined,
          'Validaci?n registrada correctamente'
        ),
        201,
        'validacion'
      )
    } catch (error) {
      return this.respondError(error, response, 422, i18n)
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

  private parseProviderId(raw: unknown) {
    const id = Number(raw)
    if (!Number.isFinite(id) || id <= 0) {
      throw new RepseProviderError(
        'El identificador del proveedor REPSE es inv?lido.',
        REPSE_PROVIDER_ERROR_CODES.VAL_INPUT,
        422,
        'entrada-invalida'
      )
    }
    return id
  }

  private parseValidationId(raw: unknown) {
    const id = Number(raw)
    if (!Number.isFinite(id) || id <= 0) {
      throw new RepseProviderError(
        'El identificador de la validaci?n es inv?lido.',
        REPSE_PROVIDER_ERROR_CODES.VAL_INPUT,
        422,
        'entrada-invalida'
      )
    }
    return id
  }

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

class RepseValidationMessagesProvider implements MessagesProviderContact {
  constructor(private i18n: HttpContext['i18n']) {}

  getMessage(
    defaultMessage: string,
    rule: string,
    field: FieldContext,
    meta?: Record<string, any>
  ) {
    if (field.name === 'estatus' && rule === 'enum') {
      return this.i18n.t(
        'repse_provider_validation_estatus_enum_error',
        undefined,
        "El estatus seleccionado no es v?lido. Las opciones v?lidas son: 'vigente', 'no_vigente'."
      )
    }
    return this.i18n.createMessagesProvider().getMessage(defaultMessage, rule, field, meta)
  }
}

async function parseCreateValidacionBody(request: HttpContext['request'], i18n: HttpContext['i18n']) {
  const body = {
    estatus: request.input('estatus'),
    fecha: request.input('fecha'),
  }
  return createProveedorRepseValidacionValidator.validate(body, {
    messagesProvider: new RepseValidationMessagesProvider(i18n),
  })
}
