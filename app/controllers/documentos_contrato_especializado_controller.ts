import logger from '@adonisjs/core/services/logger'
import { isFileIntakeError, respondFileIntakeError } from '#helpers/file_intake_api_error'
import type { HttpContext } from '@adonisjs/core/http'
import DocumentoContratoEspecializadoService from '#services/documento_contrato_especializado_service'
import { documentoContratoVigenciaValidator } from '#validators/compliance-repse/documento_contrato.validator'
import { CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES } from '../constants/contrato_servicio_especializado_error_codes.js'
import { DOCUMENTO_CONTRATO_ESPECIALIZADO_ERROR_CODES } from '../constants/documento_contrato_especializado_error_codes.js'
import { ContratoServicioEspecializadoError } from '../exceptions/contrato_servicio_especializado_error.js'
import { resolveDocumentoContratoApiError } from '../helpers/documento_contrato_especializado_api_error.js'
import {
  assertComplianceRepsePermission,
  type ComplianceRepseAction,
} from '../helpers/compliance_repse_rbac.js'
import { StandardResponseFormatter } from '../helpers/standard_response_formatter.js'

const MODULE_SLUG = 'repse-registrations'
const RBAC_FORBIDDEN = {
  errorCode: DOCUMENTO_CONTRATO_ESPECIALIZADO_ERROR_CODES.FORBIDDEN,
  i18nPrefix: 'documento_contrato',
}

/**
 * Controlador REST de documentos firmados de contratos de servicios especializados REPSE.
 */
export default class DocumentosContratoEspecializadoController {
  /**
   * @swagger
   * /api/contratos-servicios-especializados/{contratoId}/documentos:
   *   post:
   *     summary: Subir documento firmado del contrato
   *     tags: [DocumentosContratoEspecializado]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: contratoId
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required: [archivo, fechaInicioVigencia, fechaVencimiento]
   *             properties:
   *               archivo:
   *                 type: string
   *                 format: binary
   *                 description: PDF del contrato firmado (tamaño máx. según MAX_FILE_BYTES en el servicio)
   *               fechaInicioVigencia:
   *                 type: string
   *                 format: date
   *               fechaVencimiento:
   *                 type: string
   *                 format: date
   *     responses:
   *       '201':
   *         description: Documento creado (origen subido, vigente true)
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/DocumentoContratoEspecializadoSuccess'
   *       '400':
   *         description: Validación VineJS o key vigencia-incoherente
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   *       '401':
   *         description: No autenticado
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
   *         description: key contrato-no-encontrado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   *       '422':
   *         description: key documento-invalido (PDF inválido o tamaño excedido)
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   */
  async store(ctx: HttpContext) {
    const { params, request, response, i18n, auth } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'create'))) return

      const contratoId = this.parseContratoId(params.contratoId)
      const fechas = await this.parseVigenciaFromRequest(request)
      const file = request.file('archivo')

      const service = new DocumentoContratoEspecializadoService()
      const created = await service.subirDocumento({
        contratoId,
        file,
        fechaInicioVigencia: fechas.fechaInicioVigencia,
        fechaVencimiento: fechas.fechaVencimiento,
        subidoPor: auth.user?.userId ?? null,
      })

      return StandardResponseFormatter.success(
        response,
        created,
        i18n.t('documento_contrato_title', undefined, 'Documento del contrato'),
        i18n.t(
          'documento_contrato_created_successfully',
          undefined,
          'Documento subido correctamente'
        ),
        201
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/contratos-servicios-especializados/{contratoId}/documentos:
   *   get:
   *     summary: Listar documentos del contrato (vigente y archivados)
   *     tags: [DocumentosContratoEspecializado]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: contratoId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200':
   *         description: Listado cronológico descendente (vigente y archivados)
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/DocumentosContratoListSuccess'
   *       '401':
   *         description: No autenticado
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
   *         description: key contrato-no-encontrado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   */
  async index(ctx: HttpContext) {
    const { params, response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'read'))) return

      const contratoId = this.parseContratoId(params.contratoId)
      const service = new DocumentoContratoEspecializadoService()
      const rows = await service.listarPorContrato(contratoId)

      return StandardResponseFormatter.success(
        response,
        { documentos: rows },
        i18n.t('documento_contrato_title', undefined, 'Documento del contrato'),
        i18n.t(
          'documento_contrato_listed_successfully',
          undefined,
          'Documentos obtenidos correctamente'
        )
      )
    } catch (error) {
      return this.respondError(error, response, 404, i18n)
    }
  }

  /**
   * @swagger
   * /api/contratos-servicios-especializados/{contratoId}/documentos/vigente/descarga:
   *   get:
   *     summary: Descargar PDF del documento vigente
   *     tags: [DocumentosContratoEspecializado]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: contratoId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200':
   *         description: Stream del PDF vigente (Content-Type application/pdf, Content-Disposition attachment)
   *         content:
   *           application/pdf:
   *             schema:
   *               type: string
   *               format: binary
   *       '401':
   *         description: No autenticado
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
   *         description: key documento-no-encontrado o contrato-no-encontrado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   */
  async downloadVigente(ctx: HttpContext) {
    const { params, response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'read'))) return

      const contratoId = this.parseContratoId(params.contratoId)
      const service = new DocumentoContratoEspecializadoService()
      const { documento, object } = await service.obtenerStreamVigente(contratoId)

      const safeName = documento.nombreArchivo.replace(/[^\w.\- ]/g, '_')
      response.header('Content-Type', 'application/pdf')
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
   * /api/contratos-servicios-especializados/{contratoId}/documentos/vigente:
   *   put:
   *     summary: Reemplazar el documento vigente
   *     tags: [DocumentosContratoEspecializado]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: contratoId
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required: [archivo, fechaInicioVigencia, fechaVencimiento]
   *             properties:
   *               archivo:
   *                 type: string
   *                 format: binary
   *               fechaInicioVigencia:
   *                 type: string
   *                 format: date
   *               fechaVencimiento:
   *                 type: string
   *                 format: date
   *     responses:
   *       '200':
   *         description: Nuevo documento vigente; el anterior queda archivado (vigente false)
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/DocumentoContratoEspecializadoSuccess'
   *       '400':
   *         description: Validación VineJS o key vigencia-incoherente
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   *       '401':
   *         description: No autenticado
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
   *         description: key contrato-no-encontrado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   *       '422':
   *         description: key documento-invalido (PDF inválido o tamaño excedido)
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   */
  async replaceVigente(ctx: HttpContext) {
    const { params, request, response, i18n, auth } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'update'))) return

      const contratoId = this.parseContratoId(params.contratoId)
      const fechas = await this.parseVigenciaFromRequest(request)
      const file = request.file('archivo')

      const service = new DocumentoContratoEspecializadoService()
      const updated = await service.reemplazarVigente({
        contratoId,
        file,
        fechaInicioVigencia: fechas.fechaInicioVigencia,
        fechaVencimiento: fechas.fechaVencimiento,
        subidoPor: auth.user?.userId ?? null,
      })

      return StandardResponseFormatter.success(
        response,
        updated,
        i18n.t('documento_contrato_title', undefined, 'Documento del contrato'),
        i18n.t(
          'documento_contrato_replaced_successfully',
          undefined,
          'Documento vigente reemplazado correctamente'
        )
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  private async parseVigenciaFromRequest(request: HttpContext['request']) {
    const body = {
      fechaInicioVigencia: request.input('fechaInicioVigencia'),
      fechaVencimiento: request.input('fechaVencimiento'),
    }
    const validated = await documentoContratoVigenciaValidator.validate(body)
    return {
      fechaInicioVigencia: validated.fechaInicioVigencia as Date,
      fechaVencimiento: validated.fechaVencimiento as Date,
    }
  }

  private async assertAuthenticated(ctx: HttpContext) {
    if (!ctx.auth.user) {
      ctx.response.status(401).json({
        type: 'error',
        title: ctx.i18n.t('documento_contrato_unauthorized_title', undefined, 'No autorizado'),
        message: ctx.i18n.t(
          'documento_contrato_unauthorized_message',
          undefined,
          'Usuario no autenticado'
        ),
        errorCode: DOCUMENTO_CONTRATO_ESPECIALIZADO_ERROR_CODES.FORBIDDEN,
        data: null,
      })
      return false
    }
    return true
  }

  private async assertHasPermission(ctx: HttpContext, action: ComplianceRepseAction) {
    return assertComplianceRepsePermission(ctx, MODULE_SLUG, action, RBAC_FORBIDDEN)
  }

  private parseContratoId(raw: unknown) {
    const id = Number(raw)
    if (!Number.isFinite(id) || id <= 0) {
      throw new ContratoServicioEspecializadoError(
        'El identificador del contrato es inválido.',
        CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.VAL_INPUT,
        400
      )
    }
    return id
  }

  private respondError(
    error: unknown,
    response: HttpContext['response'],
    fallback: number,
    i18n: HttpContext['i18n']
  ) {
    // El rechazo de un archivo es 422 con triplete: sin esta rama el resolver
    // del modulo lo degrada a un 500 genérico y el usuario nunca sabe que su
    // archivo fue rechazado ni por que.
    if (isFileIntakeError(error)) {
      return respondFileIntakeError(response, error)
    }

    const resolved = resolveDocumentoContratoApiError(error, fallback, i18n)
    if (resolved.errorCode === DOCUMENTO_CONTRATO_ESPECIALIZADO_ERROR_CODES.SYS_UNHANDLED) {
      logger.error({ err: error }, 'Error inesperado en documentos de contrato REPSE')
    }
    const body: Record<string, unknown> = {
      type: 'error',
      title: resolved.title,
      message: resolved.message,
      errorCode: resolved.errorCode,
      data: null,
    }
    if (resolved.key) {
      body.key = resolved.key
      body.detail = resolved.detail ?? resolved.message
    }
    return response.status(resolved.status).json(body)
  }
}
