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
  /** Indica si el punto de acceso existe dentro del alcance. */
  accessPointExists(accessPointId: number, scope: BusinessUnitScope): Promise<boolean>

  /** Indica si el empleado existe dentro del alcance. */
  employeeExists(employeeId: number, scope: BusinessUnitScope): Promise<boolean>

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
