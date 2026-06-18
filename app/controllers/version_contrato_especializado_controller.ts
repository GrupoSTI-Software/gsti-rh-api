import logger from '@adonisjs/core/services/logger'
import type { HttpContext } from '@adonisjs/core/http'
import VersionContratoEspecializadoService from '#services/version_contrato_especializado_service'
import {
  contratoIdParamValidator,
  obtenerVersionContratoParamsValidator,
  renovarContratoValidator,
} from '#validators/compliance-repse/renovar_contrato.validator'
import { addendarContratoValidator } from '#validators/compliance-repse/addendar_contrato.validator'
import type { Anexo15dUpdatePayload } from '#services/contrato_servicio_especializado_service'
import { VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES } from '../constants/version_contrato_especializado_error_codes.js'
import {
  resolveVersionContratoApiError,
  type ResolveVersionContratoApiErrorOptions,
} from '../helpers/version_contrato_especializado_api_error.js'
import {
  assertComplianceRepsePermission,
  type ComplianceRepseAction,
} from '../helpers/compliance_repse_rbac.js'
import { StandardResponseFormatter } from '../helpers/standard_response_formatter.js'
import { VersionContratoEspecializadoError } from '../exceptions/version_contrato_especializado_error.js'

const ADDENDUM_VALIDATION_ERROR_OPTIONS: ResolveVersionContratoApiErrorOptions = {
  validationErrorCode: VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES.VAL_ADDENDUM,
  validationKey: 'addendum-invalido',
}

const MODULE_SLUG = 'compliance-contratos'
const RBAC_FORBIDDEN = {
  errorCode: VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES.FORBIDDEN,
  i18nPrefix: 'version_contrato_especializado',
}

/**
 * Controlador REST de versiones históricas y renovación de contratos REPSE.
 */
export default class VersionContratoEspecializadoController {
  /**
   * @swagger
   * /api/contratos-servicios-especializados/{contratoId}/renovaciones:
   *   post:
   *     summary: Renovar vigencia del contrato conservando historial
   *     description: |
   *       Toma un snapshot inmutable del estado actual (anexo 15-D, vigencia y documento vigente)
   *       y actualiza fechaInicio/fechaFin del contrato en una sola transacción.
   *     tags: [VersionesContratoEspecializado]
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
   *             $ref: '#/components/schemas/RenovarContratoRequest'
   *     responses:
   *       '201':
   *         description: Contrato renovado con versión histórica generada
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/RenovacionContratoSuccess'
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
   *       '409':
   *         description: key contrato-no-renovable
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   */
  async renew(ctx: HttpContext) {
    const { params, request, response, i18n, auth } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'update'))) return

      const { contratoId } = await contratoIdParamValidator.validate({
        contratoId: Number(params.contratoId),
      })
      const body = await request.validateUsing(renovarContratoValidator)

      const service = new VersionContratoEspecializadoService()
      const result = await service.renovarContrato({
        contratoId,
        fechaInicio: body.fechaInicio as Date,
        fechaFin: body.fechaFin as Date,
        motivo: body.motivo,
        creadoPor: auth.user?.userId ?? null,
      })

      return StandardResponseFormatter.success(
        response,
        result,
        i18n.t('version_contrato_especializado_title', undefined, 'Versión de contrato'),
        i18n.t(
          'version_contrato_especializado_renewed_successfully',
          undefined,
          'Contrato renovado correctamente'
        ),
        201
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/contratos-servicios-especializados/{contratoId}/addendums:
   *   post:
   *     summary: Registrar addendum al anexo 15-D conservando historial
   *     description: |
   *       Toma un snapshot inmutable del anexo 15-D vigente y aplica los cambios addendables
   *       sobre el head en una sola transacción. No altera la vigencia del contrato.
   *       Solo contratos en estatus efectivo vigente.
   *     tags: [VersionesContratoEspecializado]
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
   *             $ref: '#/components/schemas/AddendumContratoRequest'
   *     responses:
   *       '201':
   *         description: Addendum registrado con versión histórica generada
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/AddendumContratoSuccess'
   *       '400':
   *         description: key addendum-invalido
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
   *       '409':
   *         description: key contrato-no-addendable o anexo ausente
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ComplianceRepseApiError'
   */
  async addendum(ctx: HttpContext) {
    const { params, request, response, i18n, auth } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'update'))) return

      const { contratoId } = await contratoIdParamValidator.validate({
        contratoId: Number(params.contratoId),
      })

      const rawBody = request.all() as Record<string, unknown>
      const rawAnexo = rawBody.anexo
      if (rawAnexo !== null && typeof rawAnexo === 'object' && 'folioRepse' in rawAnexo) {
        throw new VersionContratoEspecializadoError(
          'El campo folioRepse no es addendable.',
          VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES.VAL_ADDENDUM,
          400,
          'addendum-invalido',
          'El campo folioRepse no es addendable.'
        )
      }

      const body = await request.validateUsing(addendarContratoValidator)

      const service = new VersionContratoEspecializadoService()
      const result = await service.registrarAddendum({
        contratoId,
        motivo: body.motivo,
        anexo: this.toAnexoUpdatePayload(body.anexo as Record<string, unknown>),
        creadoPor: auth.user?.userId ?? null,
      })

      return StandardResponseFormatter.success(
        response,
        result,
        i18n.t('version_contrato_especializado_title', undefined, 'Versión de contrato'),
        i18n.t(
          'version_contrato_especializado_addendum_successfully',
          undefined,
          'Addendum registrado correctamente'
        ),
        201
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n, ADDENDUM_VALIDATION_ERROR_OPTIONS)
    }
  }

  /**
   * @swagger
   * /api/contratos-servicios-especializados/{contratoId}/versiones:
   *   get:
   *     summary: Listar versiones históricas del contrato
   *     description: |
   *       Devuelve los estados superados ordenados por numeroVersion descendente.
   *       Excluye versiones con soft delete (deleted_at). El param incluirEliminadas
   *       se añadirá cuando exista endpoint de borrado lógico.
   *     tags: [VersionesContratoEspecializado]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: contratoId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200':
   *         description: Listado de versiones históricas
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/VersionesContratoListSuccess'
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

      const { contratoId } = await contratoIdParamValidator.validate({
        contratoId: Number(params.contratoId),
      })

      const service = new VersionContratoEspecializadoService()
      const versiones = await service.listarVersiones(contratoId)

      return StandardResponseFormatter.success(
        response,
        versiones,
        i18n.t('version_contrato_especializado_title', undefined, 'Versión de contrato'),
        i18n.t(
          'version_contrato_especializado_list_successfully',
          undefined,
          'Versiones históricas obtenidas correctamente'
        )
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/contratos-servicios-especializados/{contratoId}/versiones/{numeroVersion}:
   *   get:
   *     summary: Detalle de una versión histórica
   *     tags: [VersionesContratoEspecializado]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: contratoId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: numeroVersion
   *         required: true
   *         schema: { type: integer, minimum: 1 }
   *     responses:
   *       '200':
   *         description: Snapshot completo de la versión histórica
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/VersionContratoEspecializadoSuccess'
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
   *         description: key contrato-no-encontrado o version-no-encontrada
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

      const validated = await obtenerVersionContratoParamsValidator.validate({
        contratoId: Number(params.contratoId),
        numeroVersion: Number(params.numeroVersion),
      })

      const service = new VersionContratoEspecializadoService()
      const version = await service.obtenerVersion(validated.contratoId, validated.numeroVersion)

      return StandardResponseFormatter.success(
        response,
        version,
        i18n.t('version_contrato_especializado_title', undefined, 'Versión de contrato'),
        i18n.t(
          'version_contrato_especializado_found_successfully',
          undefined,
          'Versión histórica obtenida correctamente'
        )
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  private async assertAuthenticated(ctx: HttpContext) {
    if (!ctx.auth.user) {
      ctx.response.status(401).json({
        type: 'error',
        title: ctx.i18n.t(
          'version_contrato_especializado_unauthorized_title',
          undefined,
          'No autorizado'
        ),
        message: ctx.i18n.t(
          'version_contrato_especializado_unauthorized_message',
          undefined,
          'Usuario no autenticado'
        ),
        errorCode: VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES.FORBIDDEN,
        data: null,
      })
      return false
    }
    return true
  }

  private async assertHasPermission(ctx: HttpContext, action: ComplianceRepseAction) {
    return assertComplianceRepsePermission(ctx, MODULE_SLUG, action, RBAC_FORBIDDEN)
  }

  private respondError(
    error: unknown,
    response: HttpContext['response'],
    fallback: number,
    i18n: HttpContext['i18n'],
    options?: ResolveVersionContratoApiErrorOptions
  ) {
    const resolved = resolveVersionContratoApiError(error, fallback, i18n, options)
    if (resolved.errorCode === VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES.SYS_UNHANDLED) {
      logger.error({ err: error }, 'Error inesperado en versiones de contrato REPSE')
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
}
