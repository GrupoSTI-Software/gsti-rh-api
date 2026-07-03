import type { HttpContext } from '@adonisjs/core/http'
import AttentionProgramActionService from '#services/attention_program_action_service'
import RoleService from '#services/role_service'
import { StandardResponseFormatter } from '../helpers/standard_response_formatter.js'
import {
  createAttentionProgramActionValidator,
  updateAttentionProgramActionValidator,
} from '#validators/attention_program_action'
import { ATTENTION_PROGRAM_ERROR_CODES } from '#constants/attention_program_error_codes'
import { AttentionProgramServiceError } from '#exceptions/attention_program_service_error'
import { resolveAttentionProgramApiError } from '../helpers/attention_program_api_error.js'

export default class AttentionProgramActionController {
  private async checkPermission(ctx: HttpContext, action: 'read' | 'write'): Promise<boolean> {
    const user = ctx.auth.user
    if (!user) return false

    await user.load('role')
    if (user.role?.roleSlug === 'root') return true

    const roleService = new RoleService()
    return roleService.hasAccess(user.roleId, 'compliance', action)
  }

  private parsePositiveId(value: unknown, fieldName: string, i18n: HttpContext['i18n']): number {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new AttentionProgramServiceError(
        i18n.formatMessage('nom035.attention_program.val_input'),
        ATTENTION_PROGRAM_ERROR_CODES.VAL_INPUT,
        400,
        'datos-invalidos',
        `El parámetro ${fieldName} debe ser un entero positivo`
      )
    }

    return parsed
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

  /**
   * @swagger
   * components:
   *   schemas:
   *     Nom035PrgActionError:
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
   *         code:
   *           type: string
   *         data:
   *           nullable: true
   *       example:
   *         type: error
   *         title: Programa de atención NOM-035
   *         message: Acción de programa incompleta
   *         detail: "Campo faltante: target"
   *         key: accion-incompleta
   *         code: NOM035.PRG.ACTION_INCOMPLETE
   *         data: null
   *
   *     AttentionProgramActionItem:
   *       type: object
   *       properties:
   *         attentionProgramActionId:
   *           type: integer
   *         attentionProgramId:
   *           type: integer
   *         psychosocialDimensionId:
   *           type: integer
   *         psychosocialDimensionCode:
   *           type: string
   *         psychosocialDimensionNameKey:
   *           type: string
   *         attentionActionLevelId:
   *           type: integer
   *         attentionActionLevelCode:
   *           type: string
   *         attentionActionLevelNameKey:
   *           type: string
   *         target:
   *           type: string
   *         description:
   *           type: string
   *         startDate:
   *           type: string
   *           format: date
   *         endDate:
   *           type: string
   *           format: date
   *         progress:
   *           type: string
   *         evaluation:
   *           type: string
   *         responsible:
   *           type: string
   *         status:
   *           type: string
   *           enum: [pendiente, en-curso, cumplida]
   *         createdAt:
   *           type: string
   *           format: date-time
   *         updatedAt:
   *           type: string
   *           format: date-time
   *
   *     AttentionProgramActionListSuccess:
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
   *             attentionProgramActions:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/AttentionProgramActionItem'
   *
   *     AttentionProgramActionSuccess:
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
   *             attentionProgramAction:
   *               $ref: '#/components/schemas/AttentionProgramActionItem'
   *
   *     AttentionProgramActionDeleteSuccess:
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
   *             attentionProgramAction:
   *               type: object
   *               properties:
   *                 deleted:
   *                   type: boolean
   *
   *     AttentionProgramActionCreate:
   *       type: object
   *       properties:
   *         psychosocialDimensionId:
   *           type: integer
   *           minimum: 1
   *         attentionActionLevelId:
   *           type: integer
   *           minimum: 1
   *         target:
   *           type: string
   *         description:
   *           type: string
   *         startDate:
   *           type: string
   *           format: date
   *         endDate:
   *           type: string
   *           format: date
   *         progress:
   *           type: string
   *         evaluation:
   *           type: string
   *         responsible:
   *           type: string
   *         status:
   *           type: string
   *           enum: [pendiente, en-curso, cumplida]
   *
   *     AttentionProgramActionUpdate:
   *       type: object
   *       properties:
   *         psychosocialDimensionId:
   *           type: integer
   *           minimum: 1
   *         attentionActionLevelId:
   *           type: integer
   *           minimum: 1
   *         target:
   *           type: string
   *         description:
   *           type: string
   *         startDate:
   *           type: string
   *           format: date
   *         endDate:
   *           type: string
   *           format: date
   *         progress:
   *           type: string
   *         evaluation:
   *           type: string
   *         responsible:
   *           type: string
   *         status:
   *           type: string
   *           enum: [pendiente, en-curso, cumplida]
   *
   * /api/nom035/attention-programs/{id}/actions:
   *   get:
   *     summary: Listar acciones del Programa de atención NOM-035
   *     tags: [NOM035]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema:
   *           type: string
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: false
   *         schema:
   *           type: integer
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
   *         description: Acciones obtenidas correctamente
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/AttentionProgramActionListSuccess'
   *             example:
   *               type: success
   *               title: Attention Program Actions
   *               message: Acciones del Programa de atención obtenidas correctamente
   *               data:
   *                 attentionProgramActions:
   *                   - attentionProgramActionId: 10
   *                     attentionProgramId: 20
   *                     psychosocialDimensionId: 1
   *                     psychosocialDimensionCode: LIDERAZGO_RELACIONES
   *                     psychosocialDimensionNameKey: regulatory.nom035.dimension.liderazgo_relaciones
   *                     attentionActionLevelId: 1
   *                     attentionActionLevelCode: organizacional
   *                     attentionActionLevelNameKey: regulatory.nom035.action_level.organizacional
   *                     target: Personal operativo
   *                     description: Taller de liderazgo
   *                     startDate: '2032-01-10'
   *                     endDate: '2032-01-25'
   *                     progress: Seguimiento semanal
   *                     evaluation: Encuesta de percepción
   *                     responsible: Coordinación de RH
   *                     status: pendiente
   *                     createdAt: '2032-01-01T00:00:00.000Z'
   *                     updatedAt: '2032-01-01T00:00:00.000Z'
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
   *         description: Sin permiso para consultar acciones
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
  async index(ctx: HttpContext) {
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

      const attentionProgramId = this.parsePositiveId(params.id, 'id', i18n)
      const service = new AttentionProgramActionService()
      const data = await service.listActions(attentionProgramId, businessUnitScope ?? [], i18n)

      return StandardResponseFormatter.success(
        response,
        data,
        'Attention Program Actions',
        i18n.formatMessage('nom035.attention_program_action.index_message')
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/nom035/attention-programs/{id}/actions:
   *   post:
   *     summary: Crear acción del Programa de atención NOM-035
   *     tags: [NOM035]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema:
   *           type: string
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: false
   *         schema:
   *           type: integer
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
   *             $ref: '#/components/schemas/AttentionProgramActionCreate'
   *           example:
   *             psychosocialDimensionId: 1
   *             attentionActionLevelId: 1
   *             target: Personal operativo
   *             description: Taller de liderazgo saludable
   *             startDate: '2032-01-10'
   *             endDate: '2032-01-25'
   *             progress: Seguimiento semanal en comité
   *             evaluation: Encuesta de resultados posterior
   *             responsible: Coordinación de RH
   *             status: pendiente
   *     responses:
   *       '201':
   *         description: Acción creada correctamente
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/AttentionProgramActionSuccess'
   *             example:
   *               type: success
   *               title: Attention Program Action
   *               message: Acción del Programa de atención creada correctamente
   *               data:
   *                 attentionProgramAction:
   *                   attentionProgramActionId: 10
   *                   attentionProgramId: 20
   *                   psychosocialDimensionId: 1
   *                   psychosocialDimensionCode: LIDERAZGO_RELACIONES
   *                   psychosocialDimensionNameKey: regulatory.nom035.dimension.liderazgo_relaciones
   *                   attentionActionLevelId: 1
   *                   attentionActionLevelCode: organizacional
   *                   attentionActionLevelNameKey: regulatory.nom035.action_level.organizacional
   *                   target: Personal operativo
   *                   description: Taller de liderazgo saludable
   *                   startDate: '2032-01-10'
   *                   endDate: '2032-01-25'
   *                   progress: Seguimiento semanal en comité
   *                   evaluation: Encuesta de resultados posterior
   *                   responsible: Coordinación de RH
   *                   status: pendiente
   *                   createdAt: '2032-01-01T00:00:00.000Z'
   *                   updatedAt: '2032-01-01T00:00:00.000Z'
   *       '400':
   *         description: Datos inválidos
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Nom035PrgError'
   *             example:
   *               type: error
   *               title: Programa de atención NOM-035
   *               message: Datos inválidos
   *               detail: Las fechas deben tener un formato válido
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
   *         description: Sin permiso para crear acciones
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
   *       '409':
   *         description: Programa cerrado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Nom035PrgError'
   *             example:
   *               type: error
   *               title: Programa de atención NOM-035
   *               message: El Programa está cerrado y solo permite lectura
   *               detail: El Programa está cerrado y solo permite lectura
   *               key: programa-cerrado
   *               code: NOM035.PRG.PROGRAM_CLOSED
   *               data: null
   *       '422':
   *         description: Acción incompleta o catálogo inválido
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Nom035PrgError'
   *             examples:
   *               accionIncompleta:
   *                 value:
   *                   type: error
   *                   title: Programa de atención NOM-035
   *                   message: Acción de programa incompleta
   *                   detail: "Campo faltante: target"
   *                   key: accion-incompleta
   *                   code: NOM035.PRG.ACTION_INCOMPLETE
   *                   data: null
   *               dimensionInvalida:
   *                 value:
   *                   type: error
   *                   title: Programa de atención NOM-035
   *                   message: La dimensión seleccionada no pertenece al catálogo oficial
   *                   detail: La dimensión seleccionada no pertenece al catálogo oficial
   *                   key: dimension-invalida
   *                   code: NOM035.PRG.INVALID_DIMENSION
   *                   data: null
   */
  async store(ctx: HttpContext) {
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

      const attentionProgramId = this.parsePositiveId(params.id, 'id', i18n)
      const payload = await request.validateUsing(createAttentionProgramActionValidator)
      const service = new AttentionProgramActionService()
      const data = await service.store(attentionProgramId, payload, businessUnitScope ?? [], i18n)

      return StandardResponseFormatter.success(
        response,
        data,
        'Attention Program Action',
        i18n.formatMessage('nom035.attention_program_action.store_message'),
        201
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/nom035/attention-programs/{id}/actions/{actionId}:
   *   patch:
   *     summary: Editar acción del Programa de atención NOM-035
   *     tags: [NOM035]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema:
   *           type: string
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: false
   *         schema:
   *           type: integer
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
   *       - in: path
   *         name: actionId
   *         required: true
   *         schema:
   *           type: integer
   *           minimum: 1
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/AttentionProgramActionUpdate'
   *           example:
   *             status: en-curso
   *             progress: Ejecución de sesiones en semana 2
   *     responses:
   *       '200':
   *         description: Acción actualizada correctamente
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/AttentionProgramActionSuccess'
   *             example:
   *               type: success
   *               title: Attention Program Action
   *               message: Acción del Programa de atención actualizada correctamente
   *               data:
   *                 attentionProgramAction:
   *                   attentionProgramActionId: 10
   *                   attentionProgramId: 20
   *                   psychosocialDimensionId: 1
   *                   psychosocialDimensionCode: LIDERAZGO_RELACIONES
   *                   psychosocialDimensionNameKey: regulatory.nom035.dimension.liderazgo_relaciones
   *                   attentionActionLevelId: 1
   *                   attentionActionLevelCode: organizacional
   *                   attentionActionLevelNameKey: regulatory.nom035.action_level.organizacional
   *                   target: Personal operativo
   *                   description: Taller de liderazgo saludable
   *                   startDate: '2032-01-10'
   *                   endDate: '2032-01-25'
   *                   progress: Ejecución de sesiones en semana 2
   *                   evaluation: Encuesta de resultados posterior
   *                   responsible: Coordinación de RH
   *                   status: en-curso
   *                   createdAt: '2032-01-01T00:00:00.000Z'
   *                   updatedAt: '2032-01-03T00:00:00.000Z'
   *       '400':
   *         description: Datos inválidos
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Nom035PrgError'
   *             example:
   *               type: error
   *               title: Programa de atención NOM-035
   *               message: Datos inválidos
   *               detail: El parámetro actionId debe ser un entero positivo
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
   *         description: Sin permiso para editar acciones
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
   *         description: Acción no encontrada o fuera de alcance
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Nom035PrgError'
   *             example:
   *               type: error
   *               title: Programa de atención NOM-035
   *               message: Acción de programa no encontrada o fuera del alcance del usuario
   *               detail: Acción de programa no encontrada o fuera del alcance del usuario
   *               key: accion-no-encontrada
   *               code: NOM035.PRG.ACTION_NOT_FOUND
   *               data: null
   *       '409':
   *         description: Programa cerrado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Nom035PrgError'
   *             example:
   *               type: error
   *               title: Programa de atención NOM-035
   *               message: El Programa está cerrado y solo permite lectura
   *               detail: El Programa está cerrado y solo permite lectura
   *               key: programa-cerrado
   *               code: NOM035.PRG.PROGRAM_CLOSED
   *               data: null
   *       '422':
   *         description: Acción incompleta o catálogo inválido
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Nom035PrgError'
   *             example:
   *               type: error
   *               title: Programa de atención NOM-035
   *               message: Acción de programa incompleta
   *               detail: "Campo faltante: responsible"
   *               key: accion-incompleta
   *               code: NOM035.PRG.ACTION_INCOMPLETE
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

      const attentionProgramId = this.parsePositiveId(params.id, 'id', i18n)
      const actionId = this.parsePositiveId(params.actionId, 'actionId', i18n)
      const payload = await request.validateUsing(updateAttentionProgramActionValidator)
      const service = new AttentionProgramActionService()
      const data = await service.update(
        attentionProgramId,
        actionId,
        payload,
        businessUnitScope ?? [],
        i18n
      )

      return StandardResponseFormatter.success(
        response,
        data,
        'Attention Program Action',
        i18n.formatMessage('nom035.attention_program_action.update_message')
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/nom035/attention-programs/{id}/actions/{actionId}:
   *   delete:
   *     summary: Eliminar (baja lógica) acción del Programa de atención NOM-035
   *     tags: [NOM035]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema:
   *           type: string
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: false
   *         schema:
   *           type: integer
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
   *       - in: path
   *         name: actionId
   *         required: true
   *         schema:
   *           type: integer
   *           minimum: 1
   *     responses:
   *       '200':
   *         description: Acción eliminada correctamente
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   enum: [success]
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     attentionProgramAction:
   *                       type: object
   *                       properties:
   *                         deleted:
   *                           type: boolean
   *             example:
   *               type: success
   *               title: Attention Program Action
   *               message: Acción del Programa de atención eliminada correctamente
   *               data:
   *                 attentionProgramAction:
   *                   deleted: true
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
   *               detail: El parámetro actionId debe ser un entero positivo
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
   *         description: Sin permiso para eliminar acciones
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
   *         description: Acción no encontrada o fuera de alcance
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Nom035PrgError'
   *             example:
   *               type: error
   *               title: Programa de atención NOM-035
   *               message: Acción de programa no encontrada o fuera del alcance del usuario
   *               detail: Acción de programa no encontrada o fuera del alcance del usuario
   *               key: accion-no-encontrada
   *               code: NOM035.PRG.ACTION_NOT_FOUND
   *               data: null
   *       '409':
   *         description: Programa cerrado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Nom035PrgError'
   *             example:
   *               type: error
   *               title: Programa de atención NOM-035
   *               message: El Programa está cerrado y solo permite lectura
   *               detail: El Programa está cerrado y solo permite lectura
   *               key: programa-cerrado
   *               code: NOM035.PRG.PROGRAM_CLOSED
   *               data: null
   */
  async destroy(ctx: HttpContext) {
    const { params, response, i18n, businessUnitScope } = ctx
    try {
      if (!(await this.checkPermission(ctx, 'write'))) {
        throw new AttentionProgramServiceError(
          i18n.formatMessage('nom035.attention_program.forbidden'),
          ATTENTION_PROGRAM_ERROR_CODES.FORBIDDEN,
          403,
          'sin-permiso'
        )
      }

      const attentionProgramId = this.parsePositiveId(params.id, 'id', i18n)
      const actionId = this.parsePositiveId(params.actionId, 'actionId', i18n)
      const service = new AttentionProgramActionService()
      await service.softDelete(attentionProgramId, actionId, businessUnitScope ?? [], i18n)

      return StandardResponseFormatter.success(
        response,
        { deleted: true },
        'Attention Program Action',
        i18n.formatMessage('nom035.attention_program_action.delete_message')
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }
}
