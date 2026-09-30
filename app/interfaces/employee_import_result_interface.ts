export interface EmployeeImportRowError {
  row: number
  field?: string
  message: string
}

export interface EmployeeImportSummary {
  totalRows: number
  processed: number
  created: number
  updated: number
  failed: number
  skipped: number
  limitReached: boolean
}

export interface EmployeeImportResult {
  summary: EmployeeImportSummary
  rowErrors: EmployeeImportRowError[]
  warnings: string[]
  /** DEPRECADO: alias legado para el BO hasta ESB-07-07-03-02 */
  errors: string[]
}

/**
 * Fila que declara una empresa distinta de la activa (USRH1789747321650,
 * reglas 1 y 2). Lleva los nombres tal como venían en el archivo para que
 * quien lo armó pueda corregirlo sin abrir el Excel original.
 */
export interface EmployeeImportCompanyMismatchRow {
  row: number
  businessUnit: string
  payrollBusinessUnit: string
}
