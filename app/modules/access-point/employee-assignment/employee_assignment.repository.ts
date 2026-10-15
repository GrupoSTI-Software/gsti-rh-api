import type AccessPointEmployee from '#models/access_point_employee'

/**
 * Alcance de unidades de negocio que la petición puede tocar.
 */
export type BusinessUnitScope = number[] | null

/**
 * Puerto de persistencia de la asignación de empleados a puntos de acceso.
 *
 * El servicio depende de esta abstracción y no de Lucid, de modo que la regla
 * de negocio se pueda probar sin base de datos.
 */
export default interface EmployeeAssignmentRepository {
  /**
   * Scope del punto de acceso (responsable + invitadas vivas) si es de una
   * empresa del alcance o esta compartido con ella; null si no lo ve
   * (VLRH-P0065, 6).
   */
  accessPointScope(accessPointId: number, scope: BusinessUnitScope): Promise<number[] | null>

  /** Empresa del empleado si existe dentro del alcance; `null` si no. */
  employeeBusinessUnitId(employeeId: number, scope: BusinessUnitScope): Promise<number | null>

  /** Devuelve la asignación vigente, o null si no la hay. */
  findAssignment(
    accessPointId: number,
    employeeId: number,
    scope: BusinessUnitScope
  ): Promise<AccessPointEmployee | null>

  /** Crea la asignación entre el empleado y el punto de acceso. */
  createAssignment(accessPointId: number, employeeId: number): Promise<AccessPointEmployee>

  /** Retira la asignación indicada, con borrado lógico. */
  removeAssignment(assignment: AccessPointEmployee): Promise<void>
}
