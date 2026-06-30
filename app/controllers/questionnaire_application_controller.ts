import type { HttpContext } from '@adonisjs/core/http'
import QuestionnaireApplicationService from '#services/questionnaire_application_service'
import RoleService from '#services/role_service'
import { StandardResponseFormatter } from '../helpers/standard_response_formatter.js'
import {
  closeQuestionnaireApplicationValidator,
  createQuestionnaireApplicationValidator,
  listQuestionnaireApplicationTargetsValidator,
  listQuestionnaireApplicationsValidator,
} from '#validators/questionnaire_application'
import { QUESTIONNAIRE_APPLICATION_ERROR_CODES } from '#constants/questionnaire_application_error_codes'
import { resolveQuestionnaireApplicationApiError } from '../helpers/questionnaire_application_api_error.js'
import { QuestionnaireApplicationServiceError } from '#exceptions/questionnaire_application_service_error'

export default class QuestionnaireApplicationController {
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
    const resolved = resolveQuestionnaireApplicationApiError(error, fallbackStatus, i18n)
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

  private parseQuestionnaireApplicationId(
    value: unknown,
    i18n: HttpContext['i18n']
  ): number {
    const questionnaireApplicationId = Number(value)
    if (!Number.isInteger(questionnaireApplicationId) || questionnaireApplicationId <= 0) {
      throw new QuestionnaireApplicationServiceError(
        i18n.formatMessage('nom035.questionnaire_application.val_input'),
        QUESTIONNAIRE_APPLICATION_ERROR_CODES.VAL_INPUT,
        400,
        'datos-invalidos'
      )
    }

    return questionnaireApplicationId
  }

  /**
   * @swagger
   * /api/nom035/questionnaire-applications:
   *   get:
   *     summary: Listar aplicaciones de cuestionario NOM-035
   *     description: >
   *       Devuelve el listado paginado de aplicaciones dentro del alcance de unidades
   *       de negocio del usuario autenticado. No expone identidad nominal de empleados;
   *       solo conteos de objetivos y respuestas.
   *     tags: [NOM035]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: Accept-Language
   *         required: false
   *         schema:
   *           type: string
   *           enum: [es, en]
   *         description: Idioma de mensajes de respuesta
   *       - in: query
   *         name: branchOfficeId
   *         required: false
   *         schema:
   *           type: integer
   *           minimum: 1
   *         description: Filtra por sucursal
   *       - in: query
   *         name: status
   *         required: false
   *         schema:
   *           type: string
   *           enum: [borrador, en-curso, cerrada]
   *         description: Filtra por estatus del ciclo de vida
   *       - in: query
   *         name: completionStatus
   *         required: false
   *         schema:
   *           type: string
   *           enum: [none, partial, full]
   *         description: Filtra por nivel de avance de respuestas
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
   *       200:
   *         description: Aplicaciones de cuestionario obtenidas correctamente
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
   *                     questionnaireApplications:
   *                       type: object
   *                       properties:
   *                         meta:
   *                           type: object
   *                           properties:
   *                             total: { type: integer }
   *                             perPage: { type: integer }
   *                             currentPage: { type: integer }
   *                             lastPage: { type: integer }
   *                             firstPage: { type: integer }
   *                         data:
   *                           type: array
   *                           items:
   *                             type: object
   *                             properties:
   *                               questionnaireApplicationId: { type: integer }
   *                               folio: { type: string }
   *                               branchOfficeId: { type: integer }
   *                               branchOfficeName: { type: string }
   *                               applicableInstrument:
   *                                 type: string
   *                                 enum: [guide_ii, guide_iii]
   *                               status:
   *                                 type: string
   *                                 enum: [borrador, en-curso, cerrada]
   *                               targetCount: { type: integer }
   *                               respondedCount: { type: integer }
   *                               completionStatus:
   *                                 type: string
   *                                 enum: [none, partial, full]
   *                               launchedAt:
   *                                 type: string
   *                                 format: date-time
   *             example:
   *               type: success
   *               title: Questionnaire Applications
   *               message: Aplicaciones de cuestionario obtenidas correctamente
   *               data:
   *                 questionnaireApplications:
   *                   meta:
   *                     total: 1
   *                     perPage: 20
   *                     currentPage: 1
   *                     lastPage: 1
   *                     firstPage: 1
   *                   data:
   *                     - questionnaireApplicationId: 10
   *                       folio: NOM035-2026-123456
   *                       branchOfficeId: 3
   *                       branchOfficeName: Sucursal Centro
   *                       applicableInstrument: guide_ii
   *                       status: en-curso
   *                       targetCount: 30
   *                       respondedCount: 5
   *                       completionStatus: partial
   *                       launchedAt: '2026-06-22T17:00:00.000Z'
   *       400:
   *         description: Parámetros inválidos
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Aplicación NOM-035
   *               message: Datos inválidos
   *               key: datos-invalidos
   *               detail: Datos inválidos
   *               code: NOM035.QRUN.VAL_INPUT
   *               data: null
   *       403:
   *         description: Sin permiso para consultar
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Aplicación NOM-035
   *               message: Sin permiso para gestionar aplicaciones de cuestionario
   *               key: sin-permiso
   *               detail: Sin permiso para gestionar aplicaciones de cuestionario
   *               code: NOM035.QRUN.FORBIDDEN
   *               data: null
   */
  async index(ctx: HttpContext) {
    const { request, response, i18n, businessUnitScope } = ctx
    try {
      if (!(await this.checkPermission(ctx, 'read'))) {
        throw new QuestionnaireApplicationServiceError(
          i18n.formatMessage('nom035.questionnaire_application.forbidden'),
          QUESTIONNAIRE_APPLICATION_ERROR_CODES.FORBIDDEN,
          403,
          'sin-permiso'
        )
      }

      const filters = await request.validateUsing(listQuestionnaireApplicationsValidator)
      const service = new QuestionnaireApplicationService()
      const result = await service.listPaginated(filters, businessUnitScope ?? [])
      return StandardResponseFormatter.success(
        response,
        result,
        'Questionnaire Applications',
        i18n.formatMessage('nom035.questionnaire_application.index_message')
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/nom035/questionnaire-applications:
   *   post:
   *     summary: Crear y lanzar aplicación de cuestionario NOM-035
   *     description: >
   *       Crea la ronda de aplicación para una sucursal, resuelve automáticamente el
   *       instrumento aplicable y congela los empleados objetivo en el snapshot.
   *     tags: [NOM035]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: Accept-Language
   *         required: false
   *         schema:
   *           type: string
   *           enum: [es, en]
   *         description: Idioma de mensajes de respuesta
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [branchOfficeId]
   *             properties:
   *               branchOfficeId:
   *                 type: integer
   *                 minimum: 1
   *           example:
   *             branchOfficeId: 3
   *     responses:
   *       201:
   *         description: Aplicación de cuestionario lanzada correctamente
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Questionnaire Application
   *               message: Aplicación de cuestionario lanzada correctamente
   *               data:
   *                 questionnaireApplication:
   *                   questionnaireApplicationId: 11
   *                   folio: NOM035-2026-654321
   *                   branchOfficeId: 3
   *                   branchOfficeName: Sucursal Centro
   *                   businessUnitId: 2
   *                   regulationQuestionnaireId: 4
   *                   applicableInstrument: guide_ii
   *                   status: en-curso
   *                   targetCount: 30
   *                   respondedCount: 0
   *                   launchedAt: '2026-06-22T17:05:00.000Z'
   *                   closedAt: null
   *       400:
   *         description: Datos de entrada inválidos
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Aplicación NOM-035
   *               message: Datos inválidos
   *               key: datos-invalidos
   *               detail: Datos inválidos
   *               code: NOM035.QRUN.VAL_INPUT
   *               data: null
   *       403:
   *         description: Sin permiso para lanzar aplicaciones
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Aplicación NOM-035
   *               message: Sin permiso para gestionar aplicaciones de cuestionario
   *               key: sin-permiso
   *               detail: Sin permiso para gestionar aplicaciones de cuestionario
   *               code: NOM035.QRUN.FORBIDDEN
   *               data: null
   *       404:
   *         description: Sucursal fuera de alcance
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Aplicación NOM-035
   *               message: Sucursal no encontrada o fuera del alcance del usuario
   *               key: sucursal-no-encontrada
   *               detail: Sucursal no encontrada o fuera del alcance del usuario
   *               code: NOM035.QRUN.NOT_FOUND_BRANCH
   *               data: null
   *       409:
   *         description: Ya existe aplicación abierta
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Aplicación NOM-035
   *               message: Ya existe una aplicación abierta para la sucursal
   *               key: aplicacion-abierta
   *               detail: Ya existe una aplicación abierta para la sucursal
   *               code: NOM035.QRUN.ALREADY_OPEN
   *               data: null
   *       422:
   *         description: Sucursal no aplicable
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Aplicación NOM-035
   *               message: Sucursal no aplicable para lanzamiento de cuestionario
   *               key: sucursal-no-aplicable
   *               detail: Sucursal no aplicable para lanzamiento de cuestionario
   *               code: NOM035.QRUN.NOT_APPLICABLE
   *               data: null
   */
  async store(ctx: HttpContext) {
    const { request, response, i18n, businessUnitScope } = ctx
    try {
      if (!(await this.checkPermission(ctx, 'write'))) {
        throw new QuestionnaireApplicationServiceError(
          i18n.formatMessage('nom035.questionnaire_application.forbidden'),
          QUESTIONNAIRE_APPLICATION_ERROR_CODES.FORBIDDEN,
          403,
          'sin-permiso'
        )
      }

      const payload = await request.validateUsing(createQuestionnaireApplicationValidator)
      const service = new QuestionnaireApplicationService()
      const result = await service.launch(payload, businessUnitScope ?? [], i18n)
      return StandardResponseFormatter.success(
        response,
        result,
        'Questionnaire Application',
        i18n.formatMessage('nom035.questionnaire_application.store_message'),
        201
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/nom035/questionnaire-applications/{id}:
   *   get:
   *     summary: Obtener detalle de aplicación de cuestionario NOM-035
   *     tags: [NOM035]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: Accept-Language
   *         required: false
   *         schema:
   *           type: string
   *           enum: [es, en]
   *         description: Idioma de mensajes de respuesta
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *           minimum: 1
   *     responses:
   *       200:
   *         description: Aplicación de cuestionario obtenida correctamente
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Questionnaire Application
   *               message: Aplicación de cuestionario obtenida correctamente
   *               data:
   *                 questionnaireApplication:
   *                   questionnaireApplicationId: 11
   *                   folio: NOM035-2026-654321
   *                   branchOfficeId: 3
   *                   branchOfficeName: Sucursal Centro
   *                   businessUnitId: 2
   *                   regulationQuestionnaireId: 4
   *                   applicableInstrument: guide_ii
   *                   status: en-curso
   *                   targetCount: 30
   *                   respondedCount: 2
   *                   launchedAt: '2026-06-22T17:05:00.000Z'
   *                   closedAt: null
   *       400:
   *         description: ID inválido
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Aplicación NOM-035
   *               message: Datos inválidos
   *               key: datos-invalidos
   *               detail: Datos inválidos
   *               code: NOM035.QRUN.VAL_INPUT
   *               data: null
   *       403:
   *         description: Sin permiso para consultar
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Aplicación NOM-035
   *               message: Sin permiso para gestionar aplicaciones de cuestionario
   *               key: sin-permiso
   *               detail: Sin permiso para gestionar aplicaciones de cuestionario
   *               code: NOM035.QRUN.FORBIDDEN
   *               data: null
   *       404:
   *         description: Aplicación no encontrada
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Aplicación NOM-035
   *               message: Aplicación de cuestionario no encontrada o fuera del alcance del usuario
   *               key: aplicacion-no-encontrada
   *               detail: Aplicación de cuestionario no encontrada o fuera del alcance del usuario
   *               code: NOM035.QRUN.NOT_FOUND
   *               data: null
   */
  async show(ctx: HttpContext) {
    const { params, response, i18n, businessUnitScope } = ctx
    try {
      if (!(await this.checkPermission(ctx, 'read'))) {
        throw new QuestionnaireApplicationServiceError(
          i18n.formatMessage('nom035.questionnaire_application.forbidden'),
          QUESTIONNAIRE_APPLICATION_ERROR_CODES.FORBIDDEN,
          403,
          'sin-permiso'
        )
      }

      const questionnaireApplicationId = this.parseQuestionnaireApplicationId(params.id, i18n)
      const service = new QuestionnaireApplicationService()
      const result = await service.getById(
        questionnaireApplicationId,
        businessUnitScope ?? [],
        i18n
      )
      return StandardResponseFormatter.success(
        response,
        result,
        'Questionnaire Application',
        i18n.formatMessage('nom035.questionnaire_application.show_message')
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/nom035/questionnaire-applications/{id}/targets:
   *   get:
   *     summary: Listar objetivos de una ronda de cuestionario NOM-035
   *     description: >
   *       Devuelve la lista de empleados objetivo de la ronda con su estado
   *       de objetivo (pendiente/respondido) y el estado de captura derivado
   *       (pendiente/borrador/respondido). Permite filtrar por status y búsqueda
   *       por nombre completo para consumo del selector de captura en BO.
   *     tags: [NOM035]
   *     security:
   *       - bearerAuth: []
   *     parameters:
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
   *       - in: query
   *         name: status
   *         required: false
   *         schema:
   *           type: string
   *           enum: [pendiente, respondido]
   *       - in: query
   *         name: captureStatus
   *         required: false
   *         schema:
   *           type: string
   *           enum: [pendiente, borrador, respondido]
   *       - in: query
   *         name: search
   *         required: false
   *         schema:
   *           type: string
   *           minLength: 1
   *     responses:
   *       200:
   *         description: Objetivos obtenidos correctamente
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
   *                     targets:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           questionnaireApplicationTargetId: { type: integer }
   *                           employeeId: { type: integer }
   *                           employeeCode:
   *                             oneOf:
   *                               - type: integer
   *                               - type: string
   *                           employeePayrollNum: { type: string }
   *                           employeeFullName: { type: string }
   *                           departmentName:
   *                             type: string
   *                             nullable: true
   *                           positionName:
   *                             type: string
   *                             nullable: true
   *                           status:
   *                             type: string
   *                             enum: [pendiente, respondido]
   *                           captureStatus:
   *                             type: string
   *                             enum: [pendiente, borrador, respondido]
   *                           respondedAt:
   *                             type: string
   *                             format: date-time
   *                             nullable: true
   *             example:
   *               type: success
   *               title: Objetivos de la ronda
   *               message: Objetivos obtenidos correctamente
   *               data:
   *                 targets:
   *                   - questionnaireApplicationTargetId: 1
   *                     employeeId: 42
   *                     employeeCode: 10042
   *                     employeePayrollNum: A-10042
   *                     employeeFullName: Juan Pérez López
   *                     departmentName: Operaciones
   *                     positionName: Supervisor
   *                     status: pendiente
   *                     captureStatus: borrador
   *                     respondedAt: null
   *                   - questionnaireApplicationTargetId: 2
   *                     employeeId: 43
   *                     employeeCode: 10043
   *                     employeePayrollNum: A-10043
   *                     employeeFullName: María García Soto
   *                     departmentName: Recursos Humanos
   *                     positionName: Analista RH
   *                     status: respondido
   *                     captureStatus: respondido
   *                     respondedAt: '2026-06-23T17:56:45.793Z'
   *       400:
   *         description: Parámetros inválidos
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Aplicación NOM-035
   *               message: Datos inválidos
   *               key: datos-invalidos
   *               detail: Datos inválidos
   *               code: NOM035.QRUN.VAL_INPUT
   *               data: null
   *       403:
   *         description: Sin permiso para consultar objetivos
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Aplicación NOM-035
   *               message: Sin permiso para gestionar aplicaciones de cuestionario
   *               key: sin-permiso
   *               detail: Sin permiso para gestionar aplicaciones de cuestionario
   *               code: NOM035.QRUN.FORBIDDEN
   *               data: null
   *       404:
   *         description: Aplicación no encontrada o fuera de alcance
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Aplicación NOM-035
   *               message: Aplicación de cuestionario no encontrada o fuera del alcance del usuario
   *               key: aplicacion-no-encontrada
   *               detail: Aplicación de cuestionario no encontrada o fuera del alcance del usuario
   *               code: NOM035.QRUN.NOT_FOUND
   *               data: null
   */
  async targets(ctx: HttpContext) {
    const { params, request, response, i18n, businessUnitScope } = ctx
    try {
      if (!(await this.checkPermission(ctx, 'read'))) {
        throw new QuestionnaireApplicationServiceError(
          i18n.formatMessage('nom035.questionnaire_application.forbidden'),
          QUESTIONNAIRE_APPLICATION_ERROR_CODES.FORBIDDEN,
          403,
          'sin-permiso'
        )
      }

      const questionnaireApplicationId = this.parseQuestionnaireApplicationId(params.id, i18n)
      const filters = await request.validateUsing(listQuestionnaireApplicationTargetsValidator)
      const service = new QuestionnaireApplicationService()
      const result = await service.listTargets(
        questionnaireApplicationId,
        filters,
        businessUnitScope ?? [],
        i18n
      )

      return StandardResponseFormatter.success(
        response,
        result,
        'Objetivos de la ronda',
        i18n.formatMessage('nom035.questionnaire_application.targets_message')
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/nom035/questionnaire-applications/{id}/close:
   *   patch:
   *     summary: Cerrar formalmente una ronda de cuestionario NOM-035
   *     description: >
   *       Cierra una ronda en curso y registra una entrada inmutable en la bitácora
   *       de estado con el actor y la nota de cierre.
   *     tags: [NOM035]
   *     security:
   *       - bearerAuth: []
   *     parameters:
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
   *             type: object
   *             required: [note]
   *             properties:
   *               note:
   *                 type: string
   *                 minLength: 1
   *                 maxLength: 1000
   *           example:
   *             note: Cierre formal de la ronda NOM-035 por fin de captura
   *     responses:
   *       200:
   *         description: Ronda cerrada correctamente
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
   *                     questionnaireApplication:
   *                       type: object
   *                       properties:
   *                         questionnaireApplicationId: { type: integer }
   *                         folio: { type: string }
   *                         branchOfficeId: { type: integer }
   *                         branchOfficeName: { type: string }
   *                         businessUnitId: { type: integer }
   *                         regulationQuestionnaireId: { type: integer }
   *                         applicableInstrument:
   *                           type: string
   *                           enum: [guide_ii, guide_iii]
   *                         status:
   *                           type: string
   *                           enum: [cerrada]
   *                         targetCount: { type: integer }
   *                         respondedCount: { type: integer }
   *                         launchedAt:
   *                           type: string
   *                           format: date-time
   *                         closedAt:
   *                           type: string
   *                           format: date-time
   *             example:
   *               type: success
   *               title: Questionnaire Application
   *               message: Ronda cerrada correctamente
   *               data:
   *                 questionnaireApplication:
   *                   questionnaireApplicationId: 11
   *                   folio: NOM035-2026-654321
   *                   branchOfficeId: 3
   *                   branchOfficeName: Sucursal Centro
   *                   businessUnitId: 2
   *                   regulationQuestionnaireId: 4
   *                   applicableInstrument: guide_ii
   *                   status: cerrada
   *                   targetCount: 30
   *                   respondedCount: 30
   *                   launchedAt: '2026-06-22T17:05:00.000Z'
   *                   closedAt: '2026-06-24T19:30:00.000Z'
   *       400:
   *         description: Entrada inválida
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Aplicación NOM-035
   *               message: Datos inválidos
   *               key: datos-invalidos
   *               detail: Datos inválidos
   *               code: NOM035.QRUN.VAL_INPUT
   *               data: null
   *       403:
   *         description: Sin permiso para cerrar rondas
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Aplicación NOM-035
   *               message: Sin permiso para gestionar aplicaciones de cuestionario
   *               key: sin-permiso
   *               detail: Sin permiso para gestionar aplicaciones de cuestionario
   *               code: NOM035.QRUN.FORBIDDEN
   *               data: null
   *       404:
   *         description: Ronda no encontrada o fuera de alcance
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Aplicación NOM-035
   *               message: Aplicación de cuestionario no encontrada o fuera del alcance del usuario
   *               key: aplicacion-no-encontrada
   *               detail: Aplicación de cuestionario no encontrada o fuera del alcance del usuario
   *               code: NOM035.QRUN.NOT_FOUND
   *               data: null
   *       409:
   *         description: La ronda ya se encuentra cerrada
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Aplicación NOM-035
   *               message: Esta ronda ya está cerrada
   *               key: ronda-ya-cerrada
   *               detail: Esta ronda ya está cerrada
   *               code: NOM035.QRUN.ALREADY_CLOSED
   *               data: null
   *       422:
   *         description: La ronda no está en curso y no puede cerrarse
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Aplicación NOM-035
   *               message: Solo se puede cerrar una ronda en curso
   *               key: ronda-no-en-curso
   *               detail: Solo se puede cerrar una ronda en curso
   *               code: NOM035.QRUN.NOT_IN_PROGRESS
   *               data: null
   */
  async close(ctx: HttpContext) {
    const { params, request, response, i18n, businessUnitScope } = ctx
    try {
      if (!(await this.checkPermission(ctx, 'write'))) {
        throw new QuestionnaireApplicationServiceError(
          i18n.formatMessage('nom035.questionnaire_application.forbidden'),
          QUESTIONNAIRE_APPLICATION_ERROR_CODES.FORBIDDEN,
          403,
          'sin-permiso'
        )
      }

      const questionnaireApplicationId = this.parseQuestionnaireApplicationId(params.id, i18n)
      const payload = await request.validateUsing(closeQuestionnaireApplicationValidator)
      const service = new QuestionnaireApplicationService()
      const result = await service.close(
        questionnaireApplicationId,
        ctx.auth.user!.userId,
        payload,
        businessUnitScope ?? [],
        i18n
      )

      return StandardResponseFormatter.success(
        response,
        result,
        'Questionnaire Application',
        i18n.formatMessage('nom035.questionnaire_application.close_message')
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/nom035/questionnaire-applications/{id}/history:
   *   get:
   *     summary: Obtener historial de cambios de estado de una ronda NOM-035
   *     tags: [NOM035]
   *     security:
   *       - bearerAuth: []
   *     parameters:
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
   *       200:
   *         description: Historial de estado obtenido correctamente
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
   *                     stateHistory:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           questionnaireApplicationStateLogId: { type: integer }
   *                           fromStatus:
   *                             type: string
   *                             enum: [borrador, en-curso, cerrada]
   *                           toStatus:
   *                             type: string
   *                             enum: [borrador, en-curso, cerrada]
   *                           note: { type: string }
   *                           actorUser:
   *                             type: object
   *                             properties:
   *                               userId: { type: integer }
   *                               email: { type: string }
   *                               fullName:
   *                                 type: string
   *                                 nullable: true
   *                           createdAt:
   *                             type: string
   *                             format: date-time
   *             example:
   *               type: success
   *               title: Questionnaire Application State History
   *               message: Historial de cambios obtenido correctamente
   *               data:
   *                 stateHistory:
   *                   - questionnaireApplicationStateLogId: 7
   *                     fromStatus: en-curso
   *                     toStatus: cerrada
   *                     note: Cierre formal de la ronda NOM-035 por fin de captura
   *                     actorUser:
   *                       userId: 15
   *                       email: desarrollo-software@gruposti.com
   *                       fullName: Juan Pérez López
   *                     createdAt: '2026-06-24T19:30:00.000Z'
   *       400:
   *         description: Parámetro inválido
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Aplicación NOM-035
   *               message: Datos inválidos
   *               key: datos-invalidos
   *               detail: Datos inválidos
   *               code: NOM035.QRUN.VAL_INPUT
   *               data: null
   *       403:
   *         description: Sin permiso para consultar el historial
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Aplicación NOM-035
   *               message: Sin permiso para gestionar aplicaciones de cuestionario
   *               key: sin-permiso
   *               detail: Sin permiso para gestionar aplicaciones de cuestionario
   *               code: NOM035.QRUN.FORBIDDEN
   *               data: null
   *       404:
   *         description: Ronda no encontrada o fuera de alcance
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Aplicación NOM-035
   *               message: Aplicación de cuestionario no encontrada o fuera del alcance del usuario
   *               key: aplicacion-no-encontrada
   *               detail: Aplicación de cuestionario no encontrada o fuera del alcance del usuario
   *               code: NOM035.QRUN.NOT_FOUND
   *               data: null
   */
  async history(ctx: HttpContext) {
    const { params, response, i18n, businessUnitScope } = ctx
    try {
      if (!(await this.checkPermission(ctx, 'read'))) {
        throw new QuestionnaireApplicationServiceError(
          i18n.formatMessage('nom035.questionnaire_application.forbidden'),
          QUESTIONNAIRE_APPLICATION_ERROR_CODES.FORBIDDEN,
          403,
          'sin-permiso'
        )
      }

      const questionnaireApplicationId = this.parseQuestionnaireApplicationId(params.id, i18n)
      const service = new QuestionnaireApplicationService()
      const result = await service.listHistory(questionnaireApplicationId, businessUnitScope ?? [], i18n)

      return StandardResponseFormatter.success(
        response,
        result,
        'Questionnaire Application State History',
        i18n.formatMessage('nom035.questionnaire_application.history_message')
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/nom035/questionnaire-applications/{id}:
   *   delete:
   *     summary: Eliminar lógicamente aplicación de cuestionario NOM-035
   *     tags: [NOM035]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: Accept-Language
   *         required: false
   *         schema:
   *           type: string
   *           enum: [es, en]
   *         description: Idioma de mensajes de respuesta
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *           minimum: 1
   *     responses:
   *       204:
   *         description: Aplicación eliminada correctamente (sin contenido)
   *       400:
   *         description: ID inválido
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Aplicación NOM-035
   *               message: Datos inválidos
   *               key: datos-invalidos
   *               detail: Datos inválidos
   *               code: NOM035.QRUN.VAL_INPUT
   *               data: null
   *       403:
   *         description: Sin permiso para eliminar
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Aplicación NOM-035
   *               message: Sin permiso para gestionar aplicaciones de cuestionario
   *               key: sin-permiso
   *               detail: Sin permiso para gestionar aplicaciones de cuestionario
   *               code: NOM035.QRUN.FORBIDDEN
   *               data: null
   *       404:
   *         description: Aplicación no encontrada
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Aplicación NOM-035
   *               message: Aplicación de cuestionario no encontrada o fuera del alcance del usuario
   *               key: aplicacion-no-encontrada
   *               detail: Aplicación de cuestionario no encontrada o fuera del alcance del usuario
   *               code: NOM035.QRUN.NOT_FOUND
   *               data: null
   *       422:
   *         description: Aplicación con respuestas capturadas
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Aplicación NOM-035
   *               message: No se puede eliminar una aplicación con respuestas capturadas
   *               key: aplicacion-con-respuestas
   *               detail: No se puede eliminar una aplicación con respuestas capturadas
   *               code: NOM035.QRUN.HAS_RESPONSES
   *               data: null
   */
  async destroy(ctx: HttpContext) {
    const { params, response, i18n, businessUnitScope } = ctx
    try {
      if (!(await this.checkPermission(ctx, 'write'))) {
        throw new QuestionnaireApplicationServiceError(
          i18n.formatMessage('nom035.questionnaire_application.forbidden'),
          QUESTIONNAIRE_APPLICATION_ERROR_CODES.FORBIDDEN,
          403,
          'sin-permiso'
        )
      }

      const questionnaireApplicationId = this.parseQuestionnaireApplicationId(params.id, i18n)
      const service = new QuestionnaireApplicationService()
      await service.softDelete(questionnaireApplicationId, businessUnitScope ?? [], i18n)
      return response.status(204).send('')
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }
}
