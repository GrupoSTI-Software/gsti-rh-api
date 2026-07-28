export interface RepseCoverageReportFilters {
  from: string
  to: string
  contractingCompanyId?: number
  employeeId?: number
  page: number
  perPage: number
}

export interface RepseCoverageReportExportFilters {
  from: string
  to: string
  contractingCompanyId?: number
  employeeId?: number
}

export interface RepseCoverageCompanyBreakdown {
  companyId: number
  companyName: string
  diasBase: number
  diasPrestados: number
  diasServidos: number
  porcentajeObservado: number
  porcentajeDeclarado: number | null
  diferencia: number | null
}

export interface RepseCoverageMovementRow {
  assignmentId: number
  startDate: string
  endDate: string
  effectiveEndDate: string
  sourceBranchId: number
  sourceBranchName: string
  sourceCompanyId: number | null
  sourceCompanyName: string | null
  targetBranchId: number
  targetBranchName: string
  targetCompanyId: number | null
  targetCompanyName: string | null
  reason: string | null
}

export interface RepseCoverageEmployeeRow {
  employeeId: number
  employeeName: string
  employeeCode: string | null
  diasLaborados: number
  companies: RepseCoverageCompanyBreakdown[]
  movimientos: RepseCoverageMovementRow[]
}

export interface RepseCoverageReportResult {
  meta: {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
  }
  data: RepseCoverageEmployeeRow[]
}

export interface RepseCoverageExportRow {
  employeeId: number
  employeeName: string
  employeeCode: string | null
  companyId: number
  companyName: string
  diasLaborados: number
  diasBase: number
  diasPrestados: number
  diasServidos: number
  porcentajeObservado: number
  porcentajeDeclarado: number | null
  diferencia: number | null
}
