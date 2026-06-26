import logger from '@adonisjs/core/services/logger'
import type { HttpContext } from '@adonisjs/core/http'
import AsignacionContratoEspecializadoService from '#services/asignacion_contrato_especializado_service'
import {
  createAsignacionesBulkValidator,
  findDuplicateEmployeeIndices,
  listAsignacionesContratoValidator,
  updateAsignacionContratoValidator,
} from '#validators/compliance-repse/asignacion_contrato_especializado.validator'
import { ASIGNACION_CONTRATO_ESPECIALIZADO_ERROR_CODES } from '../constants/asignacion_contrato_especializado_error_codes.js'
import { CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES } from '../constants/contrato_servicio_especializado_error_codes.js'
import { AsignacionContratoEspecializadoError } from '../exceptions/asignacion_contrato_especializado_error.js'
import { ContratoServicioEspecializadoError } from '../exceptions/contrato_servicio_especializado_error.js'
import { resolveAsignacionContratoEspecializadoApiError } from '../helpers/asignacion_contrato_especializado_api_error.js'
import {
  assertComplianceRepsePermission,
  type ComplianceRepseAction,
} from '../helpers/compliance_repse_rbac.js'
import { StandardResponseFormatter } from '../helpers/standard_response_formatter.js'

const MODULE_SLUG = 'repse-registrations'
const RBAC_FORBIDDEN = {
  errorCode: ASIGNACION_CONTRATO_ESPECIALIZADO_ERROR_CODES.FORBIDDEN,
  i18nPrefix: 'asignacion_contrato',
}

/**
 * Controlador REST de asignaciones de trabajadores a contratos REPSE.
 */
export default class AsignacionesContratoEspecializadoController {
  /**
   * @swagger
   * /api/contratos-servicios-especializados/{contratoId}/asignaciones:
   *   post:
   *     summary: Alta en bloque de asignaciones de trabajadores
   *     tags: [AsignacionesContratoEspecializado]
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
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/AsignacionesContratoBulkCreate'
   *     responses:
   *       '201':
   *         description: Asignaciones creadas con empleado poblado y advertencias por item
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/AsignacionesContratoCreateSuccess'
   *       '400':
   *         description: Validación VineJS o employeeId repetido en el payload
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
   *         description: key contrato-no-encontrado o empleado-no-encontrado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   *       '409':
   *         description: key asignacion-duplicada
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   *       '422':
   *         description: key contrato-no-vigente, asignacion-fuera-de-vigencia o fecha-fin-anterior-a-fecha-inicio
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   */
  async store(ctx: HttpContext) {
    const { params, request, response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'create'))) return

      const contratoId = this.parseContratoId(params.contratoId)
      const body = await request.validateUsing(createAsignacionesBulkValidator)
      this.assertNoDuplicateEmployees(body.asignaciones)

      const service = new AsignacionContratoEspecializadoService()
      const created = await service.createBulk(contratoId, body.asignaciones)

      return StandardResponseFormatter.success(
        response,
        created,
        i18n.t(
          'asignacion_contrato_especializado_title',
          undefined,
          'Asignaciones de Contrato Especializado'
        ),
        i18n.t(
          'asignacion_contrato_especializado_created_successfully',
          undefined,
          'Asignaciones creadas correctamente'
        ),
        201
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/contratos-servicios-especializados/{contratoId}/asignaciones:
   *   get:
   *     summary: Listado paginado de asignaciones del contrato
   *     tags: [AsignacionesContratoEspecializado]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: contratoId
   *         required: true
   *         schema: { type: integer }
   *       - in: query
   *         name: employeeId
   *         schema: { type: integer }
   *       - in: query
   *         name: vigentesEn
   *         schema: { type: string, format: date }
   *       - in: query
   *         name: page
   *         schema: { type: integer, minimum: 1, default: 1 }
   *       - in: query
   *         name: perPage
   *         schema: { type: integer, minimum: 1, maximum: 500, default: 20 }
   *     responses:
   *       '200':
   *         description: Listado paginado con empleado poblado (sin advertencias; solo en POST/PATCH)
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/AsignacionesContratoListSuccess'
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
    const { params, request, response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'read'))) return

      const contratoId = this.parseContratoId(params.contratoId)
      const filters = await listAsignacionesContratoValidator.validate({
        page: request.input('page'),
        perPage: request.input('perPage'),
        employeeId: request.input('employeeId'),
        vigentesEn: request.input('vigentesEn'),
      })

      const vigentesEnIso =
        filters.vigentesEn !== undefined
          ? typeof filters.vigentesEn === 'string'
            ? filters.vigentesEn
            : (filters.vigentesEn as Date).toISOString().slice(0, 10)
          : undefined

      const service = new AsignacionContratoEspecializadoService()
      const bundle = await service.listPaginated(contratoId, {
        page: filters.page ?? 1,
        perPage: filters.perPage ?? 20,
        employeeId: filters.employeeId,
        vigentesEn: vigentesEnIso,
      })

      return StandardResponseFormatter.success(
        response,
        bundle,
        i18n.t(
          'asignacion_contrato_especializado_title',
          undefined,
          'Asignaciones de Contrato Especializado'
        ),
        i18n.t(
          'asignacion_contrato_especializado_listed_successfully',
          undefined,
          'Asignaciones obtenidas correctamente'
        )
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/contratos-servicios-especializados/{contratoId}/asignaciones/{id}:
   *   patch:
   *     summary: Actualizar fechas o porcentaje de dedicación
   *     tags: [AsignacionesContratoEspecializado]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: contratoId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/AsignacionContratoUpdate'
   *     responses:
   *       '200':
   *         description: Asignación actualizada con advertencias de porcentaje si aplica
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/AsignacionContratoUpdateSuccess'
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
   *         description: Contrato o asignación no encontrada
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   *       '409':
   *         description: key asignacion-duplicada
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   *       '422':
   *         description: key asignacion-fuera-de-vigencia o fecha-fin-anterior-a-fecha-inicio
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

      const contratoId = this.parseContratoId(params.contratoId)
      const asignacionId = this.parseAsignacionId(params.id)
      const body = await request.validateUsing(updateAsignacionContratoValidator)
      this.assertPatchHasFields(body)

      const service = new AsignacionContratoEspecializadoService()
      const updated = await service.update(contratoId, asignacionId, body)

      return StandardResponseFormatter.success(
        response,
        updated,
        'Asignación de Contrato Especializado',
        i18n.t(
          'asignacion_contrato_especializado_updated_successfully',
          undefined,
          'Asignación actualizada correctamente'
        )
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/contratos-servicios-especializados/{contratoId}/asignaciones/{id}:
   *   delete:
   *     summary: Soft delete de asignación (solo errores de captura)
   *     tags: [AsignacionesContratoEspecializado]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: contratoId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '204':
   *         description: Eliminado lógicamente (sin cuerpo)
   *       '401':
   *         description: No autenticado
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
   *         description: Contrato o asignación no encontrada
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   */
  async destroy(ctx: HttpContext) {
    const { params, response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'delete'))) return

      const contratoId = this.parseContratoId(params.contratoId)
      const asignacionId = this.parseAsignacionId(params.id)
      const service = new AsignacionContratoEspecializadoService()
      await service.destroy(contratoId, asignacionId)

      return response.noContent()
    } catch (error) {
      return this.respondError(error, response, 404, i18n)
    }
  }

  private assertNoDuplicateEmployees(asignaciones: Array<{ employeeId: number }>) {
    const duplicateIndices = findDuplicateEmployeeIndices(asignaciones)
    if (duplicateIndices.length === 0) return

    throw new AsignacionContratoEspecializadoError(
      `employeeId repetido en los items: ${duplicateIndices.join(', ')}`,
      ASIGNACION_CONTRATO_ESPECIALIZADO_ERROR_CODES.VAL_EMPLOYEE_DUPLICATE,
      400,
      undefined,
      `Los items ${duplicateIndices.join(', ')} repiten el mismo employeeId`
    )
  }

  private assertPatchHasFields(body: Record<string, unknown>) {
    const hasField =
      body.fechaInicio !== undefined ||
      body.fechaFin !== undefined ||
      body.porcentajeTiempo !== undefined
    if (!hasField) {
      throw new AsignacionContratoEspecializadoError(
        'Debe indicar al menos un campo a actualizar.',
        ASIGNACION_CONTRATO_ESPECIALIZADO_ERROR_CODES.VAL_INPUT,
        400
      )
    }
  }

  private async assertAuthenticated(ctx: HttpContext) {
    await ctx.auth.check()
    if (!ctx.auth.user) {
      ctx.response.status(401).json({
        type: 'error',
        title: ctx.i18n.t(
          'asignacion_contrato_especializado_unauthorized_title',
          undefined,
          'No autorizado'
        ),
        message: ctx.i18n.t(
          'asignacion_contrato_especializado_unauthorized_message',
          undefined,
          'Usuario no autenticado'
        ),
        errorCode: ASIGNACION_CONTRATO_ESPECIALIZADO_ERROR_CODES.FORBIDDEN,
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

  private parseAsignacionId(raw: unknown) {
    const id = Number(raw)
    if (!Number.isFinite(id) || id <= 0) {
      throw new AsignacionContratoEspecializadoError(
        'El identificador de la asignación es inválido.',
        ASIGNACION_CONTRATO_ESPECIALIZADO_ERROR_CODES.VAL_INPUT,
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
    const resolved = resolveAsignacionContratoEspecializadoApiError(error, fallback, i18n)
    if (resolved.errorCode === ASIGNACION_CONTRATO_ESPECIALIZADO_ERROR_CODES.SYS_UNHANDLED) {
      logger.error({ err: error }, 'Error inesperado en asignaciones de contrato REPSE')
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
