interface AssistDepartmentExcelFilterInterface {
  departmentId: number
  filterDate: string
  filterDateEnd: string
  filterDatePay: string
  userResponsibleId?: number
  businessUnitId?: number
  payrollBusinessUnitId?: number
  branchNameIds?: number[]
}
export type { AssistDepartmentExcelFilterInterface }
