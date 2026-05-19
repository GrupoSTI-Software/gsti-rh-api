/**
 * DTOs y tipos del módulo Attendance Stats.
 *
 * El cómputo se divide en 3 fuentes que el service ensambla:
 * - clean counters: días sin shift_exception, agregados en SQL contra check_in_status almacenado.
 * - informational counters: días de vacaciones, festivos o faltas justificadas (no entran al cierre 100%).
 * - permission days: días con late-arrival/early-departure → el service recomputa status en TS contra la hora autorizada.
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

/** Contadores de asistencia que entran al cierre 100% (+earlyOuts independiente). */
export interface CleanCounters {
  assists: number
  tolerances: number
  delays: number
  earlyOuts: number
  faults: number
}

/** Contadores informativos. NO entran al cierre 100% ni a totalAvailable. */
export interface InformationalCounters {
  justifiedAbsences: number
  vacations: number
  holidays: number
}

export interface AttendanceStatistics extends CleanCounters, InformationalCounters {
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
    /**
     * Conteo de registros empleado-día evaluables en el período (no días calendario).
     * Igual a `statistics.totalAvailable`. Para 50 empleados en 7 días puede llegar a 350.
     */
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
  allowedBusinessUnitIds: number[]
}

/**
 * Fila cruda para un día con permiso `late-arrival` o `early-departure` activo.
 * El service reconstruye el status efectivo contra la hora del permiso.
 */
export interface PermissionDayRow {
  employeeId: number
  departmentId: number | null
  departmentName: string | null
  positionId: number | null
  businessUnitId: number
  payrollBusinessUnitId: number
  employeeCode: string | null
  employeeFirstName: string | null
  employeeLastName: string | null
  employeeSecondLastName: string | null
  day: string
  storedCheckInStatus: string | null
  storedCheckOutStatus: string | null
  shiftTimeStart: string | null
  shiftActiveHours: number | null
  checkInPunchUtc: string | null
  checkOutPunchUtc: string | null
  lateArrivalCheckInTime: string | null
  earlyDepartureCheckOutTime: string | null
}

/** Thresholds de tolerancia (cargados desde SystemSetting → Tolerance). */
export interface ToleranceThresholds {
  delayMinutes: number
  faultMinutes: number
}

/** Bundle que devuelve el repository para el endpoint overview. */
export interface OverviewBundle {
  clean: CleanCounters
  informational: InformationalCounters
  permissionDays: PermissionDayRow[]
}

/** Una fila agregada por departamento (clean + informational). */
export interface DepartmentGroup {
  department: DepartmentInfo
  clean: CleanCounters
  informational: InformationalCounters
}

/** Bundle que devuelve el repository para by-department. */
export interface DepartmentBundle {
  groups: DepartmentGroup[]
  permissionDays: PermissionDayRow[]
}

/** Una fila agregada por empleado (clean + informational). */
export interface EmployeeGroup {
  employee: EmployeeInfo
  clean: CleanCounters
  informational: InformationalCounters
}

/** Bundle que devuelve el repository para by-employee. */
export interface EmployeeBundle {
  groups: EmployeeGroup[]
  permissionDays: PermissionDayRow[]
}
