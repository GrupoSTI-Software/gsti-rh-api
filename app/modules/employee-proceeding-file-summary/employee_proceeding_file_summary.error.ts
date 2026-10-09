import {
  EMPLOYEE_PROCEEDING_FILE_SUMMARY_ERROR_KEYS,
  type EmployeeProceedingFileSummaryErrorKey,
} from './employee_proceeding_file_summary.constants.js'

/**
 * Error de dominio del resumen del expediente. Lleva el status HTTP, la key
 * semántica y el prefijo i18n (`<prefijo>_title` / `<prefijo>_detail` en
 * `resources/langs/*.json`); el texto en español es el respaldo si falta la
 * traducción.
 */
export class EmployeeProceedingFileSummaryError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly key: EmployeeProceedingFileSummaryErrorKey,
    readonly i18nPrefix: string,
    readonly fallbackTitle: string,
    readonly fallbackDetail: string
  ) {
    super(fallbackDetail)
    this.name = 'EmployeeProceedingFileSummaryError'
  }

  /** El empleado no existe o pertenece a otra empresa. */
  static employeeNotFound(): EmployeeProceedingFileSummaryError {
    return new EmployeeProceedingFileSummaryError(
      404,
      EMPLOYEE_PROCEEDING_FILE_SUMMARY_ERROR_KEYS.EMPLOYEE_NOT_FOUND,
      'employee_proceeding_file_summary_employee_not_found',
      'Empleado no encontrado',
      'El empleado no existe o no está disponible para tu cuenta.'
    )
  }
}
