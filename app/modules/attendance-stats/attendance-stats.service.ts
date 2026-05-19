import { I18n } from '@adonisjs/i18n'
import { DateTime } from 'luxon'
import env from '#start/env'
import BusinessUnit from '#models/business_unit'
import SystemSetting from '#models/system_setting'
import User from '#models/user'
import AttendanceStatsRepositoryMysql from './attendance-stats.repository.mysql.js'
import type { AssistDayInterface } from '../../interfaces/assist_day_interface.js'
import type { ShiftExceptionInterface } from '../../interfaces/shift_exception_interface.js'
import type { AttendanceStatsRepository } from './attendance-stats.repository.js'
import type {
  AttendanceStatistics,
  AttendanceStatsFilters,
  CleanCounters,
  DepartmentRow,
  EmployeeRow,
  InformationalCounters,
  OverviewResponse,
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
 * Fuente de verdad: tabla `assists` (vía syncAssistsService.index del repo).
 * Por empleado-día computado, este servicio:
 * 1. Aplica el filtro evaluable (rest day, vacation, holiday, work disability,
 *    excepciones no-generales).
 * 2. Recompute el check_in_status contra la hora autorizada por permiso
 *    `late-arrival` cuando aplica.
 * 3. Decide si earlyOut cuenta considerando permisos `early-departure`.
 * 4. Suma a counters limpios + counters informativos.
 * 5. Calcula porcentajes con cierre 100% (faults absorbe residuo de redondeo).
 */
export default class AttendanceStatsService {
  private t: (key: string, params?: { [k: string]: string | number }) => string
  private repo: AttendanceStatsRepository

  constructor(i18n: I18n, repo?: AttendanceStatsRepository) {
    this.t = i18n.formatMessage.bind(i18n)
    this.repo = repo ?? new AttendanceStatsRepositoryMysql(i18n)
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

    const [bundles, thresholds] = await Promise.all([
      this.repo.getEmployeeCalendars(filters, scope.allowedBusinessUnitIds),
      this.loadToleranceThresholds(),
    ])

    const totalClean = emptyClean()
    const totalInfo = emptyInformational()
    for (const bundle of bundles) {
      const { clean, informational } = aggregateCalendar(bundle.calendar, thresholds)
      addClean(totalClean, clean)
      addInformational(totalInfo, informational)
    }

    const statistics = this.toStatistics(totalClean, totalInfo)

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

    const [bundles, thresholds] = await Promise.all([
      this.repo.getEmployeeCalendars(filters, scope.allowedBusinessUnitIds),
      this.loadToleranceThresholds(),
    ])

    const byDept = new Map<
      number,
      { name: string; clean: CleanCounters; informational: InformationalCounters }
    >()

    for (const bundle of bundles) {
      const deptId = bundle.employee.departmentId
      if (deptId === null) continue
      const { clean, informational } = aggregateCalendar(bundle.calendar, thresholds)
      const existing = byDept.get(deptId)
      if (existing) {
        addClean(existing.clean, clean)
        addInformational(existing.informational, informational)
      } else {
        byDept.set(deptId, {
          name: bundle.departmentName ?? '',
          clean,
          informational,
        })
      }
    }

    const data: DepartmentRow[] = Array.from(byDept.entries())
      .map(([deptId, agg]) => ({
        department: { departmentId: deptId, departmentName: agg.name },
        statistics: this.toStatistics(agg.clean, agg.informational),
      }))
      .sort((a, b) => a.department.departmentName.localeCompare(b.department.departmentName))

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

    const [bundles, thresholds] = await Promise.all([
      this.repo.getEmployeeCalendars(filters, scope.allowedBusinessUnitIds),
      this.loadToleranceThresholds(),
    ])

    const data: EmployeeRow[] = bundles.map((bundle) => {
      const { clean, informational } = aggregateCalendar(bundle.calendar, thresholds)
      return {
        employee: bundle.employee,
        statistics: this.toStatistics(clean, informational),
      }
    })

    return {
      status: 200,
      type: 'success',
      title: this.t('resources'),
      message: this.t('resources_were_found_successfully'),
      data,
    }
  }

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
   * Cierre 100%: ontime + tolerance + delay + fault === 100. El residuo de
   * redondeo lo absorbe el bucket con MAYOR count (no siempre fault — si faults=0
   * y el residuo es negativo, daría un porcentaje negativo). earlyOutPercentage
   * es independiente. Si totalAvailable=0, todos los % son 0.
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
    let ontimePercentage = Math.round((c.assists / totalAvailable) * 100)
    let tolerancePercentage = Math.round((c.tolerances / totalAvailable) * 100)
    let delayPercentage = Math.round((c.delays / totalAvailable) * 100)
    let faultPercentage = Math.round((c.faults / totalAvailable) * 100)
    const earlyOutPercentage = Math.round((c.earlyOuts / totalAvailable) * 100)

    // Cierre: el residuo de redondeo (típicamente ±1-2) lo absorbe el bucket con
    // mayor count. Garantiza suma === 100 sin producir porcentajes negativos.
    const residual = 100 - ontimePercentage - tolerancePercentage - delayPercentage - faultPercentage
    const maxCount = Math.max(c.assists, c.tolerances, c.delays, c.faults)
    if (c.assists === maxCount) ontimePercentage += residual
    else if (c.tolerances === maxCount) tolerancePercentage += residual
    else if (c.delays === maxCount) delayPercentage += residual
    else faultPercentage += residual

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

function addClean(dst: CleanCounters, src: CleanCounters): void {
  dst.assists += src.assists
  dst.tolerances += src.tolerances
  dst.delays += src.delays
  dst.earlyOuts += src.earlyOuts
  dst.faults += src.faults
}

function addInformational(dst: InformationalCounters, src: InformationalCounters): void {
  dst.justifiedAbsences += src.justifiedAbsences
  dst.vacations += src.vacations
  dst.holidays += src.holidays
}

/**
 * Recorre el calendario en-memoria de UN empleado y produce sus counters.
 * - Aplica el filtro evaluable (rest, vacation, holiday, work disability, excepciones no-generales).
 * - Para días con permiso late-arrival, recompute check_in_status contra la hora autorizada.
 * - Para días con permiso early-departure, neutraliza el earlyOut si la salida fue posterior a la hora autorizada.
 * - Suma a contadores informativos (vacaciones, festivos, faltas justificadas) en paralelo.
 */
export function aggregateCalendar(
  calendar: AssistDayInterface[],
  thresholds: ToleranceThresholds
): { clean: CleanCounters; informational: InformationalCounters } {
  const clean = emptyClean()
  const info = emptyInformational()

  for (const day of calendar) {
    // Contadores informativos (independientes del cierre 100%).
    if (day.assist.isVacationDate) info.vacations += 1
    if (day.assist.isHoliday) info.holidays += 1
    if (hasJustifiedAbsenceException(day.assist.exceptions)) info.justifiedAbsences += 1

    // Filtro evaluable.
    if (!isEvaluableDay(day)) continue

    const lateArrival = findException(day.assist.exceptions, 'late-arrival')
    const earlyDeparture = findException(day.assist.exceptions, 'early-departure')

    // Recompute check_in_status si hay permiso de llegada tarde.
    const effectiveStatus = lateArrival
      ? computeCheckInStatusWithPermission(day, lateArrival, thresholds)
      : mapStoredStatus(day.assist.checkInStatus)

    if (effectiveStatus === 'ontime') clean.assists += 1
    else if (effectiveStatus === 'tolerance') clean.tolerances += 1
    else if (effectiveStatus === 'delay') clean.delays += 1
    else if (effectiveStatus === 'fault') clean.faults += 1

    // earlyOut: solo cuenta si check_out_status='delay' Y no hay permiso que lo neutralice.
    if (day.assist.checkOutStatus === 'delay') {
      if (!earlyDeparture || isStillEarlyAfterPermission(day, earlyDeparture, thresholds)) {
        clean.earlyOuts += 1
      }
    }
  }

  return { clean, informational: info }
}

function isEvaluableDay(day: AssistDayInterface): boolean {
  if (day.assist.isFutureDay) return false
  if (day.assist.isRestDay) return false
  if (day.assist.isVacationDate) return false
  if (day.assist.isHoliday) return false
  if (day.assist.isWorkDisabilityDate) return false
  if (hasNonGeneralException(day.assist.exceptions)) return false
  return true
}

function hasNonGeneralException(exceptions: ShiftExceptionInterface[]): boolean {
  return exceptions.some(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e) => (e.exceptionType as any)?.exceptionTypeIsGeneral === 0
  )
}

function hasJustifiedAbsenceException(exceptions: ShiftExceptionInterface[]): boolean {
  return exceptions.some((e) => {
    const slug = e.exceptionType?.exceptionTypeSlug
    return slug === 'absence-from-work' || slug === 'nuevo-ingreso'
  })
}

function findException(
  exceptions: ShiftExceptionInterface[],
  slug: 'late-arrival' | 'early-departure'
): ShiftExceptionInterface | undefined {
  return exceptions.find((e) => e.exceptionType?.exceptionTypeSlug === slug)
}

function mapStoredStatus(stored: string | null | undefined): 'ontime' | 'tolerance' | 'delay' | 'fault' | null {
  if (stored === 'ontime' || stored === 'tolerance' || stored === 'delay' || stored === 'fault') {
    return stored
  }
  return null
}

/**
 * Recomputa check_in_status contra la hora autorizada por el permiso late-arrival.
 * Replica la lógica de sync_assists_service.ts:1932-1965.
 */
function computeCheckInStatusWithPermission(
  day: AssistDayInterface,
  lateArrival: ShiftExceptionInterface,
  thresholds: ToleranceThresholds
): 'ontime' | 'tolerance' | 'delay' | 'fault' | null {
  const punch = day.assist.checkIn?.assistPunchTimeUtc
  if (!punch) return 'fault'

  const authorizedTime = lateArrival.shiftExceptionCheckInTime
  if (!authorizedTime) return mapStoredStatus(day.assist.checkInStatus)

  const minutes = minutesLateAgainst(day.day, String(authorizedTime), String(punch))
  if (minutes === null) return mapStoredStatus(day.assist.checkInStatus)

  if (minutes > thresholds.faultMinutes) return 'fault'
  if (minutes > thresholds.delayMinutes) return 'delay'
  if (minutes <= 0) return 'ontime'
  return 'tolerance'
}

/**
 * Cuando hay permiso early-departure: cuenta como earlyOut solo si la salida real
 * fue ANTES de la hora autorizada por más de `delayMinutes`.
 */
function isStillEarlyAfterPermission(
  day: AssistDayInterface,
  earlyDeparture: ShiftExceptionInterface,
  thresholds: ToleranceThresholds
): boolean {
  const punch = day.assist.checkOut?.assistPunchTimeUtc
  if (!punch) return false

  const authorizedTime = earlyDeparture.shiftExceptionCheckOutTime
  if (!authorizedTime) return true

  const minutesEarly = minutesEarlyAgainst(day.day, String(authorizedTime), String(punch))
  if (minutesEarly === null) return true
  return minutesEarly > thresholds.delayMinutes
}

function minutesLateAgainst(day: string, hhmmss: string, punchUtc: string): number | null {
  const expected = DateTime.fromISO(`${day}T${hhmmss}`, { zone: 'UTC-6' })
  const actual = DateTime.fromISO(punchUtc, { setZone: true }).setZone('UTC-6')
  if (!expected.isValid || !actual.isValid) return null
  return actual.diff(expected, 'minutes').minutes
}

function minutesEarlyAgainst(day: string, hhmmss: string, punchUtc: string): number | null {
  const expected = DateTime.fromISO(`${day}T${hhmmss}`, { zone: 'UTC-6' })
  const actual = DateTime.fromISO(punchUtc, { setZone: true }).setZone('UTC-6')
  if (!expected.isValid || !actual.isValid) return null
  return expected.diff(actual, 'minutes').minutes
}
