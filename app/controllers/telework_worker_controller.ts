import type { HttpContext } from '@adonisjs/core/http'
import TeleworkWorkerService from '#services/telework_worker_service'
import RoleService from '#services/role_service'
import {
  TELEWORK_WORKERS_MODULE_SLUG,
  TWK_ERROR_CODES,
} from '#constants/telework_worker_error_codes'

/**
 * Controlador del listado de teletrabajadores (NOM-037 5.1, vista derivada).
 *
 * Solo lectura: el listado se calcula al momento (filtro >= 40% inclusivo,
 * solo empleados activos con modalidad Home Office o Híbrido, scope tenant).
 * No existen endpoints de escritura porque la vista es derivada.
 *
 * Ref: USRH1782792802491.
 */
export default class TeleworkWorkerController {
  /** Verifica el permiso de lectura del módulo, con bypass para root. */
  private async checkPermission(ctx: HttpContext): Promise<boolean> {
    const user = ctx.auth.user
    if (!user) return false

    await user.load('role')
    if (user.role?.roleSlug === 'root') return true

    const roleService = new RoleService()
    return roleService.hasAccess(user.roleId, TELEWORK_WORKERS_MODULE_SLUG, 'read')
  }

  /**
   * @swagger
   * /api/nom037/telework-workers:
   *   get:
   *     tags:
   *       - NOM-037 Telework Workers
   *     summary: Listado derivado de teletrabajadores del 5.1
   *     security:
   *       - bearerAuth: []
   *     description: |
   *       Devuelve el listado obligatorio de la NOM-037 (numeral 5.1): los
   *       empleados activos de la empresa cuyo porcentaje de teletrabajo es
   *       igual o mayor al 40% (umbral 5.1.f inclusivo). Es una vista derivada:
   *       se calcula al momento y no admite alta/edición/baja manual.
   *
   *       La empresa se resuelve del header `X-Business-Unit-Id`; nunca de la
   *       URL ni del body (anti-IDOR).
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema:
   *           type: string
   *         description: Unidad de negocio activa del usuario autenticado
   *       - in: query
   *         name: search
   *         required: false
   *         schema:
   *           type: string
   *         description: Filtro por nombre del empleado o puesto
   *       - in: query
   *         name: page
   *         required: false
   *         schema:
   *           type: integer
   *           default: 1
   *       - in: query
   *         name: limit
   *         required: false
   *         schema:
   *           type: integer
   *           default: 50
   *     responses:
   *       '200':
   *         description: Listado derivado del 5.1
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     teleworkWorkers:
   *                       type: object
   *                       properties:
   *                         meta:
   *                           type: object
   *                         data:
   *                           type: array
   *                           items:
   *                             type: object
   *                             properties:
   *                               employeeId:
   *                                 type: integer
   *                               employeeCode:
   *                                 type: string
   *                               fullName:
   *                                 type: string
   *                               position:
   *                                 type: string
   *                               workSchedule:
   *                                 type: string
   *                                 enum: [Remote, Hybrid]
   *                               teleworkPercentage:
   *                                 type: number
   *                               workplaces:
   *                                 type: array
   *                                 items:
   *                                   type: object
   *                                   properties:
   *                                     locationType:
   *                                       type: string
   *                                     address:
   *                                       type: string
   *                                     isFixedAgreed:
   *                                       type: boolean
   *                                     hasInternet:
   *                                       type: boolean
   *                                     hasAdequateEquipment:
   *                                       type: boolean
   *       '403':
   *         description: Sin permiso del módulo de teletrabajo (code TWK.AUTH.001)
   *       default:
   *         description: Error inesperado
   */
  async index(ctx: HttpContext) {
    const { request, response, i18n, businessUnitScope } = ctx
    try {
      if (!(await this.checkPermission(ctx))) {
        response.status(403)
        return {
          type: 'error',
          title: i18n.formatMessage('telework_workers_title'),
          message: i18n.formatMessage('telework_workers_forbidden'),
          key: 'sin-permiso',
          detail: null,
          code: TWK_ERROR_CODES.FORBIDDEN,
          data: null,
        }
      }

      const qs = request.qs()
      const page = Math.max(Number(qs.page ?? 1) || 1, 1)
      const limit = Math.min(Math.max(Number(qs.limit ?? 50) || 50, 1), 200)
      const search = typeof qs.search === 'string' && qs.search.trim() ? qs.search.trim() : undefined

      const service = new TeleworkWorkerService()
      const result = await service.list({ search, page, limit }, businessUnitScope ?? [])

      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('telework_workers_title'),
        message: i18n.formatMessage('telework_workers_list_success'),
        data: { teleworkWorkers: result },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: i18n.formatMessage('telework_workers_title'),
        message: i18n.formatMessage('telework_workers_unexpected_error'),
        key: 'error-inesperado',
        detail: error instanceof Error ? error.message : null,
        code: TWK_ERROR_CODES.SYS_UNHANDLED,
        data: null,
      }
    }
  }
}
