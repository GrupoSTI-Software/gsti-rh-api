interface AssistExcelFilterInterface {
  filterDate: string
  filterDateEnd: string
  filterDatePay?: string
  userResponsibleId?: number
  businessUnitId?: number
  payrollBusinessUnitId?: number
  branchNameIds?: number[]
  /**
   * Lo pone el servidor desde `ReportJobFilters`; nunca viene del request HTTP.
   * Cuando es `true` y `userResponsibleId` está ausente, los generadores de
   * toda la empresa incluyen al bloque final de empleados sin departamento.
   */
  includeUnassigned?: boolean
}
export type { AssistExcelFilterInterface }
