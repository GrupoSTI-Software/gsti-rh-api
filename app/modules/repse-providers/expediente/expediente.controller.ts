import type { HttpContext } from '@adonisjs/core/http'
import { isFileIntakeError, respondFileIntakeError } from '#helpers/file_intake_api_error'
import type { MessagesProviderContact, FieldContext } from '@vinejs/vine/types'
import {
  assertComplianceRepsePermission,
  type ComplianceRepseAction,
} from '#helpers/compliance_repse_rbac'
import { REPSE_EXPEDIENTE_ERROR_CODES } from '#constants/repse_expediente_error_codes'
import { RepseExpedienteError } from '#exceptions/repse_expediente_error'
import { resolveRepseExpedienteApiError } from '#helpers/repse_expediente_api_error'
import { StandardResponseFormatter } from '#helpers/standard_response_formatter'
import { REPSE_PROVIDERS_MODULE_SLUG } from '../providers/providers.controller.js'
import ExpedienteService from './expediente.service.js'
import { formatRepseExpedienteTiposForMessage } from './expediente.constants.js'
import {
  createRepseExpedienteDocumentoValidator,
  listRepseExpedienteDocumentosValidator,
} from './validators/expediente.validator.js'

const RBAC_FORBIDDEN = {
  errorCode: REPSE_EXPEDIENTE_ERROR_CODES.FORBIDDEN,
  i18nPrefix: 'repse_expediente',
}

/**
 * Expediente documental del proveedor REPSE (USRH1784259105702).
 * Subida, listado, descarga y baja lógica con retención normativa de 5 años.
 */
export default class ExpedienteController {
  /**
   * @swagger
   * /api/repse-providers/{providerId}/expediente:
   *   get:
   *     summary: Listar documentos del expediente de un proveedor REPSE
   *     description: |
   *       Lista paginada y filtrable por tipo/periodo. Registra una fila de
   *       `consulta` en `repse_expediente_accesos` cuando hay al menos un documento.
   *       Payload estable en `data.expediente` (title/message i18n vía Accept-Language).
   *     tags: [RepseExpediente]
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
   *       - in: header
   *         name: Accept-Language
   *         required: false
   *         schema: { type: string }
   *       - in: path
   *         name: providerId
   *         required: true
   *         schema: { type: integer }
   *       - in: query
   *         name: tipo
   *         schema:
   *           type: string
   *           enum: [contrato, anexo-15d, cfdi, comprobante-imss, comprobante-infonavit, declaracion-isr, declaracion-iva, retencion-isr]
   *       - in: query
   *         name: anio
   *         schema: { type: integer }
   *       - in: query
   *         name: mes
   *         schema: { type: integer, minimum: 1, maximum: 12 }
   *       - in: query
   *         name: cuatrimestre
   *         schema: { type: integer, minimum: 1, maximum: 3 }
   *       - in: query
   *         name: page
   *         required: true
   *         schema: { type: integer, minimum: 1 }
   *       - in: query
   *         name: limit
   *         required: true
   *         schema: { type: integer, minimum: 1, maximum: 100 }
   *     responses:
   *       '200':
   *         description: Listado paginado del expediente
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Expediente de Proveedor REPSE
   *               message: Documentos del expediente obtenidos correctamente
   *               data:
   *                 expediente:
   *                   meta:
   *                     total: 1
   *                     perPage: 20
   *                     currentPage: 1
   *                     lastPage: 1
   *                     page: 1
   *                     firstPage: 1
   *                   data:
   *                     - repseExpedienteDocumentoId: 1
   *                       proveedorRepseId: 1
   *                       businessUnitId: 1
   *                       tipo: contrato
   *                       anio: 2024
   *                       mes: null
   *                       cuatrimestre: null
   *                       fechaDocumento: "2024-01-15"
   *                       conservarHasta: "2029-01-15"
   *                       nombreArchivo: contrato-proveedor.pdf
   *                       mimeType: application/pdf
   *                       tamanoBytes: 245678
   *                       subidoPorUserId: 5
   *                       repseExpedienteDocumentoCreatedAt: "2026-07-20T12:00:00.000-06:00"
   *       '400':
   *         description: Query inválido (VineJS; key `entrada-invalida`, errorCode `REXP.VAL.001`)
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Datos inválidos
   *               message: El valor del campo page debe ser mayor o igual a 1
   *               errorCode: REXP.VAL.001
   *               key: entrada-invalida
   *               detail: El valor del campo page debe ser mayor o igual a 1
   *               data: null
   *       '401':
   *         description: Sin autenticación
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: No autorizado
   *               message: Usuario no autenticado
   *               errorCode: REXP.FORBID.001
   *               data: null
   *       '403':
   *         description: Sin permiso `read` o `gestion` (key `sin-permiso`)
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Sin permiso de consulta
   *               message: No tienes permiso para consultar el expediente.
   *               key: sin-permiso
   *               errorCode: REXP.FORBID.001
   *               data: null
   *       '404':
   *         description: Proveedor inexistente o ajeno al tenant (key `proveedor-repse-no-encontrado`)
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Proveedor REPSE no encontrado
   *               message: El proveedor REPSE no existe o no pertenece al tenant actual.
   *               key: proveedor-repse-no-encontrado
   *               errorCode: REXP.NF.001
   *               detail: El proveedor REPSE no existe o no pertenece al tenant actual.
   *               data: null
   */
  async index(ctx: HttpContext) {
    const { params, request, response, i18n, auth } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'read'))) return

      const providerId = this.parseProviderId(params.providerId)
      const filters = await parseListExpedienteQuery(request, i18n)

      const service = new ExpedienteService()
      const bundle = await service.listByProveedor({
        proveedorRepseId: providerId,
        tipo: filters.tipo,
        anio: filters.anio,
        mes: filters.mes,
        cuatrimestre: filters.cuatrimestre,
        page: filters.page,
        limit: filters.limit,
        userId: auth.user!.userId,
      })

      return StandardResponseFormatter.success(
        response,
        { meta: bundle.meta, data: bundle.data },
        i18n.t('repse_expediente_title', undefined, 'Expediente de Proveedor REPSE'),
        i18n.t(
          'repse_expediente_listed_successfully',
          undefined,
          'Documentos del expediente obtenidos correctamente'
        ),
        200,
        'expediente'
      )
    } catch (error) {
      return this.respondError(error, response, 404, i18n)
    }
  }

  /**
   * @swagger
   * /api/repse-providers/{providerId}/expediente:
   *   post:
   *     summary: Subir un documento al expediente del proveedor REPSE
   *     description: |
   *       Alta multipart. El archivo debe enviarse en el campo **`archivo`**
   *       (tipo File). Solo PDF, máximo **10 MB**. Calcula `conservarHasta`
   *       (fecha del documento o hoy + 5 años). Payload estable en
   *       `data.documentoExpediente` (title/message i18n vía Accept-Language).
   *     tags: [RepseExpediente]
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
   *       - in: header
   *         name: Accept-Language
   *         required: false
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
   *             required: [tipo, anio, archivo]
   *             properties:
   *               tipo:
   *                 type: string
   *                 enum: [contrato, anexo-15d, cfdi, comprobante-imss, comprobante-infonavit, declaracion-isr, declaracion-iva, retencion-isr]
   *                 description: Catálogo cerrado de tipo de documento
   *               anio:
   *                 type: integer
   *                 minimum: 2000
   *                 maximum: 2100
   *               mes:
   *                 type: integer
   *                 minimum: 1
   *                 maximum: 12
   *               cuatrimestre:
   *                 type: integer
   *                 minimum: 1
   *                 maximum: 3
   *               fechaDocumento:
   *                 type: string
   *                 format: date
   *                 description: Base para calcular retención (opcional; default hoy)
   *               archivo:
   *                 type: string
   *                 format: binary
   *                 description: PDF obligatorio, máximo 10 MB (clave multipart `archivo`)
   *     responses:
   *       '201':
   *         description: Documento registrado con `conservarHasta` calculada
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Documento del expediente REPSE
   *               message: Documento del expediente registrado correctamente
   *               data:
   *                 documentoExpediente:
   *                   repseExpedienteDocumentoId: 1
   *                   proveedorRepseId: 1
   *                   businessUnitId: 1
   *                   tipo: contrato
   *                   anio: 2024
   *                   mes: null
   *                   cuatrimestre: null
   *                   fechaDocumento: "2024-01-15"
   *                   conservarHasta: "2029-01-15"
   *                   nombreArchivo: contrato-proveedor.pdf
   *                   mimeType: application/pdf
   *                   tamanoBytes: 245678
   *                   subidoPorUserId: 5
   *                   repseExpedienteDocumentoCreatedAt: "2026-07-20T12:00:00.000-06:00"
   *       '400':
   *         description: Metadatos inválidos VineJS (key `entrada-invalida`, errorCode `REXP.VAL.001`)
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Datos inválidos
   *               message: "El tipo de documento seleccionado no es válido. Las opciones válidas son: 'contrato', 'anexo-15d', 'cfdi', 'comprobante-imss', 'comprobante-infonavit', 'declaracion-isr', 'declaracion-iva', 'retencion-isr'."
   *               errorCode: REXP.VAL.001
   *               key: entrada-invalida
   *               detail: "El tipo de documento seleccionado no es válido. Las opciones válidas son: 'contrato', 'anexo-15d', 'cfdi', 'comprobante-imss', 'comprobante-infonavit', 'declaracion-isr', 'declaracion-iva', 'retencion-isr'."
   *               data: null
   *       '401':
   *         description: Sin autenticación
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: No autorizado
   *               message: Usuario no autenticado
   *               errorCode: REXP.FORBID.001
   *               data: null
   *       '403':
   *         description: Sin permiso `create` o `gestion` (key `sin-permiso`)
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Sin permiso
   *               message: No tienes permiso para realizar esta operación.
   *               key: sin-permiso
   *               errorCode: REXP.FORBID.001
   *               data: null
   *       '404':
   *         description: Proveedor inexistente o ajeno al tenant (key `proveedor-repse-no-encontrado`)
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Proveedor REPSE no encontrado
   *               message: El proveedor REPSE no existe o no pertenece al tenant actual.
   *               key: proveedor-repse-no-encontrado
   *               errorCode: REXP.NF.001
   *               detail: El proveedor REPSE no existe o no pertenece al tenant actual.
   *               data: null
   *       '422':
   *         description: |
   *           Archivo inválido (key `documento-invalido`, errorCode `REXP.VAL.DOC.001`):
   *           falta `archivo`, no es PDF, excede 10 MB o fallo de almacenamiento S3.
   *         content:
   *           application/json:
   *             examples:
   *               archivoFaltante:
   *                 summary: Falta el campo multipart archivo
   *                 value:
   *                   type: error
   *                   title: Documento inválido
   *                   message: "No se recibió el parámetro 'archivo' (tipo File) en la petición multipart/form-data. Adjunte un PDF de hasta 10 MB con la clave 'archivo'."
   *                   key: documento-invalido
   *                   errorCode: REXP.VAL.DOC.001
   *                   detail: "No se recibió el parámetro 'archivo' (tipo File) en la petición multipart/form-data. Adjunte un PDF de hasta 10 MB con la clave 'archivo'."
   *                   data: null
   *               tamanoExcedido:
   *                 summary: PDF mayor a 10 MB
   *                 value:
   *                   type: error
   *                   title: Documento inválido
   *                   message: "El archivo enviado en 'archivo' excede el tamaño máximo de 10 MB."
   *                   key: documento-invalido
   *                   errorCode: REXP.VAL.DOC.001
   *                   detail: "El archivo enviado en 'archivo' excede el tamaño máximo de 10 MB."
   *                   data: null
   *               s3Fallido:
   *                 summary: Error al subir a S3
   *                 value:
   *                   type: error
   *                   title: Error de almacenamiento
   *                   message: No se pudo almacenar el documento del expediente.
   *                   key: documento-invalido
   *                   errorCode: REXP.S3.001
   *                   detail: No se pudo almacenar el documento del expediente.
   *                   data: null
   */
  async store(ctx: HttpContext) {
    const { params, request, response, i18n, auth } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'create'))) return

      const providerId = this.parseProviderId(params.providerId)
      const body = await parseCreateExpedienteBody(request, i18n)
      const file = request.file('archivo')

      const service = new ExpedienteService()
      const created = await service.create({
        proveedorRepseId: providerId,
        tipo: body.tipo,
        anio: body.anio,
        mes: body.mes,
        cuatrimestre: body.cuatrimestre,
        fechaDocumento: body.fechaDocumento,
        subidoPorUserId: auth.user!.userId,
        file,
      })

      return StandardResponseFormatter.success(
        response,
        created,
        i18n.t('repse_expediente_document_title', undefined, 'Documento del expediente REPSE'),
        i18n.t(
          'repse_expediente_created_successfully',
          undefined,
          'Documento del expediente registrado correctamente'
        ),
        201,
        'documentoExpediente'
      )
    } catch (error) {
      return this.respondError(error, response, 422, i18n)
    }
  }

  /**
   * @swagger
   * /api/repse-providers/{providerId}/expediente/{docId}/download:
   *   get:
   *     summary: Descargar un documento del expediente REPSE
   *     description: |
   *       Stream del PDF almacenado en S3 privado. Registra `descarga` en la
   *       bitácora. Cabeceras: `Content-Disposition: attachment`,
   *       `Cache-Control: private, no-store`.
   *     tags: [RepseExpediente]
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
   *         name: docId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200':
   *         description: Stream del PDF (Content-Type application/pdf, Content-Disposition attachment)
   *         content:
   *           application/pdf:
   *             schema:
   *               type: string
   *               format: binary
   *           application/octet-stream:
   *             schema:
   *               type: string
   *               format: binary
   *       '401':
   *         description: Sin autenticación
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: No autorizado
   *               message: Usuario no autenticado
   *               errorCode: REXP.FORBID.001
   *               data: null
   *       '403':
   *         description: Sin permiso `read` o `gestion` (key `sin-permiso`)
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Sin permiso de consulta
   *               message: No tienes permiso para consultar el expediente.
   *               key: sin-permiso
   *               errorCode: REXP.FORBID.001
   *               data: null
   *       '404':
   *         description: Proveedor o documento inexistente (key `proveedor-repse-no-encontrado` o `documento-no-encontrado`)
   *         content:
   *           application/json:
   *             examples:
   *               proveedorNoEncontrado:
   *                 summary: Proveedor ajeno o inexistente
   *                 value:
   *                   type: error
   *                   title: Proveedor REPSE no encontrado
   *                   message: El proveedor REPSE no existe o no pertenece al tenant actual.
   *                   key: proveedor-repse-no-encontrado
   *                   errorCode: REXP.NF.001
   *                   detail: El proveedor REPSE no existe o no pertenece al tenant actual.
   *                   data: null
   *               documentoNoEncontrado:
   *                 summary: Documento inexistente para el proveedor
   *                 value:
   *                   type: error
   *                   title: Documento no encontrado
   *                   message: El documento del expediente no existe o no pertenece a este proveedor REPSE.
   *                   key: documento-no-encontrado
   *                   errorCode: REXP.NF.001
   *                   detail: El documento del expediente no existe o no pertenece a este proveedor REPSE.
   *                   data: null
   */
  async download(ctx: HttpContext) {
    const { params, response, i18n, auth } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'read'))) return

      const providerId = this.parseProviderId(params.providerId)
      const docId = this.parseDocId(params.docId)

      const service = new ExpedienteService()
      const { documento, object } = await service.getDownloadStream(
        providerId,
        docId,
        auth.user!.userId
      )

      const safeName = documento.nombreArchivo.replace(/[^\w.\- ]/g, '_')
      response.header('Content-Type', object.contentType || documento.mimeType)
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
   * /api/repse-providers/{providerId}/expediente/{docId}:
   *   delete:
   *     summary: Baja lógica de un documento del expediente
   *     description: |
   *       Soft delete. Bloqueado si `conservarHasta > hoy` salvo rol elevado
   *       (`root`, `super-administrador`, `owner`). Registra `eliminacion` en bitácora.
   *     tags: [RepseExpediente]
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
   *         name: docId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '204':
   *         description: Documento eliminado lógicamente (sin body)
   *       '401':
   *         description: Sin autenticación
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: No autorizado
   *               message: Usuario no autenticado
   *               errorCode: REXP.FORBID.001
   *               data: null
   *       '403':
   *         description: |
   *           Retención vigente sin rol elevado (key `retencion-vigente`, errorCode `REXP.FORBID.RET.001`)
   *           o sin permiso `delete`/`gestion` (key `sin-permiso`).
   *         content:
   *           application/json:
   *             examples:
   *               retencionVigente:
   *                 summary: Borrado bloqueado por retención normativa
   *                 value:
   *                   type: error
   *                   title: Retención vigente
   *                   message: No se puede eliminar el documento mientras esté vigente su periodo de retención normativa.
   *                   key: retencion-vigente
   *                   errorCode: REXP.FORBID.RET.001
   *                   detail: No se puede eliminar el documento mientras esté vigente su periodo de retención normativa.
   *                   data: null
   *               sinPermiso:
   *                 summary: Rol sin permiso delete
   *                 value:
   *                   type: error
   *                   title: Sin permiso
   *                   message: No tienes permiso para realizar esta operación.
   *                   key: sin-permiso
   *                   errorCode: REXP.FORBID.001
   *                   data: null
   *       '404':
   *         description: Proveedor o documento inexistente (key `proveedor-repse-no-encontrado` o `documento-no-encontrado`)
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Documento no encontrado
   *               message: El documento del expediente no existe o no pertenece a este proveedor REPSE.
   *               key: documento-no-encontrado
   *               errorCode: REXP.NF.001
   *               detail: El documento del expediente no existe o no pertenece a este proveedor REPSE.
   *               data: null
   */
  async destroy(ctx: HttpContext) {
    const { params, response, i18n, auth } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'delete'))) return

      const providerId = this.parseProviderId(params.providerId)
      const docId = this.parseDocId(params.docId)
      await auth.user!.preload('role')

      const service = new ExpedienteService()
      await service.destroy({
        proveedorRepseId: providerId,
        repseExpedienteDocumentoId: docId,
        userId: auth.user!.userId,
        roleSlug: auth.user!.role?.roleSlug,
      })

      return response.status(204).noContent()
    } catch (error) {
      return this.respondError(error, response, 403, i18n)
    }
  }

  private async assertAuthenticated(ctx: HttpContext) {
    await ctx.auth.check()
    if (!ctx.auth.user) {
      ctx.response.status(401).json({
        type: 'error',
        title: ctx.i18n.t('repse_expediente_unauthorized_title', undefined, 'No autorizado'),
        message: ctx.i18n.t(
          'repse_expediente_unauthorized_message',
          undefined,
          'Usuario no autenticado'
        ),
        errorCode: REPSE_EXPEDIENTE_ERROR_CODES.FORBIDDEN,
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
      throw new RepseExpedienteError(
        'El identificador del proveedor REPSE es inválido.',
        REPSE_EXPEDIENTE_ERROR_CODES.VAL_INPUT,
        422,
        'entrada-invalida'
      )
    }
    return id
  }

  private parseDocId(raw: unknown) {
    const id = Number(raw)
    if (!Number.isFinite(id) || id <= 0) {
      throw new RepseExpedienteError(
        'El identificador del documento es inválido.',
        REPSE_EXPEDIENTE_ERROR_CODES.VAL_INPUT,
        422,
        'entrada-invalida'
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
    // del modulo lo degrada a un 500 generico y el usuario nunca sabe que su
    // archivo fue rechazado ni por que.
    if (isFileIntakeError(error)) {
      return respondFileIntakeError(response, error)
    }

    const resolved = resolveRepseExpedienteApiError(error, fallback, i18n)
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

class RepseExpedienteMessagesProvider implements MessagesProviderContact {
  constructor(private i18n: HttpContext['i18n']) {}

  getMessage(
    defaultMessage: string,
    rule: string,
    field: FieldContext,
    meta?: Record<string, any>
  ) {
    if (field.name === 'tipo' && rule === 'enum') {
      const options = formatRepseExpedienteTiposForMessage()
      return this.i18n.t(
        'repse_expediente_tipo_enum_error',
        { options },
        `El tipo de documento seleccionado no es válido. Las opciones válidas son: ${options}.`
      )
    }
    return this.i18n.createMessagesProvider().getMessage(defaultMessage, rule, field, meta)
  }
}

async function parseCreateExpedienteBody(request: HttpContext['request'], i18n: HttpContext['i18n']) {
  const body = {
    tipo: request.input('tipo'),
    anio: request.input('anio') !== undefined ? Number(request.input('anio')) : undefined,
    mes: request.input('mes') !== undefined ? Number(request.input('mes')) : undefined,
    cuatrimestre:
      request.input('cuatrimestre') !== undefined
        ? Number(request.input('cuatrimestre'))
        : undefined,
    fechaDocumento: request.input('fechaDocumento'),
  }
  return createRepseExpedienteDocumentoValidator.validate(body, {
    messagesProvider: new RepseExpedienteMessagesProvider(i18n),
  })
}

async function parseListExpedienteQuery(request: HttpContext['request'], i18n: HttpContext['i18n']) {
  const body = {
    tipo: request.input('tipo') || undefined,
    anio: request.input('anio') !== undefined ? Number(request.input('anio')) : undefined,
    mes: request.input('mes') !== undefined ? Number(request.input('mes')) : undefined,
    cuatrimestre:
      request.input('cuatrimestre') !== undefined
        ? Number(request.input('cuatrimestre'))
        : undefined,
    page: request.input('page') !== undefined ? Number(request.input('page')) : 1,
    limit: request.input('limit') !== undefined ? Number(request.input('limit')) : 20,
  }
  return listRepseExpedienteDocumentosValidator.validate(body, {
    messagesProvider: new RepseExpedienteMessagesProvider(i18n),
  })
}
