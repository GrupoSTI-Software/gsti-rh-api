/**
 * Códigos estables de la reactivación de colaboradores (VLRH-C0040).
 * Prefijo EMP.REACTIVATION. Los de cupo siguen siendo EMP.QUOTA.*.
 */
export const EMPLOYEE_REACTIVATION_ERROR_CODES = {
  /** El código original lo usa otro colaborador vivo de la misma empresa (VLRH-H1790812613829) — 409. */
  CODE_TAKEN: 'EMP.REACTIVATION.CODE_TAKEN',
} as const

export type EmployeeReactivationErrorCode =
  (typeof EMPLOYEE_REACTIVATION_ERROR_CODES)[keyof typeof EMPLOYEE_REACTIVATION_ERROR_CODES]
