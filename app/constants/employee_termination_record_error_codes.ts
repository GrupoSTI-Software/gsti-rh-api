/**
 * Códigos estables del registro de baja en la ficha del colaborador
 * (VLRH-H1792172889566). Prefijo EMP.TERMINATION. Son rechazos del guardado
 * de la ficha (`PUT /api/employees/:employeeId`), no del expediente de salida.
 */
export const EMPLOYEE_TERMINATION_RECORD_ERROR_CODES = {
  /**
   * Poner, cambiar o vaciar fecha, modalidad o tipo de baja de un colaborador
   * activo (regla 1): la baja se programa en el expediente de salida — 400.
   */
  ACTIVE_CHANGE_FORBIDDEN: 'EMP.TERMINATION.ACTIVE_CHANGE_FORBIDDEN',
  /** Dejar sin fecha de baja a un colaborador dado de baja (regla 4): para eso existe Reactivar — 400. */
  CLEAR_FORBIDDEN: 'EMP.TERMINATION.CLEAR_FORBIDDEN',
  /**
   * Quitar la baja antigua de un activo con expediente de salida en curso
   * (VLRH-H1792361735984, regla 3c): la baja se cancela en el expediente — 409.
   */
  OPEN_CASE: 'EMP.TERMINATION.OPEN_CASE',
} as const

export type EmployeeTerminationRecordErrorCode =
  (typeof EMPLOYEE_TERMINATION_RECORD_ERROR_CODES)[keyof typeof EMPLOYEE_TERMINATION_RECORD_ERROR_CODES]
