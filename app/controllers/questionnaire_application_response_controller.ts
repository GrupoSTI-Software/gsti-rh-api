import type { HttpContext } from '@adonisjs/core/http'
import RoleService from '#services/role_service'
import QuestionnaireApplicationResponseService from '#services/questionnaire_application_response_service'
import { QUESTIONNAIRE_APPLICATION_ERROR_CODES } from '#constants/questionnaire_application_error_codes'
import { QuestionnaireApplicationServiceError } from '#exceptions/questionnaire_application_service_error'
import { resolveQuestionnaireApplicationApiError } from '../helpers/questionnaire_application_api_error.js'
import { StandardResponseFormatter } from '../helpers/standard_response_formatter.js'
import { submitQuestionnaireApplicationAnswersValidator } from '#validators/questionnaire_application_response'

export default class QuestionnaireApplicationResponseController {
  private async checkPermission(ctx: HttpContext, action: 'read' | 'write'): Promise<boolean> {
    const user = ctx.auth.user
    if (!user) return false

    await user.load('role')
    if (user.role?.roleSlug === 'root') return true

    const roleService = new RoleService()
    return roleService.hasAccess(user.roleId, 'compliance', action)
  }

  private parsePositiveInt(value: unknown): number {
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : Number.NaN
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

  /**
   * @swagger
   * /api/nom035/questionnaire-applications/{id}/targets/{employeeId}/instrument:
   *   get:
   *     summary: Obtener instrumento para captura por empleado objetivo
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
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema:
   *           type: integer
   *           minimum: 1
   *     responses:
   *       200:
   *         description: Instrumento obtenido correctamente
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
   *                     instrument:
   *                       type: object
   *                       properties:
   *                         questionnaireApplicationId: { type: integer }
   *                         employeeId: { type: integer }
   *                         instrument:
   *                           type: string
   *                           enum: [guide_ii, guide_iii]
   *                         sections:
   *                           type: array
   *                           items:
   *                             type: object
   *                             properties:
   *                               titleKey: { type: string }
   *                               ord: { type: integer }
   *                               questions:
   *                                 type: array
   *                                 items:
   *                                   type: object
   *                                   properties:
   *                                     questionId: { type: integer }
   *                                     textKey: { type: string }
   *                                     helpKey:
   *                                       type: string
   *                                       nullable: true
   *                                     answerScale:
   *                                       type: object
   *                                       properties:
   *                                         code: { type: string }
   *                                         options:
   *                                           type: array
   *                                           items:
   *                                             type: object
   *                                             properties:
   *                                               key: { type: string }
   *                                               value: { type: integer }
   *             example:
   *               type: success
   *               title: Instrumento
   *               message: Aplicación de cuestionario obtenida correctamente
   *               data:
   *                 instrument:
   *                   questionnaireApplicationId: 12
   *                   employeeId: 45
   *                   instrument: guide_ii
   *                   sections:
   *                     - titleKey: regulatory.questionnaires.guia_ii_nom035_2018.sections.cat_i.title
   *                       ord: 1
   *                       questions:
   *                         - questionId: 101
   *                           textKey: regulatory.questionnaires.guia_ii_nom035_2018.sections.cat_i.questions.p01.text
   *                           helpKey: null
   *                           answerScale:
   *                             code: likert_freq_5
   *                             options:
   *                               - key: siempre
   *                                 value: 4
   *                               - key: casi_siempre
   *                                 value: 3
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
   *         description: Sin permiso para consultar instrumento
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
   *         description: Empleado no objetivo o fuera de alcance
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Aplicación NOM-035
   *               message: El empleado no forma parte de los objetivos de esta ronda
   *               key: empleado-no-objetivo
   *               detail: El empleado no forma parte de los objetivos de esta ronda
   *               code: NOM035.QRUN.TARGET_NOT_FOUND
   *               data: null
   */
  async instrument(ctx: HttpContext) {
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

      const questionnaireApplicationId = this.parsePositiveInt(params.id)
      const employeeId = this.parsePositiveInt(params.employeeId)

      if (!Number.isFinite(questionnaireApplicationId) || !Number.isFinite(employeeId)) {
        throw new QuestionnaireApplicationServiceError(
          i18n.formatMessage('nom035.questionnaire_application.val_input'),
          QUESTIONNAIRE_APPLICATION_ERROR_CODES.VAL_INPUT,
          400,
          'datos-invalidos'
        )
      }

      const service = new QuestionnaireApplicationResponseService()
      const instrument = await service.getInstrumentForTarget(
        questionnaireApplicationId,
        employeeId,
        businessUnitScope ?? [],
        i18n
      )

      return StandardResponseFormatter.success(
        response,
        instrument,
        'Instrumento',
        i18n.formatMessage('nom035.questionnaire_application.show_message')
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  /**
   * @swagger
   * /api/nom035/questionnaire-applications/{id}/targets/{employeeId}/answers:
   *   post:
   *     summary: Capturar y persistir respuestas de cuestionario por empleado objetivo
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
   *       - in: path
   *         name: employeeId
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
   *             required: [answers]
   *             properties:
   *               answers:
   *                 type: array
   *                 minItems: 1
   *                 items:
   *                   type: object
   *                   required: [questionId, optionKey]
   *                   properties:
   *                     questionId:
   *                       type: integer
   *                     optionKey:
   *                       type: string
   *     responses:
   *       201:
   *         description: Respuestas guardadas correctamente
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
   *                     questionnaireApplicationResponse:
   *                       type: object
   *                       properties:
   *                         questionnaireApplicationResponseId: { type: integer }
   *                         employeeId: { type: integer }
   *                         answeredCount: { type: integer }
   *                         targetStatus:
   *                           type: string
   *                           enum: [respondido]
   *                         respondedAt:
   *                           type: string
   *                           format: date-time
   *             example:
   *               type: success
   *               title: Captura de respuestas
   *               message: Respuestas guardadas correctamente
   *               data:
   *                 questionnaireApplicationResponse:
   *                   questionnaireApplicationResponseId: 220
   *                   employeeId: 45
   *                   answeredCount: 46
   *                   targetStatus: respondido
   *                   respondedAt: '2026-06-23T16:45:00.000Z'
   *       400:
   *         description: Body inválido
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
   *         description: Sin permiso para capturar respuestas
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
   *         description: Empleado no objetivo o fuera de alcance
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Aplicación NOM-035
   *               message: El empleado no forma parte de los objetivos de esta ronda
   *               key: empleado-no-objetivo
   *               detail: El empleado no forma parte de los objetivos de esta ronda
   *               code: NOM035.QRUN.TARGET_NOT_FOUND
   *               data: null
   *       409:
   *         description: Empleado ya respondido
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Aplicación NOM-035
   *               message: Este empleado ya tiene respuestas registradas para esta ronda
   *               key: captura-duplicada
   *               detail: Este empleado ya tiene respuestas registradas para esta ronda
   *               code: NOM035.QRUN.ALREADY_ANSWERED
   *               data: null
   *       422:
   *         description: Cuestionario incompleto u opción inválida
   *         content:
   *           application/json:
   *             examples:
   *               incompleto:
   *                 summary: Falta responder preguntas
   *                 value:
   *                   type: error
   *                   title: Aplicación NOM-035
   *                   message: Debes responder todas las preguntas del cuestionario antes de guardar
   *                   key: cuestionario-incompleto
   *                   detail: Debes responder todas las preguntas del cuestionario antes de guardar
   *                   code: NOM035.QRUN.INCOMPLETE_ANSWERS
   *                   data: null
   *               opcionInvalida:
   *                 summary: OptionKey fuera de escala
   *                 value:
   *                   type: error
   *                   title: Aplicación NOM-035
   *                   message: La opción seleccionada no pertenece a la escala de la pregunta
   *                   key: respuesta-invalida
   *                   detail: La opción seleccionada no pertenece a la escala de la pregunta
   *                   code: NOM035.QRUN.INVALID_ANSWER_OPTION
   *                   data: null
   */
  async store(ctx: HttpContext) {
    const { request, params, response, i18n, businessUnitScope } = ctx
    try {
      if (!(await this.checkPermission(ctx, 'write'))) {
        throw new QuestionnaireApplicationServiceError(
          i18n.formatMessage('nom035.questionnaire_application.forbidden'),
          QUESTIONNAIRE_APPLICATION_ERROR_CODES.FORBIDDEN,
          403,
          'sin-permiso'
        )
      }

      const questionnaireApplicationId = this.parsePositiveInt(params.id)
      const employeeId = this.parsePositiveInt(params.employeeId)

      if (!Number.isFinite(questionnaireApplicationId) || !Number.isFinite(employeeId)) {
        throw new QuestionnaireApplicationServiceError(
          i18n.formatMessage('nom035.questionnaire_application.val_input'),
          QUESTIONNAIRE_APPLICATION_ERROR_CODES.VAL_INPUT,
          400,
          'datos-invalidos'
        )
      }

      const payload = await request.validateUsing(submitQuestionnaireApplicationAnswersValidator)
      const service = new QuestionnaireApplicationResponseService()
      const result = await service.submitAnswers(
        questionnaireApplicationId,
        employeeId,
        payload,
        businessUnitScope ?? [],
        i18n
      )

      return StandardResponseFormatter.success(
        response,
        result,
        'Captura de respuestas',
        i18n.formatMessage('nom035.questionnaire_application.store_response_message'),
        201
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }
}
