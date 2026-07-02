import type { HttpContext } from '@adonisjs/core/http'
import RoleService from '#services/role_service'
import { StandardResponseFormatter } from '../../helpers/standard_response_formatter.js'
import { resolveNom035DisclosureApiError } from '../../helpers/nom035_disclosure_api_error.js'
import { Nom035DisclosureServiceError } from '#exceptions/nom035_disclosure_service_error'
import { NOM035_DISCLOSURE_ERROR_CODES } from '#constants/nom035_disclosure_error_codes'
import Nom035DisclosureService from './nom035_disclosure.service.js'
import { nom035DisclosureQueryValidator } from './validators/nom035_disclosure_query.js'

export default class Nom035DisclosureController {
  private async checkPermission(ctx: HttpContext): Promise<boolean> {
    const user = ctx.auth.user
    if (!user) return false

    await user.load('role')
    if (user.role?.roleSlug === 'root') return true

    const roleService = new RoleService()
    return roleService.hasAccess(user.roleId, 'nom035-disclosure', 'read')
  }

  /**
   * @swagger
   * /api/nom035/disclosure/results:
   *   get:
   *     summary: Consultar resultados agregados y anonimizados NOM-035 del centro de trabajo
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
   *       - in: query
   *         name: branchOfficeId
   *         required: false
   *         schema:
   *           type: integer
   *           minimum: 1
   *         description: >
   *           Requiere permiso read-all. Sin ese permiso el API ignora este parámetro
   *           y devuelve siempre el centro de trabajo del usuario autenticado.
   *     responses:
   *       200:
   *         description: Resultado anonimizado obtenido correctamente
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Resultados de evaluación NOM-035
   *               message: Resultados obtenidos correctamente
   *               data:
   *                 disclosure:
   *                   available: true
   *                   branchOfficeId: 12
   *                   branchOfficeName: Sucursal Centro
   *                   applicationId: 1289
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
   *                     - code: CAT-IV
   *                       score: null
   *                       riskLevel: muy_alto
   *                       respondersCount: 3
   *                       suppressed: true
   *                   domains:
   *                     - code: VIOLENCIA_LABORAL
   *                       categoryCode: CAT-IV
   *                       score: null
   *                       riskLevel: muy_alto
   *                       respondersCount: 3
   *                       suppressed: true
   *       400:
   *         description: Parámetros inválidos
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Error
   *               message: Datos inválidos
   *               errorCode: NOM035.DISC.VAL_INPUT
   *               data: null
   *       401:
   *         description: No autenticado
   *       403:
   *         description: Sin permiso base para consultar difusión NOM-035
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Error
   *               message: Sin permiso para consultar los resultados anonimizados del centro de trabajo
   *               errorCode: NOM035.DISC.FORBIDDEN
   *               data: null
   *       404:
   *         description: Sucursal no encontrada o fuera del alcance tenant
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Error
   *               message: Centro de trabajo no encontrado o fuera del alcance del usuario
   *               errorCode: NOM035.DISC.NOT_FOUND
   *               data: null
   *       422:
   *         description: Usuario sin empleado asociado o sin centro de trabajo activo
   *         content:
   *           application/json:
   *             examples:
   *               noEmployee:
   *                 value:
   *                   type: error
   *                   title: Error
   *                   message: El usuario autenticado no tiene un empleado asociado
   *                   errorCode: NOM035.DISC.NO_EMPLOYEE
   *                   data: null
   *               noBranch:
   *                 value:
   *                   type: error
   *                   title: Error
   *                   message: El empleado no tiene centro de trabajo activo
   *                   errorCode: NOM035.DISC.NO_BRANCH
   *                   data: null
   *       500:
   *         description: Error no controlado
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Error
   *               message: Ocurrió un error inesperado al consultar los resultados anonimizados
   *               errorCode: NOM035.DISC.SYS_UNHANDLED
   *               data: null
   */
  async show(ctx: HttpContext) {
    const { auth, response, i18n, request, businessUnitScope } = ctx

    try {
      const user = auth.user
      if (!user) {
        throw new Nom035DisclosureServiceError(
          i18n.formatMessage('nom035.disclosure.forbidden'),
          NOM035_DISCLOSURE_ERROR_CODES.FORBIDDEN,
          403
        )
      }

      if (!(await this.checkPermission(ctx))) {
        throw new Nom035DisclosureServiceError(
          i18n.formatMessage('nom035.disclosure.forbidden'),
          NOM035_DISCLOSURE_ERROR_CODES.FORBIDDEN,
          403
        )
      }

      const query = await nom035DisclosureQueryValidator.validate({
        branchOfficeId: request.input('branchOfficeId')
          ? Number(request.input('branchOfficeId'))
          : undefined,
      })

      const service = new Nom035DisclosureService()
      const disclosure = await service.getDisclosure({
        user,
        query,
        allowedBusinessUnitIds: businessUnitScope ?? [],
        i18n,
      })

      return StandardResponseFormatter.success(
        response,
        disclosure,
        'Resultados de evaluación NOM-035',
        i18n.formatMessage('nom035.disclosure.show_message')
      )
    } catch (error) {
      const resolved = resolveNom035DisclosureApiError(error, 500, i18n)
      return StandardResponseFormatter.error(
        response,
        resolved.message,
        resolved.status,
        resolved.errorCode
      )
    }
  }
}
