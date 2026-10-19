import AccessPointEmployee from '#models/access_point_employee'
import Employee from '#models/employee'
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
   * Quien ve el checador lo decide la regla unica `visibleTo`: el de otra
   * empresa compartido con la del alcance tambien cuenta. Sin alcance falla
   * cerrado: un llamador sin empresa (job, otra ruta) no ve ningun checador.
   */
  async accessPointScope(
    accessPointId: number,
    scope: BusinessUnitScope
  ): Promise<number[] | null> {
    const seen = await this.sharing.visibleTo(accessPointId, scope ?? [])
    return seen ? seen.deviceScope : null
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
