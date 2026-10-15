import AccessPoint from '#models/access_point'
import AccessPointEmployee from '#models/access_point_employee'
import Employee from '#models/employee'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { TenantContext } from '#utils/tenant_context'
import type { AccessPointScopePort } from '#modules/access-point/sharing/access_point_scope.port'
import AccessPointScopeRepositoryMysql from '#modules/access-point/sharing/access_point_scope.repository.mysql'
import type EmployeeAssignmentRepository from './employee_assignment.repository.js'
import type { BusinessUnitScope } from './employee_assignment.repository.js'

/**
 * Adaptador Lucid del puerto de asignación de empleados a puntos de acceso.
 *
 * Todas las consultas se acotan al alcance de unidades de negocio de la
 * petición, de modo que un identificador de otra unidad se comporte como
 * inexistente en lugar de filtrar su existencia.
 */
export default class EmployeeAssignmentRepositoryMysql
  implements EmployeeAssignmentRepository
{
  constructor(
    private readonly sharing: AccessPointScopePort = new AccessPointScopeRepositoryMysql()
  ) {}

  /** Aplica el alcance de unidades de negocio cuando la petición lo acota. */
  private applyScope<T extends { whereIn: (column: string, values: number[]) => T }>(
    query: T,
    scope: BusinessUnitScope
  ): T {
    if (!scope || scope.length === 0) return query
    return query.whereIn('businessUnitId', scope)
  }

  /**
   * El equipo se lee sin el mixin porque el de otra empresa compartido con la
   * del alcance tambien cuenta; la consulta se cierra dentro del bypass
   * (VLRH-A0036, M12). Quien lo ve lo decide el scope del checador.
   *
   * Sin alcance falla cerrado: el bypass quita la barrera del mixin, y un
   * llamador sin empresa (job, otra ruta) no debe ver cualquier checador.
   */
  async accessPointScope(
    accessPointId: number,
    scope: BusinessUnitScope
  ): Promise<number[] | null> {
    if (!scope || scope.length === 0) return null
    const accessPoint = await TenantContext.runUnscoped(
      () =>
        AccessPoint.query()
          .where('access_point_id', accessPointId)
          .whereNull('access_point_deleted_at')
          .first(),
      TENANT_UNSCOPED_REASON.ACCESS_POINT_SHARING
    )
    if (!accessPoint) return null
    const participants = await this.sharing.participants(
      accessPoint.accessPointId,
      accessPoint.businessUnitId
    )
    return participants.some((id) => scope.includes(id)) ? participants : null
  }

  async employeeBusinessUnitId(
    employeeId: number,
    scope: BusinessUnitScope
  ): Promise<number | null> {
    const query = Employee.query().where('employeeId', employeeId)
    const found = await this.applyScope(query, scope).first()
    return found ? (found.businessUnitId ?? null) : null
  }

  async findAssignment(
    accessPointId: number,
    employeeId: number,
    scope: BusinessUnitScope
  ): Promise<AccessPointEmployee | null> {
    const query = AccessPointEmployee.query()
      .where('accessPointId', accessPointId)
      .where('employeeId', employeeId)
    const found = await this.applyScope(query, scope).first()
    return found ?? null
  }

  async createAssignment(
    accessPointId: number,
    employeeId: number
  ): Promise<AccessPointEmployee> {
    // `businessUnitId` no se toma del payload: el modelo lo resuelve desde el
    // empleado padre en su hook de creación.
    return AccessPointEmployee.create({ accessPointId, employeeId })
  }

  async removeAssignment(assignment: AccessPointEmployee): Promise<void> {
    // Borrado lógico: el modelo compone SoftDeletes, así que conserva el
    // historial de la asignación retirada.
    await assignment.delete()
  }
}
