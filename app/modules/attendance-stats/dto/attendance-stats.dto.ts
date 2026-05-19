/**
 * DTOs y tipos del módulo Attendance Stats.
 *
 * Define el contrato de filtros, contadores crudos, scope resuelto
 * y respuestas para los 3 endpoints (overview, by-department, by-employee).
 */

export interface AttendanceStatsFilters {
  startDay: string
  endDay: string
  departmentIds?: number[]
  employeeIds?: number[]
  businessUnitId?: number
  payrollBusinessUnitId?: number
  branchOfficeIds?: number[]
}

export interface RawCounters {
  assists: number
  tolerances: number
  delays: number
  earlyOuts: number
  faults: number
}

export interface AttendanceStatistics extends RawCounters {
  totalAvailable: number
  ontimePercentage: number
  tolerancePercentage: number
  delayPercentage: number
  earlyOutPercentage: number
  faultPercentage: number
}

export interface OverviewResponse {
  statistics: AttendanceStatistics
  period: {
    startDay: string
    endDay: string
    evaluableDays: number
  }
}

export interface DepartmentInfo {
  departmentId: number
  departmentName: string
}

export interface DepartmentRow {
  department: DepartmentInfo
  statistics: AttendanceStatistics
}

export interface EmployeeInfo {
  employeeId: number
  employeeCode: string | null
  employeeFirstName: string | null
  employeeLastName: string | null
  employeeSecondLastName: string | null
  departmentId: number | null
  positionId: number | null
  businessUnitId: number
  payrollBusinessUnitId: number
}

export interface EmployeeRow {
  employee: EmployeeInfo
  statistics: AttendanceStatistics
}

export interface ResolvedScope {
  /** [] => sin scope (responder 403). */
  allowedBusinessUnitIds: number[]
}

/** Filas crudas que devuelve el repository para overview (1 fila). */
export interface OverviewCountersRow extends RawCounters {}

/** Filas crudas que devuelve el repository para by-department (N filas). */
export interface DepartmentCountersRow extends RawCounters {
  departmentId: number
  departmentName: string
}

/** Filas crudas que devuelve el repository para by-employee (N filas). */
export interface EmployeeCountersRow extends RawCounters {
  employeeId: number
  employeeCode: string | null
  employeeFirstName: string | null
  employeeLastName: string | null
  employeeSecondLastName: string | null
  departmentId: number | null
  positionId: number | null
  businessUnitId: number
  payrollBusinessUnitId: number
}
