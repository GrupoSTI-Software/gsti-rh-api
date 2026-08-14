/**
 * Códigos estables del cupo de empleados por empresa (CAP-07-01-03).
 * Prefijo EMP.QUOTA / EMP.IMPORT.
 */
export const EMPLOYEE_QUOTA_ERROR_CODES = {
  /** Alta individual o reactivación que rebasa el cupo efectivo */
  EXCEEDED: 'EMP.QUOTA.EXCEEDED',
  /** Empresa self-service sin contratación vigente */
  NO_PLAN: 'EMP.QUOTA.NO_PLAN',
  /** Carga masiva que rebasa el cupo (emite USRH1785441818458) */
  IMPORT_EXCEEDED: 'EMP.IMPORT.QUOTA_EXCEEDED',
  /** Carga masiva en empresa self-service sin plan (emite USRH1785441818458) */
  IMPORT_NO_PLAN: 'EMP.IMPORT.NO_PLAN',
} as const

export type EmployeeQuotaErrorCode =
  (typeof EMPLOYEE_QUOTA_ERROR_CODES)[keyof typeof EMPLOYEE_QUOTA_ERROR_CODES]
