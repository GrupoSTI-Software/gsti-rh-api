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
