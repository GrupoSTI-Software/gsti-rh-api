import type { HttpContext } from '@adonisjs/core/http'
import QuestionnaireApplicabilityService from '#services/questionnaire_applicability_service'
import { questionnaireApplicabilityFilterValidator } from '#validators/questionnaire_applicability'
import { StandardResponseFormatter } from '../helpers/standard_response_formatter.js'
import {
  QUESTIONNAIRE_APPLICABILITY_ERROR_CODES,
} from '#constants/questionnaire_applicability_error_codes'
import { resolveQuestionnaireApplicabilityApiError } from '../helpers/questionnaire_applicability_api_error.js'
import RoleService from '#services/role_service'

export default class QuestionnaireApplicabilityController {
  /**
   * Verifica si el usuario tiene permiso para acceder al módulo de compliance.
   * Los roles 'root' tienen acceso total.
   */
  private async checkPermission(ctx: HttpContext): Promise<boolean> {
    const user = ctx.auth.user
    if (!user) return false
    
    await user.load('role')
    if (user.role?.roleSlug === 'root') return true

    const roleService = new RoleService()
    return await roleService.hasAccess(user.roleId, 'compliance', 'read')
  }

  /**
   * @swagger
   * /api/nom035/questionnaire-applicability:
   *   get:
   *     summary: Obtener aplicabilidad de cuestionarios NOM-035 por empresa
   *     description: >
   *       Calcula por cada sucursal de la empresa (businessUnitId o companyId) el total de empleados activos
   *       y el instrumento aplicable según umbrales NOM-035.
   *     tags: [NOM035]
   *     parameters:
   *       - in: query
   *         name: businessUnitId
   *         schema:
   *           type: integer
   *           minimum: 1
   *         description: Identificador de la empresa (unidad de negocio)
   *       - in: query
   *         name: companyId
   *         schema:
   *           type: integer
   *           minimum: 1
   *         description: Alias de businessUnitId
   *     responses:
   *       200:
   *         description: Aplicabilidad por sucursal obtenida correctamente
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Questionnaire Applicabilities
   *               message: Aplicabilidad por sucursal obtenida correctamente
   *               data:
   *                 questionnaireApplicabilities:
   *                   - branchOfficeId: 12
   *                     branchOfficeName: Sucursal Centro
   *                     activeEmployees: 55
   *                     applicableInstrument: guide_iii
   *                     canLaunch: false
   *                     launchBlockReason: OPEN_ROUND_EXISTS
   *                     blockingApplicationId: 9981
   *                     note: null
   *       400:
   *         description: Parámetros inválidos
   *       401:
   *         description: No autenticado
   *       403:
   *         description: Sin permisos (requiere módulo compliance)
   *       404:
   *         description: Empresa no encontrada o no disponible para esta instancia
   */
  async index(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    try {
      if (!(await this.checkPermission(ctx))) {
        return StandardResponseFormatter.error(
          response,
          i18n.formatMessage('nom035.questionnaire_applicability.forbidden'),
          403,
          QUESTIONNAIRE_APPLICABILITY_ERROR_CODES.FORBIDDEN
        )
      }

      const filters = await request.validateUsing(questionnaireApplicabilityFilterValidator)
      const businessUnitId = filters.businessUnitId || filters.companyId

      if (!businessUnitId) {
        // Esto no debería pasar por la validación del refine, pero por seguridad TS:
        return StandardResponseFormatter.error(
          response,
          'Se requiere businessUnitId o companyId',
          400,
          QUESTIONNAIRE_APPLICABILITY_ERROR_CODES.VAL_INPUT
        )
      }

      const questionnaireApplicabilities = await QuestionnaireApplicabilityService.getByBusinessUnit(
        businessUnitId,
        i18n
      )

      return StandardResponseFormatter.success(
        response,
        questionnaireApplicabilities,
        'Questionnaire Applicabilities',
        i18n.formatMessage('nom035.questionnaire_applicability.index_message')
      )
    } catch (error) {
      const { message, status, errorCode } = resolveQuestionnaireApplicabilityApiError(
        error,
        400,
        i18n
      )
      return StandardResponseFormatter.error(response, message, status, errorCode)
    }
  }

  /**
   * @swagger
   * /api/nom035/questionnaire-applicability/{branchOfficeId}:
   *   get:
   *     summary: Obtener aplicabilidad de cuestionario NOM-035 por sucursal
   *     tags: [NOM035]
   *     parameters:
   *       - in: path
   *         name: branchOfficeId
   *         required: true
   *         schema:
   *           type: integer
   *           minimum: 1
   *         description: Identificador de la sucursal
   *     responses:
   *       200:
   *         description: Aplicabilidad de sucursal obtenida correctamente
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Questionnaire Applicability
   *               message: Aplicabilidad de sucursal obtenida correctamente
   *               data:
   *                 questionnaireApplicability:
   *                   branchOfficeId: 12
   *                   branchOfficeName: Sucursal Centro
   *                   activeEmployees: 55
   *                   applicableInstrument: guide_iii
   *                   canLaunch: false
   *                   launchBlockReason: OPEN_ROUND_EXISTS
   *                   blockingApplicationId: 9981
   *                   note: null
   *       400:
   *         description: Parámetro inválido
   *       401:
   *         description: No autenticado
   *       403:
   *         description: Sin permisos (requiere módulo compliance)
   *       404:
   *         description: Sucursal no encontrada o no disponible para esta instancia
   */
  async show(ctx: HttpContext) {
    const { params, response, i18n } = ctx
    try {
      if (!(await this.checkPermission(ctx))) {
        return StandardResponseFormatter.error(
          response,
          i18n.formatMessage('nom035.questionnaire_applicability.forbidden'),
          403,
          QUESTIONNAIRE_APPLICABILITY_ERROR_CODES.FORBIDDEN
        )
      }

      const branchOfficeId = Number(params.branchOfficeId)
      if (!Number.isInteger(branchOfficeId) || branchOfficeId <= 0) {
        return StandardResponseFormatter.error(
          response,
          'El parámetro branchOfficeId debe ser un número entero positivo',
          400,
          QUESTIONNAIRE_APPLICABILITY_ERROR_CODES.VAL_INPUT
        )
      }

      const questionnaireApplicability = await QuestionnaireApplicabilityService.getByBranchOffice(
        branchOfficeId,
        i18n
      )

      return StandardResponseFormatter.success(
        response,
        questionnaireApplicability,
        'Questionnaire Applicability',
        i18n.formatMessage('nom035.questionnaire_applicability.show_message')
      )
    } catch (error) {
      const { message, status, errorCode } = resolveQuestionnaireApplicabilityApiError(
        error,
        400,
        i18n
      )
      return StandardResponseFormatter.error(response, message, status, errorCode)
    }
  }
}
