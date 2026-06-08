import logger from '@adonisjs/core/services/logger'
import type { HttpContext } from '@adonisjs/core/http'
import ContratoServicioEspecializadoService, {
  type Anexo15dCreatePayload,
  type Anexo15dUpdatePayload,
  type ContratoServicioEspecializadoCreatePayload,
  type ContratoServicioEspecializadoUpdatePayload,
} from '#services/contrato_servicio_especializado_service'
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
import { StandardResponseFormatter } from '../helpers/standard_response_formatter.js'
import type { ContratoServicioEspecializadoEstatus } from '#models/contrato_servicio_especializado'

const MODULE_SLUG = 'compliance-contratos'
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
