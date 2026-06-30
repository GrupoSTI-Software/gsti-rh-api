import type { HttpContext } from '@adonisjs/core/http'
import RoleService from '#services/role_service'
import QuestionnaireTabulationService from '#services/questionnaire_tabulation_service'
import { StandardResponseFormatter } from '../helpers/standard_response_formatter.js'
import { questionnaireTabulationParamsValidator } from '#validators/questionnaire_tabulation'
import { NOM035_TABULATION_ERROR_CODES } from '#constants/nom035_tabulation_error_codes'
import { resolveQuestionnaireTabulationApiError } from '../helpers/questionnaire_tabulation_api_error.js'
import { QuestionnaireTabulationServiceError } from '#exceptions/questionnaire_tabulation_service_error'
import type { TabulationResult } from '../interfaces/questionnaire_tabulation.interface.js'

const K_ANONYMITY = 5

export default class QuestionnaireTabulationController {
  private async checkPermission(ctx: HttpContext, action: 'read' | 'write'): Promise<boolean> {
    const user = ctx.auth.user
    if (!user) return false

    await user.load('role')
    if (user.role?.roleSlug === 'root') return true

    const roleService = new RoleService()
    return roleService.hasAccess(user.roleId, 'compliance', action)
  }

  private async validateApplicationId(rawValue: unknown): Promise<number> {
    const payload = await questionnaireTabulationParamsValidator.validate({
      applicationId: Number(rawValue),
    })
    return payload.applicationId
  }

  private applyKAnonymity(result: TabulationResult) {
    return {
      applicationId: result.applicationId,
      instrumentCode: result.instrumentCode,
      respondersCount: result.respondersCount,
      overall: result.overall,
      categories: result.categories.map((category) => ({
        code: category.code,
        score: category.respondersCount < K_ANONYMITY ? null : category.score,
        riskLevel: category.riskLevel,
        respondersCount: category.respondersCount,
        suppressed: category.respondersCount < K_ANONYMITY,
      })),
      domains: result.domains.map((domain) => ({
        code: domain.code,
        categoryCode: domain.categoryCode,
        score: domain.respondersCount < K_ANONYMITY ? null : domain.score,
        riskLevel: domain.riskLevel,
        respondersCount: domain.respondersCount,
        suppressed: domain.respondersCount < K_ANONYMITY,
      })),
    }
  }

  /**
   * @swagger
   * /api/nom035/questionnaire-tabulation/{applicationId}:
   *   post:
   *     summary: Calcular o recalcular la tabulación NOM-035
   *     description: >
   *       Ejecuta el motor de tabulación para una ronda cerrada y persiste
   *       el resultado agregado por total, categoría y dominio.
   *     tags: [NOM035]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema:
   *           type: integer
   *       - in: header
   *         name: Accept-Language
   *         required: false
   *         schema:
   *           type: string
   *           enum: [es, en]
   *       - in: path
   *         name: applicationId
   *         required: true
   *         schema:
   *           type: integer
   *           minimum: 1
   *     responses:
   *       200:
   *         description: Tabulación calculada correctamente
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Tabulación NOM-035
   *               message: Tabulación calculada correctamente
   *               data:
   *                 tabulacion:
   *                   applicationId: 123
   *                   instrumentCode: GUIA-III-NOM035
   *                   respondersCount: 48
   *                   overall:
   *                     score: 312
   *                     riskLevel: alto
   *                   categories:
   *                     - code: CAT-I
   *                       score: 40
   *                       riskLevel: bajo
   *                       respondersCount: 48
   *                       suppressed: false
   *                   domains:
   *                     - code: VIOLENCIA_LABORAL
   *                       categoryCode: CAT-IV
   *                       score: null
   *                       riskLevel: muy_alto
   *                       respondersCount: 3
   *                       suppressed: true
   *       400:
   *         description: Parámetro inválido
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Error
   *               message: Datos inválidos
   *               errorCode: NOM035.TAB.VAL_INPUT
   *               data: null
   *       403:
   *         description: Sin permiso para ejecutar tabulación
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Error
   *               message: Sin permiso para consultar o calcular la tabulación
   *               errorCode: NOM035.TAB.FORBIDDEN
   *               data: null
   *       404:
   *         description: Ronda no encontrada o fuera de alcance
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Error
   *               message: Ronda no encontrada o fuera del alcance del usuario
   *               errorCode: NOM035.TAB.NOT_FOUND_APPLICATION
   *               data: null
   *       409:
   *         description: Opción de respuesta inválida para la escala
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Error
   *               message: Se detectó una opción de respuesta inválida para la escala de una pregunta
   *               errorCode: NOM035.TAB.INVALID_ANSWER_OPTION
   *               data: null
   *       422:
   *         description: Ronda no cerrada o sin mínimo de respuestas
   *         content:
   *           application/json:
   *             examples:
   *               notClosed:
   *                 value:
   *                   type: error
   *                   title: Error
   *                   message: Solo se puede tabular una ronda cerrada
   *                   errorCode: NOM035.TAB.NOT_CLOSED
   *                   data: null
   *               insufficientResponses:
   *                 value:
   *                   type: error
   *                   title: Error
   *                   message: No hay suficientes respuestas para tabular la ronda
   *                   errorCode: NOM035.TAB.INSUFFICIENT_RESPONSES
   *                   data: null
   *       500:
   *         description: Error no controlado
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Error
   *               message: Ocurrió un error inesperado al tabular la ronda
   *               errorCode: NOM035.TAB.SYS_UNHANDLED
   *               data: null
   */
  async tabulate(ctx: HttpContext) {
    const { response, i18n, params, businessUnitScope } = ctx
    try {
      if (!(await this.checkPermission(ctx, 'write'))) {
        throw new QuestionnaireTabulationServiceError(
          i18n.formatMessage('nom035.questionnaire_tabulation.forbidden'),
          NOM035_TABULATION_ERROR_CODES.FORBIDDEN,
          403
        )
      }

      const applicationId = await this.validateApplicationId(params.applicationId)
      const service = new QuestionnaireTabulationService()
      const result = await service.tabulate(applicationId, businessUnitScope ?? [], i18n)

      return StandardResponseFormatter.success(
        response,
        this.applyKAnonymity(result),
        'Tabulación NOM-035',
        i18n.formatMessage('nom035.questionnaire_tabulation.tabulate_message')
      )
    } catch (error) {
      const resolved = resolveQuestionnaireTabulationApiError(error, 500, i18n)
      return StandardResponseFormatter.error(
        response,
        resolved.message,
        resolved.status,
        resolved.errorCode
      )
    }
  }

  /**
   * @swagger
   * /api/nom035/questionnaire-tabulation/{applicationId}:
   *   get:
   *     summary: Consultar tabulación agregada NOM-035
   *     description: >
   *       Recupera la tabulación persistida de una ronda sin recalcular.
   *       Los puntajes se suprimen en categorías y dominios con muestra pequeña.
   *     tags: [NOM035]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema:
   *           type: integer
   *       - in: header
   *         name: Accept-Language
   *         required: false
   *         schema:
   *           type: string
   *           enum: [es, en]
   *       - in: path
   *         name: applicationId
   *         required: true
   *         schema:
   *           type: integer
   *           minimum: 1
   *     responses:
   *       200:
   *         description: Tabulación obtenida correctamente
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Tabulación NOM-035
   *               message: Tabulación obtenida correctamente
   *               data:
   *                 tabulacion:
   *                   applicationId: 123
   *                   instrumentCode: GUIA-III-NOM035
   *                   respondersCount: 48
   *                   overall:
   *                     score: 312
   *                     riskLevel: alto
   *                   categories:
   *                     - code: CAT-I
   *                       score: 40
   *                       riskLevel: bajo
   *                       respondersCount: 48
   *                       suppressed: false
   *                   domains:
   *                     - code: VIOLENCIA_LABORAL
   *                       categoryCode: CAT-IV
   *                       score: null
   *                       riskLevel: muy_alto
   *                       respondersCount: 3
   *                       suppressed: true
   *       400:
   *         description: Parámetro inválido
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Error
   *               message: Datos inválidos
   *               errorCode: NOM035.TAB.VAL_INPUT
   *               data: null
   *       403:
   *         description: Sin permiso para consultar tabulación
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Error
   *               message: Sin permiso para consultar o calcular la tabulación
   *               errorCode: NOM035.TAB.FORBIDDEN
   *               data: null
   *       404:
   *         description: Ronda no encontrada o sin tabulación previa
   *         content:
   *           application/json:
   *             examples:
   *               notFound:
   *                 value:
   *                   type: error
   *                   title: Error
   *                   message: Ronda no encontrada o fuera del alcance del usuario
   *                   errorCode: NOM035.TAB.NOT_FOUND_APPLICATION
   *                   data: null
   *               notTabulated:
   *                 value:
   *                   type: error
   *                   title: Error
   *                   message: La ronda aún no tiene tabulación calculada
   *                   errorCode: NOM035.TAB.NOT_TABULATED
   *                   data: null
   *       500:
   *         description: Error no controlado
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Error
   *               message: Ocurrió un error inesperado al tabular la ronda
   *               errorCode: NOM035.TAB.SYS_UNHANDLED
   *               data: null
   */
  async show(ctx: HttpContext) {
    const { response, i18n, params, businessUnitScope } = ctx
    try {
      if (!(await this.checkPermission(ctx, 'read'))) {
        throw new QuestionnaireTabulationServiceError(
          i18n.formatMessage('nom035.questionnaire_tabulation.forbidden'),
          NOM035_TABULATION_ERROR_CODES.FORBIDDEN,
          403
        )
      }

      const applicationId = await this.validateApplicationId(params.applicationId)
      const service = new QuestionnaireTabulationService()
      const result = await service.getAggregates(applicationId, businessUnitScope ?? [], i18n)

      return StandardResponseFormatter.success(
        response,
        this.applyKAnonymity(result),
        'Tabulación NOM-035',
        i18n.formatMessage('nom035.questionnaire_tabulation.show_message')
      )
    } catch (error) {
      const resolved = resolveQuestionnaireTabulationApiError(error, 500, i18n)
      return StandardResponseFormatter.error(
        response,
        resolved.message,
        resolved.status,
        resolved.errorCode
      )
    }
  }

  /**
   * @swagger
   * /api/nom035/questionnaire-tabulation/{applicationId}/employees:
   *   get:
   *     summary: Consultar resultados por empleado (uso interno)
   *     description: >
   *       Devuelve el puntaje y nivel individual por empleado para una ronda tabulada.
   *       Endpoint confidencial para flujo interno del programa NOM-035.
   *     tags: [NOM035]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema:
   *           type: integer
   *       - in: header
   *         name: Accept-Language
   *         required: false
   *         schema:
   *           type: string
   *           enum: [es, en]
   *       - in: path
   *         name: applicationId
   *         required: true
   *         schema:
   *           type: integer
   *           minimum: 1
   *     responses:
   *       200:
   *         description: Resultados por empleado obtenidos correctamente
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Resultados por empleado
   *               message: Resultados por empleado obtenidos correctamente
   *               data:
   *                 employees:
   *                   applicationId: 123
   *                   employees:
   *                     - employeeId: 5
   *                       score: 88
   *                       riskLevel: medio
   *       400:
   *         description: Parámetro inválido
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Error
   *               message: Datos inválidos
   *               errorCode: NOM035.TAB.VAL_INPUT
   *               data: null
   *       403:
   *         description: Sin permiso para consultar resultados individuales
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Error
   *               message: Sin permiso para consultar o calcular la tabulación
   *               errorCode: NOM035.TAB.FORBIDDEN
   *               data: null
   *       404:
   *         description: Ronda no encontrada o fuera de alcance
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Error
   *               message: Ronda no encontrada o fuera del alcance del usuario
   *               errorCode: NOM035.TAB.NOT_FOUND_APPLICATION
   *               data: null
   *       500:
   *         description: Error no controlado
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Error
   *               message: Ocurrió un error inesperado al tabular la ronda
   *               errorCode: NOM035.TAB.SYS_UNHANDLED
   *               data: null
   */
  async employees(ctx: HttpContext) {
    const { response, i18n, params, businessUnitScope } = ctx
    try {
      if (!(await this.checkPermission(ctx, 'write'))) {
        throw new QuestionnaireTabulationServiceError(
          i18n.formatMessage('nom035.questionnaire_tabulation.forbidden'),
          NOM035_TABULATION_ERROR_CODES.FORBIDDEN,
          403
        )
      }

      const applicationId = await this.validateApplicationId(params.applicationId)
      const service = new QuestionnaireTabulationService()
      const result = await service.getEmployeeResults(applicationId, businessUnitScope ?? [], i18n)

      return StandardResponseFormatter.success(
        response,
        result,
        'Resultados por empleado',
        i18n.formatMessage('nom035.questionnaire_tabulation.employees_message')
      )
    } catch (error) {
      const resolved = resolveQuestionnaireTabulationApiError(error, 500, i18n)
      return StandardResponseFormatter.error(
        response,
        resolved.message,
        resolved.status,
        resolved.errorCode
      )
    }
  }
}
