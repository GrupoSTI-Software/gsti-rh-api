import type { HttpContext } from '@adonisjs/core/http'
import AttentionProgramService from '#services/attention_program_service'
import RoleService from '#services/role_service'
import { StandardResponseFormatter } from '../helpers/standard_response_formatter.js'
import {
  createAttentionProgramValidator,
  listAttentionProgramsValidator,
  updateAttentionProgramValidator,
} from '#validators/attention_program'
import { ATTENTION_PROGRAM_ERROR_CODES } from '#constants/attention_program_error_codes'
import { AttentionProgramServiceError } from '#exceptions/attention_program_service_error'
import { resolveAttentionProgramApiError } from '../helpers/attention_program_api_error.js'

export default class AttentionProgramController {
  /**
   * @swagger
   * components:
   *   schemas:
   *     ApiError:
   *       type: object
   *       properties:
   *         type:
   *           type: string
   *           enum: [error]
   *         title:
   *           type: string
   *         message:
   *           type: string
   *         detail:
   *           type: string
   *         key:
   *           type: string
   *         errorCode:
   *           type: string
   *         code:
   *           type: string
   *         data:
   *           nullable: true
   *
   *     Nom035PrgError:
   *       allOf:
   *         - $ref: '#/components/schemas/ApiError'
   *       example:
   *         type: error
   *         title: Programa de atención NOM-035
   *         message: Ya existe un Programa abierto para la empresa
   *         detail: Ya existe un Programa abierto para la empresa
   *         key: programa-abierto
   *         code: NOM035.PRG.ALREADY_OPEN
   *         data: null
   *
   *     AttentionProgramCatalogDimensionItem:
   *       type: object
   *       properties:
   *         psychosocialDimensionId:
   *           type: integer
   *         code:
   *           type: string
   *         nameKey:
   *           type: string
   *         name:
   *           type: string
   *         ord:
   *           type: integer
   *
   *     AttentionProgramCatalogLevelItem:
   *       type: object
   *       properties:
   *         attentionActionLevelId:
   *           type: integer
   *         code:
   *           type: string
   *         nameKey:
   *           type: string
   *         name:
   *           type: string
   *         order:
   *           type: integer
   *
   *     AttentionProgramCatalogSuccess:
   *       type: object
   *       properties:
   *         type:
   *           type: string
   *           enum: [success]
   *         title:
   *           type: string
   *         message:
   *           type: string
   *         data:
   *           type: object
   *           properties:
   *             attentionProgramCatalog:
   *               type: object
   *               properties:
   *                 dimensions:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/AttentionProgramCatalogDimensionItem'
   *                 actionLevels:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/AttentionProgramCatalogLevelItem'
   *
   *     AttentionProgramItem:
   *       type: object
   *       properties:
   *         attentionProgramId:
   *           type: integer
   *         businessUnitId:
   *           type: integer
   *         regulationId:
   *           type: integer
   *         questionnaireApplicationId:
   *           type: integer
   *           nullable: true
   *         originApplication:
   *           $ref: '#/components/schemas/AttentionProgramOriginApplicationItem'
   *         year:
   *           type: integer
   *         period:
   *           type: string
   *           nullable: true
   *         status:
   *           type: string
   *           enum: [borrador, vigente, cerrado]
   *         actionCount:
   *           type: integer
   *         createdAt:
   *           type: string
   *           format: date-time
   *         updatedAt:
   *           type: string
   *           format: date-time
   *
   *     AttentionProgramOriginApplicationItem:
   *       type: object
   *       nullable: true
   *       properties:
   *         questionnaireApplicationId:
   *           type: integer
   *         folio:
   *           type: string
   *         branchOfficeName:
   *           type: string
   *           nullable: true
   *         status:
   *           type: string
   *           enum: [borrador, en-curso, cerrada]
   *         year:
   *           type: integer
   *         period:
   *           type: string
   *           nullable: true
   *
   *     AttentionProgramSuccess:
   *       type: object
   *       properties:
   *         type:
   *           type: string
   *           enum: [success]
   *         title:
   *           type: string
   *         message:
   *           type: string
   *         data:
   *           type: object
   *           properties:
   *             attentionProgram:
   *               $ref: '#/components/schemas/AttentionProgramItem'
   *
   *     AttentionProgramListSuccess:
   *       type: object
   *       properties:
   *         type:
   *           type: string
   *           enum: [success]
   *         title:
   *           type: string
   *         message:
   *           type: string
   *         data:
   *           type: object
   *           properties:
   *             attentionPrograms:
   *               type: object
   *               properties:
   *                 meta:
   *                   type: object
   *                 data:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/AttentionProgramItem'
   *
   *     AttentionProgramCreate:
   *       type: object
   *       required: [year]
   *       properties:
   *         year:
   *           type: integer
   *           minimum: 2000
   *           maximum: 2100
   *         period:
   *           type: string
   *           maxLength: 100
   *         questionnaireApplicationId:
   *           type: integer
   *           minimum: 1
   *
   *     AttentionProgramUpdate:
   *       type: object
   *       properties:
   *         period:
   *           type: string
   *           maxLength: 100
   *         status:
   *           type: string
   *           enum: [borrador, vigente]
   */
  private async checkPermission(ctx: HttpContext, action: 'read' | 'write'): Promise<boolean> {
    const user = ctx.auth.user
    if (!user) return false

    await user.load('role')
    if (user.role?.roleSlug === 'root') return true

    const roleService = new RoleService()
    return roleService.hasAccess(user.roleId, 'compliance', action)
  }

  private respondError(
    error: unknown,
    response: HttpContext['response'],
    fallbackStatus: number,
    i18n: HttpContext['i18n']
  ) {
    const resolved = resolveAttentionProgramApiError(error, fallbackStatus, i18n)
    response.status(resolved.status)
    return {
      type: 'error',
      title: resolved.title,
      message: resolved.message,
      key: resolved.key,
      detail: resolved.detail,
      code: resolved.errorCode,
      data: null,
    }
  }

  private parseAttentionProgramId(value: unknown, i18n: HttpContext['i18n']): number {
    const attentionProgramId = Number(value)
    if (!Number.isInteger(attentionProgramId) || attentionProgramId <= 0) {
      const detail = 'El parámetro id debe ser un entero positivo'
      throw new AttentionProgramServiceError(
        i18n.formatMessage('nom035.attention_program.val_input'),
        ATTENTION_PROGRAM_ERROR_CODES.VAL_INPUT,
        400,
        'datos-invalidos',
        detail
      )
    }

    return attentionProgramId
  }

  private parseBusinessUnitId(value: unknown, i18n: HttpContext['i18n']): number {
    const businessUnitId = Number(value)
    if (!Number.isInteger(businessUnitId) || businessUnitId <= 0) {
      const detail = 'El campo businessUnitId es obligatorio y debe ser un entero positivo'
      throw new AttentionProgramServiceError(
        i18n.formatMessage('nom035.attention_program.val_input'),
        ATTENTION_PROGRAM_ERROR_CODES.VAL_INPUT,
        400,
        'datos-invalidos',
        detail
      )
    }

    return businessUnitId
  }

  /**
   * @swagger
   * /api/nom035/attention-program-catalog:
   *   get:
   *     summary: Obtener catálogo cerrado del Programa de atención NOM-035
   *     tags: [NOM035]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema:
   *           type: string
   *         description: Bearer token de autenticación (`Bearer <access_token>`)
   *       - in: header
   *         name: Accept-Language
   *         required: false
   *         schema:
   *           type: string
   *           enum: [es, en]
   *     responses:
   *       '200':
   *         description: Catálogo obtenido correctamente
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/AttentionProgramCatalogSuccess'
   *             example:
   *               type: success
   *               title: Catálogo Programa de atención
   *               message: Catálogo del Programa de atención obtenido correctamente
   *               data:
   *                 attentionProgramCatalog:
   *                   dimensions:
   *                     - psychosocialDimensionId: 1
   *                       code: LIDERAZGO_RELACIONES
   *                       nameKey: regulatory.nom035.dimension.liderazgo_relaciones
   *                       name: Liderazgo y relaciones en el trabajo
   *                       ord: 1
   *                   actionLevels:
   *                     - attentionActionLevelId: 1
   *                       code: organizacional
   *                       nameKey: regulatory.nom035.action_level.organizacional
   *                       name: Organizacional (primer nivel)
   *                       order: 1
   *       '401':
   *         description: No autenticado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ApiError'
   *             example:
   *               type: error
   *               title: Autenticación requerida
   *               message: Debes iniciar sesión para acceder a este recurso
   *               detail: Token de acceso inválido o ausente
   *               key: no-autenticado
   *               errorCode: AUTH.UNAUTHORIZED
   *               data: null
   *       '403':
   *         description: Sin permiso para consultar catálogo
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Nom035PrgError'
   *             example:
   *               type: error
   *               title: Programa de atención NOM-035
   *               message: Sin permiso para gestionar Programa de atención
   *               detail: Sin permiso para gestionar Programa de atención
   *               key: sin-permiso
   *               code: NOM035.PRG.FORBIDDEN
   *               data: null
   */
  async catalog(ctx: HttpContext) {
    const { response, i18n } = ctx
    try {
      if (!(await this.checkPermission(ctx, 'read'))) {
        throw new AttentionProgramServiceError(
          i18n.formatMessage('nom035.attention_program.forbidden'),
          ATTENTION_PROGRAM_ERROR_CODES.FORBIDDEN,
          403,
          'sin-permiso'
        )
      }

      const service = new AttentionProgramService()
      const catalog = await service.getCatalog(i18n)
      return StandardResponseFormatter.success(
        response,
        catalog,
        'Catálogo Programa de atención',
        i18n.formatMessage('nom035.attention_program.catalog_message')
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/nom035/attention-programs:
   *   get:
   *     summary: Listar Programas de atención NOM-035
   *     tags: [NOM035]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema:
   *           type: string
   *         description: Bearer token de autenticación (`Bearer <access_token>`)
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: false
   *         schema:
   *           type: integer
   *         description: Unidad de negocio activa para narrowing de scope
   *       - in: header
   *         name: Accept-Language
   *         required: false
   *         schema:
   *           type: string
   *           enum: [es, en]
   *       - in: query
   *         name: status
   *         required: false
   *         schema:
   *           type: string
   *           enum: [borrador, vigente, cerrado]
   *       - in: query
   *         name: page
   *         required: false
   *         schema:
   *           type: integer
   *           minimum: 1
   *       - in: query
   *         name: limit
   *         required: false
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *     responses:
   *       '200':
   *         description: Programas obtenidos correctamente
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/AttentionProgramListSuccess'
   *       '400':
   *         description: Parámetros inválidos
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Nom035PrgError'
   *             example:
   *               type: error
   *               title: Programa de atención NOM-035
   *               message: Datos inválidos
   *               detail: Datos inválidos
   *               key: datos-invalidos
   *               code: NOM035.PRG.VAL_INPUT
   *               data: null
   *       '401':
   *         description: No autenticado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ApiError'
   *             example:
   *               type: warning
   *               title: Sesión inválida
   *               message: Debes iniciar sesión nuevamente
   *               detail: Access token inválido o ausente
   *               key: no-auth
   *               data:
   *                 refreshable: false
   *       '403':
   *         description: Sin permiso para consultar Programa de atención
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Nom035PrgError'
   *             example:
   *               type: error
   *               title: Programa de atención NOM-035
   *               message: Sin permiso para gestionar Programa de atención
   *               detail: Sin permiso para gestionar Programa de atención
   *               key: sin-permiso
   *               code: NOM035.PRG.FORBIDDEN
   *               data: null
   */
  async index(ctx: HttpContext) {
    const { request, response, i18n, businessUnitScope } = ctx
    try {
      if (!(await this.checkPermission(ctx, 'read'))) {
        throw new AttentionProgramServiceError(
          i18n.formatMessage('nom035.attention_program.forbidden'),
          ATTENTION_PROGRAM_ERROR_CODES.FORBIDDEN,
          403,
          'sin-permiso'
        )
      }

      const filters = await request.validateUsing(listAttentionProgramsValidator)
      const service = new AttentionProgramService()
      const result = await service.listPaginated(filters, businessUnitScope ?? [])
      return StandardResponseFormatter.success(
        response,
        result,
        'Attention Programs',
        i18n.formatMessage('nom035.attention_program.index_message')
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/nom035/attention-programs:
   *   post:
   *     summary: Crear cabecera de Programa de atención NOM-035
   *     tags: [NOM035]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema:
   *           type: string
   *         description: Bearer token de autenticación (`Bearer <access_token>`)
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Unidad de negocio activa para crear el Programa
   *       - in: header
   *         name: Accept-Language
   *         required: false
   *         schema:
   *           type: string
   *           enum: [es, en]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/AttentionProgramCreate'
   *           example:
   *             year: 2026
   *             period: Eval marzo
   *             questionnaireApplicationId: 1201
   *     responses:
   *       '201':
   *         description: Programa creado correctamente
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/AttentionProgramSuccess'
   *       '400':
   *         description: Datos de entrada inválidos
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Nom035PrgError'
   *             example:
   *               type: error
   *               title: Programa de atención NOM-035
   *               message: Datos inválidos
   *               detail: Debes enviar el header X-Business-Unit-Id para crear el Programa de atención
   *               key: datos-invalidos
   *               code: NOM035.PRG.VAL_INPUT
   *               data: null
   *       '401':
   *         description: No autenticado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ApiError'
   *             example:
   *               type: warning
   *               title: Sesión inválida
   *               message: Debes iniciar sesión nuevamente
   *               detail: Access token inválido o ausente
   *               key: no-auth
   *               data:
   *                 refreshable: false
   *       '403':
   *         description: Sin permiso para crear Programa de atención
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Nom035PrgError'
   *             example:
   *               type: error
   *               title: Programa de atención NOM-035
   *               message: Sin permiso para gestionar Programa de atención
   *               detail: Sin permiso para gestionar Programa de atención
   *               key: sin-permiso
   *               code: NOM035.PRG.FORBIDDEN
   *               data: null
   *       '404':
   *         description: Evaluación de origen no encontrada o fuera de alcance
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Nom035PrgError'
   *             example:
   *               type: error
   *               title: Programa de atención NOM-035
   *               message: La evaluación de origen no existe o está fuera del alcance del usuario
   *               detail: La evaluación de origen no existe o está fuera del alcance del usuario
   *               key: origen-no-encontrado
   *               code: NOM035.PRG.NOT_FOUND_ORIGIN
   *               data: null
   *       '409':
   *         description: Ya existe un Programa abierto para la empresa
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Nom035PrgError'
   *             example:
   *               type: error
   *               title: Programa de atención NOM-035
   *               message: Ya existe un Programa abierto para la empresa
   *               detail: Ya existe un Programa abierto para la empresa
   *               key: programa-abierto
   *               code: NOM035.PRG.ALREADY_OPEN
   *               data: null
   *       '422':
   *         description: Error de validación
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Nom035PrgError'
   *             example:
   *               type: error
   *               title: Programa de atención NOM-035
   *               message: Datos inválidos
   *               detail: El campo year es obligatorio
   *               key: datos-invalidos
   *               code: NOM035.PRG.VAL_INPUT
   *               data: null
   */
  async store(ctx: HttpContext) {
    const { request, response, i18n, businessUnitScope } = ctx
    try {
      if (!(await this.checkPermission(ctx, 'write'))) {
        throw new AttentionProgramServiceError(
          i18n.formatMessage('nom035.attention_program.forbidden'),
          ATTENTION_PROGRAM_ERROR_CODES.FORBIDDEN,
          403,
          'sin-permiso'
        )
      }

      const payload = await request.validateUsing(createAttentionProgramValidator)
      const scope = businessUnitScope ?? []
      const selectedBusinessUnitIdFromRequest = request.input('businessUnitId')
      const businessUnitId =
        selectedBusinessUnitIdFromRequest !== undefined
          ? this.parseBusinessUnitId(selectedBusinessUnitIdFromRequest, i18n)
          : scope.length === 1
            ? scope[0]
            : null

      if (!businessUnitId) {
        throw new AttentionProgramServiceError(
          i18n.formatMessage('nom035.attention_program.val_input'),
          ATTENTION_PROGRAM_ERROR_CODES.VAL_INPUT,
          400,
          'datos-invalidos',
          'Debes enviar el header X-Business-Unit-Id para crear el Programa de atención'
        )
      }

      const service = new AttentionProgramService()
      const result = await service.store(payload, businessUnitId, scope, i18n)

      return StandardResponseFormatter.success(
        response,
        result,
        'Attention Program',
        i18n.formatMessage('nom035.attention_program.store_message'),
        201
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/nom035/attention-programs/{id}:
   *   get:
   *     summary: Obtener detalle de Programa de atención NOM-035
   *     tags: [NOM035]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema:
   *           type: string
   *         description: Bearer token de autenticación (`Bearer <access_token>`)
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: false
   *         schema:
   *           type: integer
   *         description: Unidad de negocio activa para narrowing de scope
   *       - in: header
   *         name: Accept-Language
   *         required: false
   *         schema:
   *           type: string
   *           enum: [es, en]
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *           minimum: 1
   *     responses:
   *       '200':
   *         description: Programa obtenido correctamente
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/AttentionProgramSuccess'
   *       '400':
   *         description: Parámetro inválido
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Nom035PrgError'
   *             example:
   *               type: error
   *               title: Programa de atención NOM-035
   *               message: Datos inválidos
   *               detail: El parámetro id debe ser un entero positivo
   *               key: datos-invalidos
   *               code: NOM035.PRG.VAL_INPUT
   *               data: null
   *       '401':
   *         description: No autenticado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ApiError'
   *             example:
   *               type: warning
   *               title: Sesión inválida
   *               message: Debes iniciar sesión nuevamente
   *               detail: Access token inválido o ausente
   *               key: no-auth
   *               data:
   *                 refreshable: false
   *       '403':
   *         description: Sin permiso para consultar Programa de atención
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Nom035PrgError'
   *             example:
   *               type: error
   *               title: Programa de atención NOM-035
   *               message: Sin permiso para gestionar Programa de atención
   *               detail: Sin permiso para gestionar Programa de atención
   *               key: sin-permiso
   *               code: NOM035.PRG.FORBIDDEN
   *               data: null
   *       '404':
   *         description: Programa no encontrado o fuera de alcance
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Nom035PrgError'
   *             example:
   *               type: error
   *               title: Programa de atención NOM-035
   *               message: Programa de atención no encontrado o fuera del alcance del usuario
   *               detail: Programa de atención no encontrado o fuera del alcance del usuario
   *               key: programa-no-encontrado
   *               code: NOM035.PRG.NOT_FOUND_PROGRAM
   *               data: null
   */
  async show(ctx: HttpContext) {
    const { params, response, i18n, businessUnitScope } = ctx
    try {
      if (!(await this.checkPermission(ctx, 'read'))) {
        throw new AttentionProgramServiceError(
          i18n.formatMessage('nom035.attention_program.forbidden'),
          ATTENTION_PROGRAM_ERROR_CODES.FORBIDDEN,
          403,
          'sin-permiso'
        )
      }

      const attentionProgramId = this.parseAttentionProgramId(params.id, i18n)
      const service = new AttentionProgramService()
      const result = await service.getById(attentionProgramId, businessUnitScope ?? [], i18n)
      return StandardResponseFormatter.success(
        response,
        result,
        'Attention Program',
        i18n.formatMessage('nom035.attention_program.show_message')
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/nom035/attention-programs/{id}:
   *   patch:
   *     summary: Editar cabecera de Programa de atención NOM-035
   *     tags: [NOM035]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema:
   *           type: string
   *         description: Bearer token de autenticación (`Bearer <access_token>`)
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: false
   *         schema:
   *           type: integer
   *         description: Unidad de negocio activa para narrowing de scope
   *       - in: header
   *         name: Accept-Language
   *         required: false
   *         schema:
   *           type: string
   *           enum: [es, en]
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *           minimum: 1
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/AttentionProgramUpdate'
   *           example:
   *             period: Eval octubre
   *             status: vigente
   *     responses:
   *       '200':
   *         description: Programa actualizado correctamente
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/AttentionProgramSuccess'
   *       '400':
   *         description: Datos de entrada inválidos
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Nom035PrgError'
   *             example:
   *               type: error
   *               title: Programa de atención NOM-035
   *               message: Datos inválidos
   *               detail: El parámetro id debe ser un entero positivo
   *               key: datos-invalidos
   *               code: NOM035.PRG.VAL_INPUT
   *               data: null
   *       '401':
   *         description: No autenticado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ApiError'
   *             example:
   *               type: warning
   *               title: Sesión inválida
   *               message: Debes iniciar sesión nuevamente
   *               detail: Access token inválido o ausente
   *               key: no-auth
   *               data:
   *                 refreshable: false
   *       '403':
   *         description: Sin permiso para actualizar Programa de atención
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Nom035PrgError'
   *             example:
   *               type: error
   *               title: Programa de atención NOM-035
   *               message: Sin permiso para gestionar Programa de atención
   *               detail: Sin permiso para gestionar Programa de atención
   *               key: sin-permiso
   *               code: NOM035.PRG.FORBIDDEN
   *               data: null
   *       '404':
   *         description: Programa no encontrado o fuera de alcance
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Nom035PrgError'
   *             example:
   *               type: error
   *               title: Programa de atención NOM-035
   *               message: Programa de atención no encontrado o fuera del alcance del usuario
   *               detail: Programa de atención no encontrado o fuera del alcance del usuario
   *               key: programa-no-encontrado
   *               code: NOM035.PRG.NOT_FOUND_PROGRAM
   *               data: null
   *       '422':
   *         description: Error de validación
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Nom035PrgError'
   *             example:
   *               type: error
   *               title: Programa de atención NOM-035
   *               message: Datos inválidos
   *               detail: El status no permite transición inválida
   *               key: datos-invalidos
   *               code: NOM035.PRG.VAL_INPUT
   *               data: null
   */
  async update(ctx: HttpContext) {
    const { params, request, response, i18n, businessUnitScope } = ctx
    try {
      if (!(await this.checkPermission(ctx, 'write'))) {
        throw new AttentionProgramServiceError(
          i18n.formatMessage('nom035.attention_program.forbidden'),
          ATTENTION_PROGRAM_ERROR_CODES.FORBIDDEN,
          403,
          'sin-permiso'
        )
      }

      const attentionProgramId = this.parseAttentionProgramId(params.id, i18n)
      const payload = await request.validateUsing(updateAttentionProgramValidator)
      const service = new AttentionProgramService()
      const result = await service.update(attentionProgramId, payload, businessUnitScope ?? [], i18n)
      return StandardResponseFormatter.success(
        response,
        result,
        'Attention Program',
        i18n.formatMessage('nom035.attention_program.update_message')
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }
}
