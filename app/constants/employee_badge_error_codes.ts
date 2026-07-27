/**
 * Catálogo estable de códigos de error del módulo "Gafete del empleado"
 * (USRH1784686362321). Gramática `<AREA>.<BUCKET>[.<SUB>].NNN`, espejo de
 * `repse_provider_error_codes.ts`.
 *
 * `BDG.NF.REG.001` (sin registro REPSE) y `BDG.FORBID.001` (permiso de
 * módulo propio) NO existen: el gafete es universal (R7) y E1/E2 solo
 * montan `auth()` + `businessScope()` (decisión de permisos, §16 del spec).
 */
export const EMPLOYEE_BADGE_ERROR_CODES = {
  /** `employeeId` no es un entero positivo (validación Vine de params). */
  VAL_INPUT: 'BDG.VAL.001',
  /** Empleado inexistente, de otro tenant, eliminado o inactivo (E1/E2). */
  EMPLOYEE_NOT_FOUND: 'BDG.NF.001',
  /** Usuario autenticado sin empleado propio asociado (E3, self-scope). */
  SELF_EMPLOYEE_NOT_FOUND: 'BDG.NF.EMP.001',
  /** Token público inexistente, malformado o revocado (E4) — 404 indistinguible. */
  VERIFICATION_NOT_FOUND: 'BDG.NF.002',
  /** Error no clasificado del dominio. */
  SYS_UNHANDLED: 'BDG.SYS.001',
} as const

export type EmployeeBadgeErrorCode =
  (typeof EMPLOYEE_BADGE_ERROR_CODES)[keyof typeof EMPLOYEE_BADGE_ERROR_CODES]
