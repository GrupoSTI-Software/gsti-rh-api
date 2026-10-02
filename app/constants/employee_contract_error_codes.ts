/**
 * Códigos estables del contrato del empleado. Prefijo EMP.CONTRACT.
 * Espejo de employee_import_error_codes.ts (EMP.IMPORT.*).
 */
export const EMPLOYEE_CONTRACT_ERROR_CODES = {
  /** Entrada inválida (Vine) en alta o edición de contrato (USRH1789328927648) */
  VAL_INPUT: 'EMP.CONTRACT.VAL_INPUT',
} as const

export type EmployeeContractErrorCode =
  (typeof EMPLOYEE_CONTRACT_ERROR_CODES)[keyof typeof EMPLOYEE_CONTRACT_ERROR_CODES]
