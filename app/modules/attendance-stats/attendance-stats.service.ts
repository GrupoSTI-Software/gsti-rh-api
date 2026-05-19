import { I18n } from '@adonisjs/i18n'
import { DateTime } from 'luxon'
import env from '#start/env'
import BusinessUnit from '#models/business_unit'
import SystemSetting from '#models/system_setting'
import User from '#models/user'
import AttendanceStatsRepositoryMysql from './attendance-stats.repository.mysql.js'
import type { AttendanceStatsRepository } from './attendance-stats.repository.js'
import type {
  AttendanceStatistics,
  AttendanceStatsFilters,
  CleanCounters,
  DepartmentBundle,
  DepartmentRow,
  EmployeeBundle,
  EmployeeRow,
  InformationalCounters,
  OverviewResponse,
  PermissionDayRow,
  ResolvedScope,
  ToleranceThresholds,
} from './dto/attendance-stats.dto.js'

export interface ServiceResult<T> {
  status: number
  type: 'success' | 'warning' | 'error'
  title: string
  message: string
  key?: string
  data: T | null
}

/**
 * Defaults usados cuando no hay tolerancias configuradas en SystemSetting.
 * Replica los defaults de sync_assists_service.ts:1049-1050 para mantener paridad.
 */
const DEFAULT_TOLERANCE_DELAY_MINUTES = 10
const DEFAULT_TOLERANCE_FAULT_MINUTES = 30

/**
 * Lógica de negocio del módulo attendance-stats.
 *
 * Orquesta:
 * - Resolución de scope multitenant (deny-by-default).
 * - Validación de rango temporal.
 * - Agregación delegada al repositorio (clean + informational + permission days).
 * - Recomputación TS del status para días con late-arrival/early-departure
 *   contra la hora autorizada del permiso, reusando la lógica de tolerancia
 *   del sistema de sincronización de asistencias.
 * - Cierre 100% (faults absorbe el residuo de redondeo, earlyOut independiente).
 */
export default class AttendanceStatsService {
  private t: (key: string, params?: { [k: string]: string | number }) => string
  private repo: AttendanceStatsRepository

  constructor(i18n: I18n, repo?: AttendanceStatsRepository) {
    this.t = i18n.formatMessage.bind(i18n)
    this.repo = repo ?? new AttendanceStatsRepositoryMysql()
  }

  /**
   * Resuelve los business unit IDs que el usuario puede consultar.
   * - userBusinessAccess es un CSV de slugs (ej: "sae,cima").
   * - El resultado se intersecta SIEMPRE con SYSTEM_BUSINESS (deny-by-default):
   *   si la env var está vacía o no existe ningún slug compartido, el scope es vacío → 403.
   */
  async resolveScope(user: User): Promise<ResolvedScope> {
    const userSlugs = (user.userBusinessAccess ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    if (userSlugs.length === 0) {
      return { allowedBusinessUnitIds: [] }
    }

    const systemBusiness = `${env.get('SYSTEM_BUSINESS') ?? ''}`
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    // Si SYSTEM_BUSINESS no está configurada, denegamos todo el scope (deny-by-default).
    // Una env var vacía no debe abrir acceso a tenants ajenos — siempre debe configurarse en deploy.
    const effectiveSlugs = userSlugs.filter((s) => systemBusiness.includes(s))

    if (effectiveSlugs.length === 0) {
      return { allowedBusinessUnitIds: [] }
    }

    const units = await BusinessUnit.query()
      .where('business_unit_active', 1)
      .whereIn('business_unit_slug', effectiveSlugs)

    return { allowedBusinessUnitIds: units.map((u) => u.businessUnitId) }
  }

  validateRange(filters: AttendanceStatsFilters): ServiceResult<null> | null {
    if (!filters.startDay || !filters.endDay) {
      return {
        status: 400,
        type: 'error',
        title: this.t('validation_error'),
        message: this.t('attendance_stats_dates_required'),
        key: 'fechas-requeridas',
        data: null,
      }
    }
    // Comparación lexicográfica segura porque el validador garantiza formato yyyy-MM-dd (ISO).
    if (filters.startDay > filters.endDay) {
      return {
        status: 400,
        type: 'error',
        title: this.t('validation_error'),
        message: this.t('attendance_stats_invalid_range'),
        key: 'rango-invalido',
        data: null,
      }
    }
    return null
  }

  async getOverview(
    filters: AttendanceStatsFilters,
    scope: ResolvedScope
  ): Promise<ServiceResult<OverviewResponse>> {
    if (scope.allowedBusinessUnitIds.length === 0) {
      return this.forbidden()
    }

    const [bundle, thresholds] = await Promise.all([
      this.repo.getOverview(filters, scope.allowedBusinessUnitIds),
      this.loadToleranceThresholds(),
    ])

    const permissionCounters = aggregatePermissionDays(bundle.permissionDays, thresholds)
    const finalClean = sumCleanCounters(bundle.clean, permissionCounters)
    const statistics = this.toStatistics(finalClean, bundle.informational)

    return {
      status: 200,
      type: 'success',
      title: this.t('resources'),
      message: this.t('resources_were_found_successfully'),
      data: {
        statistics,
        period: {
          startDay: filters.startDay,
          endDay: filters.endDay,
          evaluableDays: statistics.totalAvailable,
        },
      },
    }
  }

  async getByDepartment(
    filters: AttendanceStatsFilters,
    scope: ResolvedScope
  ): Promise<ServiceResult<DepartmentRow[]>> {
    if (scope.allowedBusinessUnitIds.length === 0) {
      return this.forbidden()
    }

    const [bundle, thresholds] = await Promise.all([
      this.repo.getByDepartment(filters, scope.allowedBusinessUnitIds),
      this.loadToleranceThresholds(),
    ])

    const data = this.buildDepartmentResponse(bundle, thresholds)

    return {
      status: 200,
      type: 'success',
      title: this.t('resources'),
      message: this.t('resources_were_found_successfully'),
      data,
    }
  }

  async getByEmployee(
    filters: AttendanceStatsFilters,
    scope: ResolvedScope
  ): Promise<ServiceResult<EmployeeRow[]>> {
    if (scope.allowedBusinessUnitIds.length === 0) {
      return this.forbidden()
    }

    const [bundle, thresholds] = await Promise.all([
      this.repo.getByEmployee(filters, scope.allowedBusinessUnitIds),
      this.loadToleranceThresholds(),
    ])

    const data = this.buildEmployeeResponse(bundle, thresholds)

    return {
      status: 200,
      type: 'success',
      title: this.t('resources'),
      message: this.t('resources_were_found_successfully'),
      data,
    }
  }

  private buildDepartmentResponse(
    bundle: DepartmentBundle,
    thresholds: ToleranceThresholds
  ): DepartmentRow[] {
    // Agrupar permission days por departmentId.
    const permByDept = new Map<number, PermissionDayRow[]>()
    for (const row of bundle.permissionDays) {
      const id = row.departmentId
      if (id === null) continue
      if (!permByDept.has(id)) permByDept.set(id, [])
      permByDept.get(id)!.push(row)
    }

    // Asegurar que departamentos que SOLO aparecen en permission days también salgan.
    const allDeptIds = new Set<number>()
    for (const g of bundle.groups) allDeptIds.add(g.department.departmentId)
    for (const id of permByDept.keys()) allDeptIds.add(id)

    const groupsById = new Map(bundle.groups.map((g) => [g.department.departmentId, g]))
    const rows: DepartmentRow[] = []

    for (const id of allDeptIds) {
      const group = groupsById.get(id)
      const permDays = permByDept.get(id) ?? []
      const permCounters = aggregatePermissionDays(permDays, thresholds)
      const clean = sumCleanCounters(group?.clean ?? emptyClean(), permCounters)
      const informational = group?.informational ?? emptyInformational()
      const department = group?.department ?? this.deriveDepartmentInfoFromPermissionDays(id, permDays)
      if (!department) continue
      rows.push({
        department,
        statistics: this.toStatistics(clean, informational),
      })
    }

    return rows.sort((a, b) => a.department.departmentName.localeCompare(b.department.departmentName))
  }

  private buildEmployeeResponse(
    bundle: EmployeeBundle,
    thresholds: ToleranceThresholds
  ): EmployeeRow[] {
    const permByEmp = new Map<number, PermissionDayRow[]>()
    for (const row of bundle.permissionDays) {
      if (!permByEmp.has(row.employeeId)) permByEmp.set(row.employeeId, [])
      permByEmp.get(row.employeeId)!.push(row)
    }

    const allEmpIds = new Set<number>()
    for (const g of bundle.groups) allEmpIds.add(g.employee.employeeId)
    for (const id of permByEmp.keys()) allEmpIds.add(id)

    const groupsById = new Map(bundle.groups.map((g) => [g.employee.employeeId, g]))
    const rows: EmployeeRow[] = []

    for (const id of allEmpIds) {
      const group = groupsById.get(id)
      const permDays = permByEmp.get(id) ?? []
      const permCounters = aggregatePermissionDays(permDays, thresholds)
      const clean = sumCleanCounters(group?.clean ?? emptyClean(), permCounters)
      const informational = group?.informational ?? emptyInformational()
      const employee = group?.employee ?? this.deriveEmployeeInfoFromPermissionDays(permDays)
      if (!employee) continue
      rows.push({
        employee,
        statistics: this.toStatistics(clean, informational),
      })
    }

    return rows.sort((a, b) => {
      const fa = a.employee.employeeFirstName ?? ''
      const fb = b.employee.employeeFirstName ?? ''
      if (fa !== fb) return fa.localeCompare(fb)
      return (a.employee.employeeLastName ?? '').localeCompare(b.employee.employeeLastName ?? '')
    })
  }

  private deriveDepartmentInfoFromPermissionDays(id: number, rows: PermissionDayRow[]) {
    const firstWithName = rows.find((r) => r.departmentName !== null)
    if (!firstWithName) return null
    return { departmentId: id, departmentName: String(firstWithName.departmentName) }
  }

  private deriveEmployeeInfoFromPermissionDays(rows: PermissionDayRow[]) {
    const r = rows[0]
    if (!r) return null
    return {
      employeeId: r.employeeId,
      employeeCode: r.employeeCode,
      employeeFirstName: r.employeeFirstName,
      employeeLastName: r.employeeLastName,
      employeeSecondLastName: r.employeeSecondLastName,
      departmentId: r.departmentId,
      positionId: r.positionId,
      businessUnitId: r.businessUnitId,
      payrollBusinessUnitId: r.payrollBusinessUnitId,
    }
  }

  /**
   * Lee los thresholds de tolerancia desde SystemSetting → Tolerance.
   * Si no se encuentran configuradas, usa los mismos defaults que sync_assists_service.
   */
  private async loadToleranceThresholds(): Promise<ToleranceThresholds> {
    const setting = await SystemSetting.query()
      .whereNull('system_setting_deleted_at')
      .where('system_setting_active', 1)
      .preload('systemSettingTolerances')
      .first()

    if (!setting) {
      return {
        delayMinutes: DEFAULT_TOLERANCE_DELAY_MINUTES,
        faultMinutes: DEFAULT_TOLERANCE_FAULT_MINUTES,
      }
    }

    const tolerances = setting.systemSettingTolerances
    const delay = tolerances.find((t) => t.toleranceName === 'Delay')
    const fault = tolerances.find((t) => t.toleranceName === 'Fault')

    return {
      delayMinutes: delay?.toleranceMinutes ?? DEFAULT_TOLERANCE_DELAY_MINUTES,
      faultMinutes: fault?.toleranceMinutes ?? DEFAULT_TOLERANCE_FAULT_MINUTES,
    }
  }

  /**
   * Calcula AttendanceStatistics finales aplicando cierre 100%.
   * - totalAvailable = assists + tolerances + delays + faults (NO incluye earlyOuts).
   * - faultPercentage absorbe el residuo: ontime+tolerance+delay+fault === 100.
   * - earlyOutPercentage es independiente del cierre (se computa sobre check_out_status).
   */
  private toStatistics(c: CleanCounters, info: InformationalCounters): AttendanceStatistics {
    const totalAvailable = c.assists + c.tolerances + c.delays + c.faults
    if (totalAvailable === 0) {
      return {
        assists: 0,
        tolerances: 0,
        delays: 0,
        earlyOuts: c.earlyOuts,
        faults: 0,
        totalAvailable: 0,
        ontimePercentage: 0,
        tolerancePercentage: 0,
        delayPercentage: 0,
        earlyOutPercentage: 0,
        faultPercentage: 0,
        ...info,
      }
    }
    const ontimePercentage = Math.round((c.assists / totalAvailable) * 100)
    const tolerancePercentage = Math.round((c.tolerances / totalAvailable) * 100)
    const delayPercentage = Math.round((c.delays / totalAvailable) * 100)
    const earlyOutPercentage = Math.round((c.earlyOuts / totalAvailable) * 100)
    const faultPercentage = 100 - ontimePercentage - tolerancePercentage - delayPercentage

    return {
      assists: c.assists,
      tolerances: c.tolerances,
      delays: c.delays,
      earlyOuts: c.earlyOuts,
      faults: c.faults,
      totalAvailable,
      ontimePercentage,
      tolerancePercentage,
      delayPercentage,
      earlyOutPercentage,
      faultPercentage,
      ...info,
    }
  }

  private forbidden<T = null>(): ServiceResult<T> {
    return {
      status: 403,
      type: 'error',
      title: this.t('forbidden'),
      message: this.t('attendance_stats_scope_required'),
      key: 'scope-insuficiente',
      data: null,
    }
  }
}

function emptyClean(): CleanCounters {
  return { assists: 0, tolerances: 0, delays: 0, earlyOuts: 0, faults: 0 }
}

function emptyInformational(): InformationalCounters {
  return { justifiedAbsences: 0, vacations: 0, holidays: 0 }
}

function sumCleanCounters(a: CleanCounters, b: CleanCounters): CleanCounters {
  return {
    assists: a.assists + b.assists,
    tolerances: a.tolerances + b.tolerances,
    delays: a.delays + b.delays,
    earlyOuts: a.earlyOuts + b.earlyOuts,
    faults: a.faults + b.faults,
  }
}

/**
 * Recomputa los contadores que aportan los días con permiso `late-arrival`/`early-departure`.
 * - Para check-in: usa la hora autorizada del permiso (si existe) como umbral efectivo,
 *   y aplica la misma lógica de tolerancia que sync_assists_service.checkInStatus().
 * - Para check-out: si hay permiso `early-departure`, el earlyOut solo se cuenta cuando
 *   el empleado salió ANTES de la hora autorizada (más allá del threshold de delay).
 */
export function aggregatePermissionDays(
  rows: PermissionDayRow[],
  thresholds: ToleranceThresholds
): CleanCounters {
  const counters = emptyClean()
  for (const row of rows) {
    const status = computeCheckInStatus(row, thresholds)
    if (status === 'ontime') counters.assists += 1
    else if (status === 'tolerance') counters.tolerances += 1
    else if (status === 'delay') counters.delays += 1
    else if (status === 'fault') counters.faults += 1

    if (isEarlyOutAfterPermission(row, thresholds)) {
      counters.earlyOuts += 1
    }
  }
  return counters
}

/**
 * Recomputa check_in_status para un día con permiso late-arrival.
 * - effectiveTime = late_arrival_check_in_time si existe, sino shift_time_start.
 * - Si no hay punch de entrada → fault (matchea sync_assists_service:1902).
 * - Si no hay shift ni effectiveTime → status almacenado como fallback.
 */
function computeCheckInStatus(
  row: PermissionDayRow,
  thresholds: ToleranceThresholds
): 'ontime' | 'tolerance' | 'delay' | 'fault' | null {
  const effectiveTime = row.lateArrivalCheckInTime ?? row.shiftTimeStart
  if (!effectiveTime) {
    return mapStoredStatus(row.storedCheckInStatus)
  }
  if (!row.checkInPunchUtc) {
    return 'fault'
  }
  const minutesLate = minutesLateAgainst(row.day, effectiveTime, row.checkInPunchUtc)
  if (minutesLate === null) {
    return mapStoredStatus(row.storedCheckInStatus)
  }
  if (minutesLate > thresholds.faultMinutes) return 'fault'
  if (minutesLate > thresholds.delayMinutes) return 'delay'
  if (minutesLate <= 0) return 'ontime'
  return 'tolerance'
}

/**
 * Para días con permiso early-departure: cuenta earlyOut solo si el empleado salió
 * más de `delayMinutes` ANTES de la hora autorizada por el permiso (o del fin de turno).
 * Sin punch de salida o sin shift → cuenta como earlyOut si el status almacenado lo dice
 * (defensivo, para no perder señal).
 */
function isEarlyOutAfterPermission(
  row: PermissionDayRow,
  thresholds: ToleranceThresholds
): boolean {
  const expectedCheckOut = row.earlyDepartureCheckOutTime ?? deriveShiftEnd(row)
  if (!expectedCheckOut || !row.checkOutPunchUtc) {
    return row.storedCheckOutStatus === 'delay' && row.earlyDepartureCheckOutTime === null
  }
  const minutesEarly = minutesEarlyAgainst(row.day, expectedCheckOut, row.checkOutPunchUtc)
  if (minutesEarly === null) {
    return row.storedCheckOutStatus === 'delay' && row.earlyDepartureCheckOutTime === null
  }
  return minutesEarly > thresholds.delayMinutes
}

function deriveShiftEnd(row: PermissionDayRow): string | null {
  if (!row.shiftTimeStart || row.shiftActiveHours === null) return null
  const start = DateTime.fromISO(`${row.day}T${row.shiftTimeStart}`, { zone: 'UTC-6' })
  if (!start.isValid) return null
  const end = start.plus({ hours: row.shiftActiveHours })
  return end.toFormat('HH:mm:ss')
}

/**
 * Diferencia en minutos entre el punch real (UTC) y la hora efectiva de entrada (local UTC-6).
 * Positivo = llegó tarde. Negativo o cero = ontime.
 */
function minutesLateAgainst(
  day: string,
  effectiveTime: string,
  punchUtc: string
): number | null {
  const expected = DateTime.fromISO(`${day}T${effectiveTime}`, { zone: 'UTC-6' })
  const actual = DateTime.fromISO(punchUtc, { setZone: true }).setZone('UTC-6')
  if (!expected.isValid || !actual.isValid) return null
  return actual.diff(expected, 'minutes').minutes
}

/**
 * Diferencia en minutos entre la hora esperada de salida (local UTC-6) y el punch real (UTC).
 * Positivo = salió antes (earlyOut). Negativo o cero = salió a tiempo o tarde.
 */
function minutesEarlyAgainst(
  day: string,
  expectedTime: string,
  punchUtc: string
): number | null {
  const expected = DateTime.fromISO(`${day}T${expectedTime}`, { zone: 'UTC-6' })
  const actual = DateTime.fromISO(punchUtc, { setZone: true }).setZone('UTC-6')
  if (!expected.isValid || !actual.isValid) return null
  return expected.diff(actual, 'minutes').minutes
}

function mapStoredStatus(stored: string | null): 'ontime' | 'tolerance' | 'delay' | 'fault' | null {
  if (stored === 'ontime' || stored === 'tolerance' || stored === 'delay' || stored === 'fault') {
    return stored
  }
  return null
}
