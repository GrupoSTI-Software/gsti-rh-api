/**
 * Códigos estables para importación masiva de empleados por Excel.
 * Prefijo EMP.IMPORT.
 */
export const EMPLOYEE_IMPORT_ERROR_CODES = {
  /** Archivo ausente o no es Excel válido */
  VAL_FILE: 'EMP.IMPORT.VAL_FILE',
  /** Cabeceras obligatorias faltantes o inválidas */
  VAL_HEADERS: 'EMP.IMPORT.VAL_HEADERS',
  /** Fallo inesperado durante la importación */
  SERVER: 'EMP.IMPORT.SERVER',
} as const

export type EmployeeImportErrorCode =
  (typeof EMPLOYEE_IMPORT_ERROR_CODES)[keyof typeof EMPLOYEE_IMPORT_ERROR_CODES]

/** Contrato multipart documentado para POST /api/employees/import-excel */
export const EMPLOYEE_IMPORT_UPLOAD = {
  multipartField: 'file',
  acceptedExtensions: ['.xlsx', '.xls'] as const,
  contentType: 'multipart/form-data',
  /** Alineado con límite del backoffice (10 MB) */
  maxFileBytes: 10 * 1024 * 1024,
  maxFileSizeLabel: '10 MB',
} as const

export function isEmployeeImportExcelPath(url: string): boolean {
  return /\/employees\/import-excel\/?(\?|$)/.test(url)
}
