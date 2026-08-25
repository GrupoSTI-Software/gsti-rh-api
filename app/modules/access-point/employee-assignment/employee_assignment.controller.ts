import type { HttpContext } from '@adonisjs/core/http'
import { StandardResponseFormatter } from '#helpers/standard_response_formatter'
import { resolveAccessPointEmployeeApiError } from '#helpers/access_point_employee_api_error'
import EmployeeAssignmentService from './employee_assignment.service.js'
import { assignEmployeeToAccessPointValidator } from './validators/assign_employee.validator.js'

/**
 * Asignación de empleados a puntos de acceso.
 *
 * Cubre el hueco que el backoffice ya invocaba sin contraparte en el API: la
 * sección de biométricos llamaba a estas dos rutas y recibía 404.
 *
 * Errores siempre `{ title, detail, key, code }`: el backoffice ramifica por
 * `key`, nunca por el texto de `detail`.
 */
export default class EmployeeAssignmentController {
  /**
   * @swagger
   * /api/access-points/{accessPointId}/employee/{employeeId}:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags: [Puntos de acceso]
   *     summary: Asigna un empleado a un punto de acceso
   *     parameters:
   *       - in: path
   *         name: accessPointId
   *         required: true
   *         schema: { type: number }
   *         description: Id del punto de acceso
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema: { type: number }
   *         description: Id del empleado
   *     responses:
   *       201:
   *         description: Asignación creada, en data.accessPointEmployee
   *       400:
   *         description: Parámetros de ruta no numéricos (key datos-invalidos)
   *       403:
   *         description: Sin permiso de escritura sobre biométricos (key sin-permiso)
   *       404:
   *         description: Punto de acceso o empleado fuera de alcance
   *       409:
   *         description: El empleado ya estaba asignado (key asignacion-duplicada)
   */
  async store({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new EmployeeAssignmentService(i18n)
      await service.assertCanAccess(auth.user?.roleId)

      const { params } = await request.validateUsing(assignEmployeeToAccessPointValidator, {
        data: { params: request.params() },
      })

      const assignment = await service.assign(
        params.accessPointId,
        params.employeeId,
        businessUnitScope
      )

      return StandardResponseFormatter.success(
        response,
        assignment,
        i18n.formatMessage('access_point_employee_title'),
        i18n.formatMessage('access_point_employee_assigned_message'),
        201,
        'accessPointEmployee'
      )
    } catch (error) {
      return this.respondWithError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/access-points/{accessPointId}/employee/{employeeId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags: [Puntos de acceso]
   *     summary: Retira un empleado de un punto de acceso
   *     parameters:
   *       - in: path
   *         name: accessPointId
   *         required: true
   *         schema: { type: number }
   *         description: Id del punto de acceso
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema: { type: number }
   *         description: Id del empleado
   *     responses:
   *       200:
   *         description: Asignación retirada
   *       400:
   *         description: Parámetros de ruta no numéricos (key datos-invalidos)
   *       403:
   *         description: Sin permiso de escritura sobre biométricos (key sin-permiso)
   *       404:
   *         description: Punto de acceso, empleado o asignación fuera de alcance
   */
  async destroy({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new EmployeeAssignmentService(i18n)
      await service.assertCanAccess(auth.user?.roleId)

      const { params } = await request.validateUsing(assignEmployeeToAccessPointValidator, {
        data: { params: request.params() },
      })

      await service.remove(params.accessPointId, params.employeeId, businessUnitScope)

      return StandardResponseFormatter.success(
        response,
        null,
        i18n.formatMessage('access_point_employee_title'),
        i18n.formatMessage('access_point_employee_removed_message'),
        200,
        'accessPointEmployee'
      )
    } catch (error) {
      return this.respondWithError(response, i18n, error)
    }
  }

  /** Da forma estable a cualquier fallo del caso de uso. */
  private respondWithError(
    response: HttpContext['response'],
    i18n: HttpContext['i18n'],
    error: unknown
  ) {
    const resolved = resolveAccessPointEmployeeApiError(error, i18n)
    response.status(resolved.status)
    return {
      title: resolved.title,
      detail: resolved.detail,
      key: resolved.key,
      code: resolved.code,
    }
  }
}
