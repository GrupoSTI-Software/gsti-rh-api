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

/** Valores aceptados por el query `granularity` del overview. */
export const ATTENDANCE_STATS_GRANULARITIES = ['day', 'month'] as const

/**
 * Serie que acompaña al overview: `day` solo trae `daily`; `month` agrega
 * además `monthly` (modo anual del monitor).
 */
export type AttendanceStatsGranularity = (typeof ATTENDANCE_STATS_GRANULARITIES)[number]

export interface AttendanceStatsFilters {
  startDay: string
  endDay: string
  departmentIds?: number[]
  employeeIds?: number[]
  businessUnitId?: number
  payrollBusinessUnitId?: number
  branchOfficeIds?: number[]
  /** Solo lo lee overview; by-department y by-employee lo ignoran. Default `day`. */
  granularity?: AttendanceStatsGranularity
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
 * Estadísticas con conteo de empleados evaluados. Las usan `overview` y
 * `by-department`; `by-employee` conserva `AttendanceStatistics` sin este
 * campo, porque ahí cada fila ya ES un empleado.
 */
export interface OverviewStatistics extends AttendanceStatistics {
  /**
   * Cantidad de empleados evaluados: los que tienen al menos un día evaluable
   * (excluye descanso, vacaciones, festivos, incapacidad, día futuro y
   * excepciones no-generales). En `statistics` global se cuenta sobre todo el
   * período; en `daily[].statistics` solo los empleados con día evaluable en
   * esa fecha, y en `monthly[].statistics` los que tienen al menos un día
   * evaluable en ese mes.
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

/**
 * Estadísticas de UN mes calendario del período (modo anual del monitor),
 * agregadas sobre todos los empleados del scope. `month` en formato yyyy-MM.
 */
export interface MonthlyStatsRow {
  month: string
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
  /**
   * Solo con `granularity=month`: una entrada por cada mes calendario del rango
   * [startDay, endDay] inclusive, ordenadas ascendente. Un mes sin registros
   * aparece en cero. Sin el parámetro o con `day` la propiedad no viene.
   */
  monthly?: MonthlyStatsRow[]
}

export interface DepartmentInfo {
  departmentId: number
  departmentName: string
}

export interface DepartmentRow {
  department: DepartmentInfo
  /**
   * Incluye `employeesQty` con el mismo criterio que el overview (empleados
   * con al menos un día evaluable en el período), para que la suma por
   * departamento sea comparable con el total de la pantalla.
   */
  statistics: OverviewStatistics
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
  /** Alias del departamento y del puesto; las ausencias los prefieren al nombre. Aditivos. */
  departmentAlias?: string | null
  positionAlias?: string | null
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

/**
 * Filtros del endpoint coverage (empresa contratante obligatoria).
 *
 * El parámetro se llama `empresaContratanteId` y no `companyId`: el middleware
 * `businessScope` reserva `companyId` como alias legacy de unidad de negocio y
 * respondería 404 antes de llegar al controller.
 */
export interface CoverageFilters extends AttendanceStatsFilters {
  empresaContratanteId: number
}

export type CoverageShiftStatus = 'green' | 'amber' | 'red' | 'no_quota'

export type CoverageCandidateSource = 'rest_same_site' | 'loan_other_site'

export type CoverageLoanDecisionState =
  | 'can_create'
  | 'must_cancel_active'
  | 'not_applicable'

export interface CoverageLoanDecision {
  /** Decisión de acción para UI del flujo de préstamo. */
  state: CoverageLoanDecisionState
  /** ID del préstamo activo cuando la acción requerida es cancelarlo primero. */
  activeAssignmentId?: number | null
}

export interface CoverageCandidate {
  employeeId: number
  name: string
  source: CoverageCandidateSource
  originLeftBelowMin: boolean
  /** Sitio de origen del candidato (préstamo o descanso en sitio). */
  originBranchOfficeId?: number | null
  /** Nombre del sitio de origen (evita catálogo extra en el BO). */
  originBranchOfficeName?: string | null
  /** Metadatos mínimos para decidir si se puede crear préstamo desde cobertura. */
  loanDecision: CoverageLoanDecision
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
  assignmentId: number
  employeeId: number
  sourceBranchId: number
  targetBranchId: number
  destinationShiftId?: number | null
  reason?: string | null
}

/**
 * Préstamo temporal que intersecta un rango, con sus fechas en yyyy-MM-dd para
 * resolver en memoria si mueve al colaborador un día concreto.
 */
export interface CoverageRangeLoanRow extends CoverageActiveLoanRow {
  startDate: string
  endDate: string
  /** Fecha de cancelación; desde ese día el préstamo deja de mover al colaborador. */
  cancelledAt: string | null
}

/**
 * Filtros del endpoint absences: periodo y, de forma opcional, las sucursales
 * que acotan el universo y la unidad de negocio de nómina.
 */
export interface AbsencesFilters {
  startDay: string
  endDay: string
  /**
   * Acota el universo a quienes tienen base activa en estas sucursales o un
   * préstamo hacia ellas en el periodo. No filtra las entradas: sus faltas
   * salen con la sucursal efectiva de cada día.
   */
  branchOfficeIds?: number[]
  payrollBusinessUnitId?: number
}

/**
 * Sucursal viva del tenant tal como la lee el repositorio, con la empresa
 * contratante del join todavía sin filtrar (`toAbsencesBranch` decide si se expone).
 */
export interface AbsencesBranchRow {
  branchOfficeId: number
  name: string
  /** `null` si la sucursal no apunta a ninguna empresa contratante existente. */
  empresaContratante: {
    empresaContratanteId: number
    razonSocial: string
    businessUnitId: number
    isDeleted: boolean
  } | null
}

/** Sucursal referenciada por alguna entrada de ausencias. */
export interface AbsencesBranch {
  branchOfficeId: number
  name: string
  /** Solo si la empresa contratante está viva y es del tenant; si no, `null`. */
  empresaContratanteId: number | null
  empresaContratanteName: string | null
}

/** Colaborador que aparece en alguna entrada de ausencias. */
export interface AbsencesEmployee {
  employeeId: number
  firstName: string
  lastName: string | null
  secondLastName: string | null
  photo: string | null
  /** Alias del puesto si lo tiene; si no, su nombre. */
  positionName: string | null
  departmentId: number | null
  /** Alias del departamento si lo tiene; si no, su nombre. */
  departmentName: string | null
}

/** Falta de un colaborador en un día, con su sucursal efectiva. */
export interface AbsencesEntry {
  employeeId: number
  /** Sucursal efectiva del día; `null` si no tiene base ni préstamo vigente. */
  branchOfficeId: number | null
}

/** Faltas de un día del periodo. */
export interface AbsencesDay {
  day: string
  /** Ordenadas por nombre completo del colaborador y, empatando, por id. */
  entries: AbsencesEntry[]
}

/** Respuesta de absences. */
export interface AbsencesResponse {
  period: { startDay: string; endDay: string }
  /** Solo las sucursales referenciadas por alguna entrada. */
  branches: AbsencesBranch[]
  /** Cada colaborador que aparece en `days`, una sola vez. */
  employees: AbsencesEmployee[]
  /** Todos los días del periodo en orden ascendente, incluso los que no tienen faltas. */
  days: AbsencesDay[]
}
