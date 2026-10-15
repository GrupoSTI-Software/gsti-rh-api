import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import TeleworkWorkerService from '#services/telework_worker_service'
import RoleService from '#services/role_service'
import { SUPPLIES_PERMISSION_DECLARATIONS } from '#constants/supplies_permission_declarations'
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
 * El detalle de insumos (`employeeSlug` y `teleworkSuppliesSummary`) solo se
 * entrega con `supplies:read`; sin él la fila queda idéntica al contrato base.
 * El error inesperado ya no expone el mensaje interno: lo manda al log y
 * responde `detail: null`.
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
   *                               employeeSlug:
   *                                 type: string
   *                                 description: Slug opaco de la ficha del colaborador. Solo con `supplies:read`.
   *                               teleworkSuppliesSummary:
   *                                 type: object
   *                                 description: Resumen de insumos del colaborador (NOM-037 5.7). Solo con `supplies:read`.
   *                                 properties:
   *                                   applies:
   *                                     type: boolean
   *                                   isLegallyRequired:
   *                                     type: boolean
   *                                   deliveredCount:
   *                                     type: integer
   *                                   shippingCount:
   *                                     type: integer
   *                                   ownEquipmentCount:
   *                                     type: integer
   *                                   uncoveredCount:
   *                                     type: integer
   *                                   unsignedCustodyCount:
   *                                     type: integer
   *       '403':
   *         description: Sin permiso del módulo de teletrabajo (code TWK.AUTH.001)
   *       default:
   *         description: Error inesperado
   */
  async index(ctx: HttpContext) {
    const { request, response, i18n, businessUnitScope } = ctx
    // El usuario se estrecha UNA vez: el gate de abajo y el permiso de insumos
    // comparten la misma instancia, sin aserciones no-nulas.
    const user = ctx.auth.user
    try {
      if (!user || !(await this.checkPermission(ctx))) {
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

      // El dato de insumos es de Activos e insumos: sin `supplies:read` no viaja ni
      // el resumen ni el slug de la ficha (el corte es del API, no del BO).
      const canReadSupplies = await new RoleService().hasAccess(
        user.roleId,
        SUPPLIES_PERMISSION_DECLARATIONS.showEmployeeTeleworkSupplies.module,
        'read'
      )

      const qs = request.qs()
      const page = Math.max(Number(qs.page ?? 1) || 1, 1)
      const limit = Math.min(Math.max(Number(qs.limit ?? 50) || 50, 1), 200)
      const search = typeof qs.search === 'string' && qs.search.trim() ? qs.search.trim() : undefined

      const service = new TeleworkWorkerService()
      const result = await service.list({ search, page, limit }, businessUnitScope ?? [], {
        includeSuppliesSummary: canReadSupplies,
      })

      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('telework_workers_title'),
        message: i18n.formatMessage('telework_workers_list_success'),
        data: { teleworkWorkers: result },
      }
    } catch (error) {
      // El mensaje interno NUNCA viaja al cliente: queda en el log.
      logger.error({ err: error }, 'telework_workers.index')
      response.status(500)
      return {
        type: 'error',
        title: i18n.formatMessage('telework_workers_title'),
        message: i18n.formatMessage('telework_workers_unexpected_error'),
        key: 'error-inesperado',
        detail: null,
        code: TWK_ERROR_CODES.SYS_UNHANDLED,
        data: null,
      }
    }
  }
}
