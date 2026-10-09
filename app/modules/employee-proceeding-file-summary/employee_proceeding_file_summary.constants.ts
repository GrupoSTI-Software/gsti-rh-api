/**
 * Reglas fijas del resumen del expediente de un empleado
 * (`GET /api/employees/:employeeId/proceeding-file-summary`).
 */

/**
 * Ventana de "por vencer", en días naturales de la zona de negocio. Cuenta
 * todo lo vencido (sin límite inferior) y lo que vence de hoy a hoy + 30,
 * ambos inclusive. Es el mismo número que usa la Matriz de vencimientos
 * (`EXPIRATION_MATRIX_WINDOW_DAYS`): si una cambia, la otra debe revisarse
 * para que el contador del expediente y la matriz no digan cosas distintas.
 */
export const EMPLOYEE_PROCEEDING_FILE_SUMMARY_EXPIRING_WINDOW_DAYS = 30

/**
 * Área de los tipos de expediente que pertenecen al colaborador. Es el mismo
 * valor que el backoffice pide en `GET /proceeding-file-types/by-area/employee`.
 */
export const EMPLOYEE_PROCEEDING_FILE_AREA = 'employee'

/** Keys semánticas de error del módulo (contrato título/detalle/key). */
export const EMPLOYEE_PROCEEDING_FILE_SUMMARY_ERROR_KEYS = {
  EMPLOYEE_NOT_FOUND: 'empleado-no-encontrado',
  INVALID_INPUT: 'entrada-invalida',
  UNEXPECTED: 'error-inesperado',
} as const

export type EmployeeProceedingFileSummaryErrorKey =
  (typeof EMPLOYEE_PROCEEDING_FILE_SUMMARY_ERROR_KEYS)[keyof typeof EMPLOYEE_PROCEEDING_FILE_SUMMARY_ERROR_KEYS]
