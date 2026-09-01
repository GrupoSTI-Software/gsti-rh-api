import logger from '@adonisjs/core/services/logger'
import { isFileIntakeError, respondFileIntakeError } from '#helpers/file_intake_api_error'
import { assertSpreadsheetFile } from '#helpers/spreadsheet_intake_guard'
import type { HttpContext } from '@adonisjs/core/http'
import ContratoServicioEspecializadoService, {
  type Anexo15dCreatePayload,
  type Anexo15dUpdatePayload,
  type ContratoServicioEspecializadoCreatePayload,
  type ContratoServicioEspecializadoUpdatePayload,
} from '#services/contrato_servicio_especializado_service'
import ContratoServicioEspecializadoImportService from '#services/contrato_servicio_especializado_import_service'
import {
  createContratoServicioEspecializadoValidator,
  listContratosServiciosEspecializadosValidator,
  updateContratoServicioEspecializadoValidator,
} from '#validators/compliance-repse/contrato_servicio_especializado.validator'
import { CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES } from '../constants/contrato_servicio_especializado_error_codes.js'
import { ContratoServicioEspecializadoError } from '../exceptions/contrato_servicio_especializado_error.js'
import { resolveContratoServicioEspecializadoApiError } from '../helpers/contrato_servicio_especializado_api_error.js'
import {
  assertComplianceRepsePermission,
  type ComplianceRepseAction,
} from '../helpers/compliance_repse_rbac.js'
import { resolveContratoImportGlobalErrorTitle } from '../helpers/contrato_import_request_errors.js'
import { StandardResponseFormatter } from '../helpers/standard_response_formatter.js'
import type { ContratoServicioEspecializadoEstatus } from '#models/contrato_servicio_especializado'

const MODULE_SLUG = 'repse-registrations'
const RBAC_FORBIDDEN = {
  errorCode: CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.FORBIDDEN,
  i18nPrefix: 'contrato_servicio_especializado',
}

/**
 * Controlador REST de contratos de servicios especializados REPSE (anexo 15-D LFT).
 *
 * Expone CRUD bajo /api/contratos-servicios-especializados con permisos granulares
 * (`read`, `create`, `update`, `delete` o `gestion`) y aislamiento multi-tenant.
 */
export default class ContratosServiciosEspecializadosController {
  /**
   * @swagger
   * /api/contratos-servicios-especializados:
   *   get:
   *     summary: Lista paginada de contratos de servicios especializados
   *     tags: [ContratosServiciosEspecializados]
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
       *         name: estatus
       *         description: |
       *           Uno o varios estatus (CSV o repetido). Semántica efectiva: vencido incluye
       *           declarados vencidos más vigentes expirados por fecha; vigente los excluye.
       *         schema:
       *           oneOf:
       *             - type: string
       *               enum: [borrador, vigente, vencido, cancelado]
       *             - type: array
       *               items:
       *                 type: string
       *                 enum: [borrador, vigente, vencido, cancelado]
   *       - in: query
   *         name: empresaContratanteId
   *         schema: { type: integer }
   *       - in: query
   *         name: fechaInicioDesde
   *         schema: { type: string, format: date }
   *       - in: query
   *         name: fechaInicioHasta
   *         schema: { type: string, format: date }
   *       - in: query
   *         name: q
   *         schema: { type: string }
   *     responses:
   *       '200':
   *         description: Listado paginado con anexo 15-D, contratante y serviciosRegistrados
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ContratosServiciosEspecializadosListSuccess'
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

      const estatusList = this.parseEstatusList(request.input('estatus'))
      const filters = await listContratosServiciosEspecializadosValidator.validate({
        page: request.input('page'),
        perPage: request.input('perPage'),
        estatus: estatusList,
        empresaContratanteId: request.input('empresaContratanteId'),
        fechaInicioDesde: request.input('fechaInicioDesde'),
        fechaInicioHasta: request.input('fechaInicioHasta'),
        q: request.input('q'),
      })
      const service = new ContratoServicioEspecializadoService()
      const bundle = await service.listPaginated(filters.page ?? 1, filters.perPage ?? 20, {
        estatus: filters.estatus as ContratoServicioEspecializadoEstatus[] | undefined,
        empresaContratanteId: filters.empresaContratanteId,
        fechaInicioDesde: filters.fechaInicioDesde,
        fechaInicioHasta: filters.fechaInicioHasta,
        q: filters.q,
      })

      return StandardResponseFormatter.success(
        response,
        bundle,
        i18n.t(
          'contratos_servicios_especializados_title',
          undefined,
          'Contratos de Servicios Especializados'
        ),
        i18n.t(
          'contratos_servicios_especializados_listed_successfully',
          undefined,
          'Contratos obtenidos correctamente'
        )
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/contratos-servicios-especializados/{id}:
   *   get:
   *     summary: Detalle de contrato con anexo 15-D embebido
   *     tags: [ContratosServiciosEspecializados]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200':
   *         description: Detalle del contrato con anexo 15-D y serviciosRegistrados
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ContratoServicioEspecializadoSuccess'
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
   *         description: key contrato-no-encontrado
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
      const service = new ContratoServicioEspecializadoService()
      const row = await service.findById(id)

      return StandardResponseFormatter.success(
        response,
        row,
        i18n.t(
          'contrato_servicio_especializado_title',
          undefined,
          'Contrato de Servicios Especializados'
        ),
        i18n.t(
          'contrato_servicio_especializado_found_successfully',
          undefined,
          'Contrato encontrado correctamente'
        )
      )
    } catch (error) {
      return this.respondError(error, response, 404, i18n)
    }
  }

  /**
   * @swagger
   * /api/contratos-servicios-especializados:
   *   post:
   *     summary: Crear contrato con anexo 15-D embebido
   *     tags: [ContratosServiciosEspecializados]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/ContratoServicioEspecializadoCreate'
   *     responses:
   *       '201':
   *         description: Contrato creado con folioRepse autocompletado y serviciosRegistrados poblados
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ContratoServicioEspecializadoSuccess'
   *       '400':
   *         description: Validación VineJS o key servicios-registrados-requeridos
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
   *         description: key empresa-contratante-no-encontrada o servicio-registrado-no-encontrado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   *       '409':
   *         description: key numero-contrato-duplicado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   *       '422':
   *         description: Fechas inválidas o registro REPSE no encontrado
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

      const body = await request.validateUsing(createContratoServicioEspecializadoValidator)
      const payload = this.toCreatePayload(body as Record<string, unknown>)
      const service = new ContratoServicioEspecializadoService()
      const created = await service.create(payload)

      return StandardResponseFormatter.success(
        response,
        created,
        i18n.t(
          'contrato_servicio_especializado_title',
          undefined,
          'Contrato de Servicios Especializados'
        ),
        i18n.t(
          'contrato_servicio_especializado_created_successfully',
          undefined,
          'Contrato creado correctamente'
        ),
        201
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/contratos-servicios-especializados/{id}:
   *   patch:
   *     summary: Actualización parcial del contrato y/o anexo 15-D
   *     tags: [ContratosServiciosEspecializados]
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
   *             $ref: '#/components/schemas/ContratoServicioEspecializadoUpdate'
   *     responses:
   *       '200':
   *         description: Contrato actualizado (incluye serviciosRegistrados si hay vínculos)
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ContratoServicioEspecializadoSuccess'
   *       '400':
   *         description: Validación VineJS o key servicios-registrados-requeridos
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
   *         description: key contrato-no-encontrado o servicio-registrado-no-encontrado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   *       '409':
   *         description: key numero-contrato-duplicado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   *       '422':
   *         description: Fechas inválidas
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

      const id = this.parseResourceId(params.id)
      const body = await request.validateUsing(updateContratoServicioEspecializadoValidator)
      const payload = this.toUpdatePayload(body as Record<string, unknown>)
      const service = new ContratoServicioEspecializadoService()
      const updated = await service.update(id, payload)

      return StandardResponseFormatter.success(
        response,
        updated,
        i18n.t(
          'contrato_servicio_especializado_title',
          undefined,
          'Contrato de Servicios Especializados'
        ),
        i18n.t(
          'contrato_servicio_especializado_updated_successfully',
          undefined,
          'Contrato actualizado correctamente'
        )
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/contratos-servicios-especializados/plantilla-importacion:
   *   get:
   *     summary: Descarga la plantilla Excel de importación masiva de contratos
   *     description: |
   *       Hoja "Contratos" con las 14 cabeceras canónicas + 1 fila de ejemplo, y hoja
   *       "Instrucciones" con el formato de celdas compuestas (compromisos documentales
   *       y servicios registrados), enums permitidos y ejemplos (USRH1785509296682).
   *     tags: [ContratosServiciosEspecializados]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *         description: Bearer access token
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: integer }
   *         description: Identificador de unidad de negocio
   *       - in: header
   *         name: Accept-Language
   *         required: false
   *         schema: { type: string, enum: [es, en] }
   *     responses:
   *       '200':
   *         description: Archivo xlsx adjunto (plantilla-importacion-contratos-servicios-especializados.xlsx)
   *         content:
   *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
   *             schema:
   *               type: string
   *               format: binary
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
   */
  async downloadImportTemplate(ctx: HttpContext) {
    const { response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'create'))) return

      const importService = new ContratoServicioEspecializadoImportService(i18n)
      const buffer = await importService.generateImportTemplate()

      response.header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      response.header(
        'Content-Disposition',
        'attachment; filename=plantilla-importacion-contratos-servicios-especializados.xlsx'
      )
      response.status(200)
      return response.send(buffer)
    } catch (error) {
      return this.respondError(error, response, 500, i18n)
    }
  }

  /**
   * @swagger
   * /api/contratos-servicios-especializados/importacion:
   *   post:
   *     summary: Importa contratos de servicios especializados desde un archivo Excel
   *     description: |
   *       Valida que el archivo sea un Excel real y que sus cabeceras se emparejen con la
   *       plantilla; procesa cada fila de datos de forma secuencial (sin transacción global)
   *       resolviendo el contratante por RFC (índice ciego) y los servicios registrados por
   *       nombre, y reúsa `create` para dar de alta cada fila válida. Las filas inválidas se
   *       reportan con su número y motivo sin detener el procesamiento de las demás
   *       (USRH1785509296682). Máximo 500 filas de datos por archivo. Limitada por intentos por usuario.
   *     tags: [ContratosServiciosEspecializados]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *         description: Bearer access token
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: integer }
   *         description: Identificador de unidad de negocio
   *       - in: header
   *         name: Accept-Language
   *         required: false
   *         schema: { type: string, enum: [es, en] }
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required: [archivo]
   *             properties:
   *               archivo:
   *                 type: string
   *                 format: binary
   *                 description: Archivo Excel (.xlsx) de máximo 10 MB
   *     responses:
   *       '200':
   *         description: Importación procesada (filas válidas creadas, filas inválidas reportadas)
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ContratoServicioEspecializadoImportacionSuccess'
   *             example:
   *               type: warning
   *               title: Importación de Contratos de Servicios Especializados
   *               message: 'Importación completada: 3 contrato(s) creado(s), 2 fila(s) rechazada(s).'
   *               data:
   *                 summary: { totalRows: 5, created: 3, rejected: 2 }
   *                 rowErrors:
   *                   - row: 4
   *                     motivo: El contratante con RFC XAXX010101000 no existe en su catálogo.
   *                     key: contratante-rfc-no-encontrado
   *                     code: CSE.IMP.CONTRATANTE.001
   *                   - row: 7
   *                     motivo: Ya existe un contrato con ese número en su tenant.
   *                     key: numero-contrato-duplicado
   *                     code: CSE.CONFLICT.NUMERO.001
   *                 warnings: []
   *       '400':
   *         description: Archivo ausente/no es Excel válido, cabeceras no emparejables (key archivo-no-excel / cabeceras-invalidas) o más de 500 filas de datos (key filas-excedidas); ninguna fila se procesa
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   *             example:
   *               type: error
   *               title: Cabeceras inválidas
   *               message: No se pudieron emparejar las cabeceras del archivo con la plantilla. Descargue la plantilla vigente y no modifique la fila 1.
   *               key: cabeceras-invalidas
   *               errorCode: CSE.IMP.HEADERS.001
   *               data: null
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
   *       '429':
   *         description: >-
   *           Límite de 10 intentos de importación / 15 minutos por usuario excedido
   *           (key importacion-rate-limit, errorCode CSE.IMP.RATE.001).
   */
  async importFromExcel(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'create'))) return

      const file = request.file('archivo', { extnames: ['xlsx'], size: '10mb' })

      if (!file) {
        return this.respondImportFileError(
          response,
          i18n,
          'contrato_servicio_especializado_importacion_archivo_ausente_title',
          'Archivo requerido',
          'contrato_servicio_especializado_importacion_archivo_ausente_message',
          'Debe adjuntar un archivo Excel (.xlsx) en el campo "archivo".',
          'archivo-no-excel'
        )
      }

      // La hoja no se abre sin comprobar antes que es OOXML real: un `.xlsx`
      // es un ZIP y el nombre no prueba nada.
      await assertSpreadsheetFile(file)

      if (file.hasErrors) {
        const sizeError = file.errors.some((err) => err.type === 'size')
        return sizeError
          ? this.respondImportFileError(
              response,
              i18n,
              'contrato_servicio_especializado_importacion_archivo_muy_grande_title',
              'Archivo demasiado grande',
              'contrato_servicio_especializado_importacion_archivo_muy_grande_message',
              'El archivo supera el tamaño máximo permitido de 10 MB.',
              'archivo-no-excel'
            )
          : this.respondImportFileError(
              response,
              i18n,
              'contrato_servicio_especializado_importacion_archivo_invalido_title',
              'Archivo inválido',
              'contrato_servicio_especializado_importacion_archivo_invalido_message',
              'El archivo no es un Excel (.xlsx) válido.',
              'archivo-no-excel'
            )
      }

      const importService = new ContratoServicioEspecializadoImportService(i18n)
      const result = await importService.importFromExcel(file.tmpPath!)

      const responseType = result.summary.rejected > 0 ? 'warning' : 'success'
      const title = i18n.t(
        'contrato_servicio_especializado_importacion_title',
        undefined,
        'Importación de Contratos de Servicios Especializados'
      )
      const message =
        responseType === 'warning'
          ? i18n.t(
              'contrato_servicio_especializado_importacion_warning_message',
              { created: result.summary.created, rejected: result.summary.rejected },
              `Importación completada: ${result.summary.created} contrato(s) creado(s), ${result.summary.rejected} fila(s) rechazada(s).`
            )
          : i18n.t(
              'contrato_servicio_especializado_importacion_success_message',
              { created: result.summary.created },
              `Importación completada: ${result.summary.created} contrato(s) creado(s).`
            )

      response.status(200)
      return { type: responseType, title, message, data: result }
    } catch (error) {
      if (ContratoServicioEspecializadoImportService.isGlobalImportError(error)) {
        const body = ContratoServicioEspecializadoImportService.toGlobalErrorBody(error)
        response.status(400)
        return {
          type: 'error',
          title: resolveContratoImportGlobalErrorTitle(i18n, body.key),
          message: body.motivo,
          detail: body.motivo,
          key: body.key,
          errorCode: body.code,
          data: null,
        }
      }
      return this.respondError(error, response, 500, i18n)
    }
  }

  private respondImportFileError(
    response: HttpContext['response'],
    i18n: HttpContext['i18n'],
    titleKey: string,
    titleFallback: string,
    messageKey: string,
    messageFallback: string,
    key: string
  ) {
    const message = i18n.t(messageKey, undefined, messageFallback)
    response.status(400)
    return {
      type: 'error',
      title: i18n.t(titleKey, undefined, titleFallback),
      message,
      detail: message,
      key,
      errorCode: CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.IMP_ARCHIVO,
      data: null,
    }
  }

  /**
   * @swagger
   * /api/contratos-servicios-especializados/{id}:
   *   delete:
   *     summary: Soft delete de contrato de servicios especializados
   *     tags: [ContratosServiciosEspecializados]
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
   *         description: key contrato-no-encontrado
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
      const service = new ContratoServicioEspecializadoService()
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
        title: ctx.i18n.t(
          'contrato_servicio_especializado_unauthorized_title',
          undefined,
          'No autorizado'
        ),
        message: ctx.i18n.t(
          'contrato_servicio_especializado_unauthorized_message',
          undefined,
          'Usuario no autenticado'
        ),
        errorCode: CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.FORBIDDEN,
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
      throw new ContratoServicioEspecializadoError(
        'El identificador del contrato es inválido.',
        CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.VAL_INPUT,
        400
      )
    }
    return id
  }

  private toCreatePayload(body: Record<string, unknown>): ContratoServicioEspecializadoCreatePayload {
    const anexoRaw = body.anexo15d as Record<string, unknown>
    return {
      empresaContratanteId: Number(body.empresaContratanteId),
      numeroContrato: String(body.numeroContrato),
      fechaInicio: body.fechaInicio as Date,
      fechaFin: body.fechaFin === undefined ? undefined : (body.fechaFin as Date | null),
      objetoServicio: String(body.objetoServicio),
      montoTotal: body.montoTotal === undefined ? undefined : (body.montoTotal as number | null),
      moneda: body.moneda === undefined ? undefined : String(body.moneda),
      estatus: body.estatus as ContratoServicioEspecializadoCreatePayload['estatus'],
      anexo15d: this.toAnexoCreatePayload(anexoRaw),
      serviciosRegistradosIds: (body.serviciosRegistradosIds as number[]).map(Number),
    }
  }

  private toUpdatePayload(body: Record<string, unknown>): ContratoServicioEspecializadoUpdatePayload {
    const payload: ContratoServicioEspecializadoUpdatePayload = {}
    if (body.numeroContrato !== undefined) payload.numeroContrato = String(body.numeroContrato)
    if (body.fechaInicio !== undefined) payload.fechaInicio = body.fechaInicio as Date
    if (body.fechaFin !== undefined) payload.fechaFin = body.fechaFin as Date | null
    if (body.objetoServicio !== undefined) payload.objetoServicio = String(body.objetoServicio)
    if (body.montoTotal !== undefined) payload.montoTotal = body.montoTotal as number | null
    if (body.moneda !== undefined) payload.moneda = String(body.moneda)
    if (body.estatus !== undefined) {
      payload.estatus = body.estatus as ContratoServicioEspecializadoUpdatePayload['estatus']
    }
    if (body.anexo15d !== undefined) {
      payload.anexo15d = this.toAnexoUpdatePayload(body.anexo15d as Record<string, unknown>)
    }
    if (body.serviciosRegistradosIds !== undefined) {
      payload.serviciosRegistradosIds = (body.serviciosRegistradosIds as number[]).map(Number)
    }
    return payload
  }

  private toAnexoCreatePayload(raw: Record<string, unknown>): Anexo15dCreatePayload {
    return {
      objetoDetallado: String(raw.objetoDetallado),
      numeroTrabajadoresAprox: Number(raw.numeroTrabajadoresAprox),
      fechaInicioServicio: raw.fechaInicioServicio as Date,
      fechaFinServicio:
        raw.fechaFinServicio === undefined ? undefined : (raw.fechaFinServicio as Date | null),
      compromisosDocumentales: raw.compromisosDocumentales as Anexo15dCreatePayload['compromisosDocumentales'],
      responsabilidadSolidariaAceptada:
        raw.responsabilidadSolidariaAceptada === undefined
          ? undefined
          : Boolean(raw.responsabilidadSolidariaAceptada),
      textoResponsabilidadSolidaria: String(raw.textoResponsabilidadSolidaria),
    }
  }

  private toAnexoUpdatePayload(raw: Record<string, unknown>): Anexo15dUpdatePayload {
    const payload: Anexo15dUpdatePayload = {}
    if (raw.objetoDetallado !== undefined) payload.objetoDetallado = String(raw.objetoDetallado)
    if (raw.numeroTrabajadoresAprox !== undefined) {
      payload.numeroTrabajadoresAprox = Number(raw.numeroTrabajadoresAprox)
    }
    if (raw.fechaInicioServicio !== undefined) {
      payload.fechaInicioServicio = raw.fechaInicioServicio as Date
    }
    if (raw.fechaFinServicio !== undefined) {
      payload.fechaFinServicio = raw.fechaFinServicio as Date | null
    }
    if (raw.compromisosDocumentales !== undefined) {
      payload.compromisosDocumentales =
        raw.compromisosDocumentales as Anexo15dUpdatePayload['compromisosDocumentales']
    }
    if (raw.responsabilidadSolidariaAceptada !== undefined) {
      payload.responsabilidadSolidariaAceptada = Boolean(raw.responsabilidadSolidariaAceptada)
    }
    if (raw.textoResponsabilidadSolidaria !== undefined) {
      payload.textoResponsabilidadSolidaria = String(raw.textoResponsabilidadSolidaria)
    }
    return payload
  }

  /**
   * Normaliza el query param `estatus` desde string CSV, array o valor único.
   */
  private parseEstatusList(value: unknown): string[] | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined
    }

    const rawList = Array.isArray(value)
      ? value.map(String)
      : String(value)
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item.length > 0)

    return rawList.length > 0 ? rawList : undefined
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

    const resolved = resolveContratoServicioEspecializadoApiError(error, fallback, i18n)
    if (resolved.errorCode === CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.SYS_UNHANDLED) {
      logger.error({ err: error }, 'Error inesperado en contratos de servicios especializados')
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
