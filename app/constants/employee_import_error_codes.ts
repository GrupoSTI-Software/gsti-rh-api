/**
 * Códigos estables para importación masiva de empleados por Excel.
 * Prefijo EMP.IMPORT.
 */
export const EMPLOYEE_IMPORT_ERROR_CODES = {
  /** Archivo ausente o no es Excel válido */
  VAL_FILE: 'EMP.IMPORT.VAL_FILE',
  /** Cabeceras obligatorias faltantes o inválidas */
  VAL_HEADERS: 'EMP.IMPORT.VAL_HEADERS',
  /** Filas de datos por encima del máximo soportado en una sola petición síncrona */
  VAL_ROWS: 'EMP.IMPORT.VAL_ROWS',
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
  /**
   * Tope de filas de datos por archivo (sin contar cabecera). Por encima de
   * este número, el procesamiento secuencial de `EmployeeService#importFromExcel`
   * (varias queries por fila + sincronización ZKTeco en lotes) arriesga
   * superar el timeout del proxy/gateway delante de esta API dentro de una
   * sola petición HTTP síncrona.
   *
   * Único valor que hay que tocar para subir o bajar el tope: tanto el
   * mensaje de error (`EmployeeService#createRowLimitValidationError`) como
   * el resolver de la respuesta (`resolveEmployeeImportApiError`) lo leen de
   * aquí en vez de tener el número repetido. Sin variable de entorno a
   * propósito: es una constante de arquitectura, no de configuración por
   * ambiente.
   */
  maxDataRows: 500,
} as const

export function isEmployeeImportExcelPath(url: string): boolean {
  return /\/employees\/import-excel\/?(\?|$)/.test(url)
}
