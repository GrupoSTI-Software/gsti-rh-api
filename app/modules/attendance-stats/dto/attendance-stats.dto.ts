/**
 * DTOs y tipos del módulo Attendance Stats.
 *
 * Fuente de verdad: tabla `assists` (no `employee_assist_calendars`).
 * Por cada empleado en scope, el repository llama a `syncAssistsService.index`
 * que computa el calendario fresco contra `assists` + `shifts` + `holidays`
 * + `shift_exceptions` con la misma lógica de tolerancias y DST del sistema.
 * El service agrega los días computados aplicando filtros de evaluable,
 * recomputación para late-arrival/early-departure, y contadores informativos.
 */

import type { AssistDayInterface } from '../../../interfaces/assist_day_interface.js'

export interface AttendanceStatsFilters {
  startDay: string
  endDay: string
  departmentIds?: number[]
  employeeIds?: number[]
  businessUnitId?: number
  payrollBusinessUnitId?: number
  branchOfficeIds?: number[]
}

/** Contadores de asistencia que entran al cierre 100% (+ earlyOuts independiente). */
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

/**
 * Estadísticas del overview. Extiende AttendanceStatistics con el conteo de
 * empleados evaluados — exclusivo de este endpoint. by-department y by-employee
 * conservan AttendanceStatistics sin este campo.
 */
export interface OverviewStatistics extends AttendanceStatistics {
  /**
   * Cantidad de empleados evaluados: los que tienen al menos un día evaluable
   * (excluye descanso, vacaciones, festivos, incapacidad, día futuro y
   * excepciones no-generales). En `statistics` global se cuenta sobre todo el
   * período; en `daily[].statistics` solo los empleados con día evaluable en
   * esa fecha.
   */
  employeesQty: number
}

/**
 * Estadísticas de UN día calendario del período, agregadas sobre todos los
 * empleados del scope. `day` en formato yyyy-MM-dd (día laboral huso México).
 */
export interface DailyStatsRow {
  day: string
  statistics: OverviewStatistics
}

export interface OverviewResponse {
  statistics: OverviewStatistics
  period: {
    startDay: string
    endDay: string
    /**
     * Conteo de registros empleado-día evaluables en el período (no días calendario).
     * Igual a `statistics.totalAvailable`. Para 50 empleados en 7 días puede llegar a 350.
     */
    evaluableDays: number
  }
  /**
   * Desglose día por día. Incluye TODOS los días del rango [startDay, endDay]
   * inclusive, ordenados ascendente. Un día sin registros evaluables aparece con
   * totalAvailable=0 (puede traer informativos como holidays/vacations > 0).
   */
  daily: DailyStatsRow[]
}

export interface DepartmentInfo {
  departmentId: number
  departmentName: string
}

export interface DepartmentRow {
  department: DepartmentInfo
  statistics: AttendanceStatistics
}

/** Referencia mínima a una entidad relacionada del empleado (id + nombre). */
export interface DepartmentRef {
  departmentId: number
  departmentName: string | null
}

export interface PositionRef {
  positionId: number
  positionName: string | null
}

export interface BusinessUnitRef {
  businessUnitId: number
  businessUnitName: string | null
}

export interface EmployeeInfo {
  employeeId: number
  employeeCode: string | null
  employeePayrollCode: string | null
  employeeFirstName: string | null
  employeeLastName: string | null
  employeeSecondLastName: string | null
  employeePhoto: string | null
  // IDs planos (compatibilidad con consumidores existentes del frontend).
  departmentId: number | null
  positionId: number | null
  businessUnitId: number
  payrollBusinessUnitId: number
  /** Sucursal base activa (employee_branch_offices). Aditivo; opcional para consumidores legacy. */
  branchOfficeId?: number | null
  branchOfficeName?: string | null
  // Objetos anidados con el nombre resuelto vía join. `null` cuando el empleado
  // no tiene la relación asignada (department/position pueden faltar).
  department: DepartmentRef | null
  position: PositionRef | null
  businessUnit: BusinessUnitRef | null
}

export interface EmployeeRow {
  employee: EmployeeInfo
  statistics: AttendanceStatistics
}

export interface ResolvedScope {
  allowedBusinessUnitIds: number[]
}

/** Thresholds de tolerancia (cargados desde SystemSetting → Tolerance). */
export interface ToleranceThresholds {
  delayMinutes: number
  faultMinutes: number
}

/**
 * Bundle por empleado: identidad + calendario computado en memoria
 * (output crudo de `syncAssistsService.index`).
 */
export interface EmployeeCalendarBundle {
  employee: EmployeeInfo
  departmentName: string | null
  calendar: AssistDayInterface[]
}

/** Filtros del endpoint coverage (empresa contratante obligatoria). */
export interface CoverageFilters extends AttendanceStatsFilters {
  companyId: number
}

export type CoverageShiftStatus = 'green' | 'amber' | 'red' | 'no_quota'

export type CoverageCandidateSource = 'rest_same_site' | 'loan_other_site'

export interface CoverageCandidate {
  employeeId: number
  name: string
  source: CoverageCandidateSource
  originLeftBelowMin: boolean
  /** Sitio de origen del candidato (préstamo o descanso en sitio). */
  originBranchOfficeId?: number | null
}

export interface CoverageShift {
  shiftId: number
  label: string
  required: number
  min: number
  assigned: number
  present: number
  missing: number
  status: CoverageShiftStatus
  candidates: CoverageCandidate[]
}

export interface CoverageSite {
  branchOfficeId: number
  name: string
  shifts: CoverageShift[]
}

export interface CoverageResponse {
  day: string
  sites: CoverageSite[]
}

/** Sitio de servicio ligado a empresa contratante. */
export interface CoverageSiteRef {
  branchOfficeId: number
  branchOfficeName: string
}

/** Cuota de turno por sucursal (lectura bulk). */
export interface CoverageShiftQuotaRow {
  branchOfficeId: number
  shiftId: number
  shiftName: string
  required: number
  minimum: number
}

/** Préstamo temporal vigente en una fecha. */
export interface CoverageActiveLoanRow {
  employeeId: number
  sourceBranchId: number
  targetBranchId: number
}
