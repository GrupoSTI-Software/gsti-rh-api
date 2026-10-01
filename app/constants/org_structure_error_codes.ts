/**
 * Catálogo estable de códigos de error del borrado de estructura organizacional
 * (USRH1788466831356). Gramática semántica `<MOD>.<SLICE>.<SEMANTICO>`, sin
 * numeración, espejo de `employee_position_level_error_codes.ts`.
 *
 * Un `code` = un HTTP fijo; la tabla `ORG_STRUCTURE_ERROR_HTTP_STATUS` lo
 * resuelve para que el helper no deba conocer semántica extra.
 */
export const ORG_STRUCTURE_ERROR_CODES = {
  // ── Departamento ──────────────────────────────────────────────────────────
  /** El departamento no existe, ya se eliminó o es de otra empresa. */
  DEPARTMENT_NOT_FOUND: 'ORG.DEPARTMENT.NOT_FOUND',
  /** El departamento tiene empleados activos: requiere confirmación (force-delete). */
  DEPARTMENT_HAS_EMPLOYEES: 'ORG.DEPARTMENT.HAS_EMPLOYEES',
  /** Interbloqueo, espera agotada o violación de integridad referencial. */
  DEPARTMENT_DELETE_CONFLICT: 'ORG.DEPARTMENT.DELETE_CONFLICT',
  /** Error no clasificado al eliminar el departamento. */
  DEPARTMENT_DELETE_FAILED: 'ORG.DEPARTMENT.DELETE_FAILED',
  // ── Puesto ────────────────────────────────────────────────────────────────
  /** El puesto no existe, ya se eliminó o es de otra empresa. */
  POSITION_NOT_FOUND: 'ORG.POSITION.NOT_FOUND',
  /** Interbloqueo, espera agotada o violación de integridad referencial. */
  POSITION_DELETE_CONFLICT: 'ORG.POSITION.DELETE_CONFLICT',
  /** Error no clasificado al eliminar el puesto. */
  POSITION_DELETE_FAILED: 'ORG.POSITION.DELETE_FAILED',
} as const

export type OrgStructureErrorCode =
  (typeof ORG_STRUCTURE_ERROR_CODES)[keyof typeof ORG_STRUCTURE_ERROR_CODES]

/** Códigos MySQL / MariaDB que indican concurrencia: se convierten en 409. */
export const LOCK_ERROR_CODES = new Set([
  'ER_LOCK_DEADLOCK',
  'ER_LOCK_WAIT_TIMEOUT',
  'ER_ROW_IS_REFERENCED_2',
  'ER_NO_REFERENCED_ROW_2',
])

export const LOCK_ERROR_NUMBERS = new Set([1213, 1205, 1451, 1452])

/** HTTP status por código; un `code` = un status. */
export const ORG_STRUCTURE_ERROR_HTTP_STATUS: Record<OrgStructureErrorCode, number> = {
  [ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_NOT_FOUND]: 404,
  [ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_HAS_EMPLOYEES]: 409,
  [ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_DELETE_CONFLICT]: 409,
  [ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_DELETE_FAILED]: 500,
  [ORG_STRUCTURE_ERROR_CODES.POSITION_NOT_FOUND]: 404,
  [ORG_STRUCTURE_ERROR_CODES.POSITION_DELETE_CONFLICT]: 409,
  [ORG_STRUCTURE_ERROR_CODES.POSITION_DELETE_FAILED]: 500,
}
