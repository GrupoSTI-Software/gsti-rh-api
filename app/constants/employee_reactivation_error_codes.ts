/**
 * Códigos estables de la reactivación de colaboradores (VLRH-C0040).
 * Prefijo EMP.REACTIVATION. Los de cupo siguen siendo EMP.QUOTA.*.
 */
export const EMPLOYEE_REACTIVATION_ERROR_CODES = {
  /** El código original lo usa otro colaborador vivo de la misma empresa (VLRH-H1790812613829) — 409. */
  CODE_TAKEN: 'EMP.REACTIVATION.CODE_TAKEN',
  /**
   * La salida ya se concretó: expediente cerrado, o constancia/convenio emitidos
   * (R2 de VLRH-C0040, VLRH-H1791055794596) — 409. Corresponde reincorporar.
   */
  EXIT_CONCLUDED: 'EMP.REACTIVATION.EXIT_CONCLUDED',
} as const

export type EmployeeReactivationErrorCode =
  (typeof EMPLOYEE_REACTIVATION_ERROR_CODES)[keyof typeof EMPLOYEE_REACTIVATION_ERROR_CODES]

/**
 * Por qué la salida cuenta como concretada (regla 1 de VLRH-H1791055794596).
 * Viaja en `data.reason` del 409; nunca folios, fechas ni autores.
 */
export type EmployeeReactivationExitConcludedReason =
  | 'case-closed'
  | 'separation-letter-issued'
  | 'termination-agreement-issued'
