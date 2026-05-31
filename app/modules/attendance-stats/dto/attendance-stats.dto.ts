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
