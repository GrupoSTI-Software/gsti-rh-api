/**
 * Catálogo de códigos de error de la asignación de empleados a puntos de
 * acceso.
 *
 * Convención de la cadena: `ACCP.ASSIGN.<SEMANTICO>` en SCREAMING_SNAKE, sin
 * numeración, igual que el resto de módulos recientes. El BO ramifica su UI por
 * `key`; estos códigos quedan para trazabilidad.
 */
export const ACCESS_POINT_EMPLOYEE_ERROR_CODES = {
  /** Parámetros de ruta mal formados — 400. */
  VAL_INPUT: 'ACCP.ASSIGN.VAL_INPUT',
  /** Punto de acceso inexistente o fuera del alcance — 404. */
  ACCESS_POINT_NOT_FOUND: 'ACCP.ASSIGN.ACCESS_POINT_NOT_FOUND',
  /** Empleado inexistente o fuera del alcance — 404. */
  EMPLOYEE_NOT_FOUND: 'ACCP.ASSIGN.EMPLOYEE_NOT_FOUND',
  /** El empleado ya estaba asignado a ese punto de acceso — 409. */
  ALREADY_ASSIGNED: 'ACCP.ASSIGN.ALREADY_ASSIGNED',
  /** Se intentó quitar una asignación que no existe — 404. */
  ASSIGNMENT_NOT_FOUND: 'ACCP.ASSIGN.ASSIGNMENT_NOT_FOUND',
  /** Sin permiso sobre el módulo de empleados — 403. */
  FORBIDDEN: 'ACCP.ASSIGN.FORBIDDEN',
  /** Fallo no clasificado — 500. */
  INTERNAL: 'ACCP.ASSIGN.INTERNAL',
} as const

export type AccessPointEmployeeErrorCode =
  (typeof ACCESS_POINT_EMPLOYEE_ERROR_CODES)[keyof typeof ACCESS_POINT_EMPLOYEE_ERROR_CODES]
