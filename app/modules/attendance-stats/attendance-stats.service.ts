import { I18n } from '@adonisjs/i18n'
import { DateTime } from 'luxon'
import { resolveEmployeeRoleScope } from '../../helpers/resolve_employee_role_scope.js'
import type { EmployeeRoleScope } from '../../helpers/resolve_employee_role_scope.js'
import AttendanceStatsRepositoryMysql from './attendance-stats.repository.mysql.js'
import { hasShiftCoverageAccess } from './attendance-stats.permissions.js'
import {
  ABSENCES_MAX_RANGE_DAYS,
  buildAbsencesResponse,
  collectCandidateBranchIds,
  countRangeDaysInclusive,
} from './attendance-stats.absences.js'
import {
  addClean,
  addInformational,
  aggregateCalendar,
  classifyDay,
  emptyClean,
  emptyInformational,
  enumerateDays,
  isEvaluableDay,
  toOverviewStatistics,
  toStatistics,
} from './attendance-stats.rules.js'
import type { AttendanceStatsRepository } from './attendance-stats.repository.js'
import SystemSettingService from '#services/system_setting_service'
import type {
  AbsencesFilters,
  AbsencesResponse,
  AttendanceStatsFilters,
  AttendanceStatsGranularity,
  AttendanceStatsViewer,
  CleanCounters,
  DailyStatsRow,
  DepartmentRow,
  EmployeeCalendarBundle,
  EmployeeRow,
  InformationalCounters,
  OverviewResponse,
  OverviewStatistics,
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
 * Colaboradores del service que consultan la BD por fuera del repositorio.
 * Producción usa las implementaciones reales; las pruebas pasan dobles para
 * ejercitar la orquestación sin BD.
 */
export interface AttendanceStatsServiceDependencies {
  /** Alcance de colaboradores del usuario; `null` si el usuario ya no existe. */
  resolveEmployeeRoleScope: (userId: number, i18n: I18n) => Promise<EmployeeRoleScope | null>
  /** Tolerancias de retardo y falta vigentes. */
  loadToleranceThresholds: () => Promise<ToleranceThresholds>
  /** Si el rol tiene `shift-coverage` del monitor (root y owner pasan). */
  hasShiftCoverageAccess: (roleId: number) => Promise<boolean>
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
 *
 * Las reglas de los pasos 1 a 5 viven en `attendance-stats.rules.ts`.
 */
export default class AttendanceStatsService {
  private t: (key: string, params?: { [k: string]: string | number }) => string
  private i18n: I18n
  private repo: AttendanceStatsRepository
  private dependencies: AttendanceStatsServiceDependencies

  /**
   * @param repo - Repositorio de lectura; por defecto el de MySQL.
   * @param dependencies - Sustitutos de las consultas que no pasan por el
   *   repositorio; lo que no se indique usa la implementación real.
   */
  constructor(
    i18n: I18n,
    repo?: AttendanceStatsRepository,
    dependencies: Partial<AttendanceStatsServiceDependencies> = {}
  ) {
    this.t = i18n.formatMessage.bind(i18n)
    this.i18n = i18n
    this.repo = repo ?? new AttendanceStatsRepositoryMysql(i18n)
    this.dependencies = {
      resolveEmployeeRoleScope: dependencies.resolveEmployeeRoleScope ?? resolveEmployeeRoleScope,
      loadToleranceThresholds:
        dependencies.loadToleranceThresholds ?? loadToleranceThresholdsFromSettings,
      hasShiftCoverageAccess: dependencies.hasShiftCoverageAccess ?? hasShiftCoverageAccess,
    }
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

  /**
   * Colaboradores de `bundles` que el usuario puede ver, con la regla del
   * listado de empleados: sin acceso completo a la plantilla, solo los que
   * tiene a cargo y él mismo; con acceso completo, los de los departamentos
   * visibles para su rol. Si el usuario ya no existe, nadie (fail-closed).
   */
  private async resolveVisibleEmployeeIds(
    userId: number,
    bundles: EmployeeCalendarBundle[],
    allowedBusinessUnitIds: number[]
  ): Promise<Set<number>> {
    const roleScope = await this.dependencies.resolveEmployeeRoleScope(userId, this.i18n)
    if (!roleScope) return new Set()

    if (roleScope.userResponsibleId !== null) {
      const responsibleIds = await this.repo.getEmployeeIdsInResponsibleScope(
        roleScope.userResponsibleId,
        bundles.map((bundle) => bundle.employee.employeeId),
        allowedBusinessUnitIds
      )
      return new Set(responsibleIds)
    }

    const visibleDepartments = new Set(roleScope.departmentsList)
    return new Set(
      bundles
        .filter(
          (bundle) =>
            bundle.employee.departmentId !== null &&
            visibleDepartments.has(bundle.employee.departmentId)
        )
        .map((bundle) => bundle.employee.employeeId)
    )
  }

  /**
   * Ausencias día por día del periodo (máximo `ABSENCES_MAX_RANGE_DAYS` días
   * inclusive) con la sucursal efectiva y la empresa contratante de cada falta.
   * Es el motor único de las vistas Organigrama, Sucursales y Clientes REPSE.
   *
   * El universo es la plantilla del tenant (acotada por `branchOfficeIds` si
   * viene); con universo vacío no se corre el SQL de calendarios. Días,
   * empleados y sucursales se recortan a los colaboradores que el usuario puede
   * ver, antes de contar.
   *
   * La empresa contratante de las sucursales solo se expone si el rol tiene
   * `shift-coverage`; sin él va `null` en todas, con la misma forma de `data`.
   * No responde 403 por permiso.
   *
   * @param viewer - Usuario que consulta: `userId` define el alcance de
   *   colaboradores y `roleId` el permiso `shift-coverage`.
   */
  async getAbsences(
    filters: AbsencesFilters,
    scope: ResolvedScope,
    viewer: AttendanceStatsViewer
  ): Promise<ServiceResult<AbsencesResponse>> {
    if (scope.allowedBusinessUnitIds.length === 0) {
      return this.forbidden()
    }

    const rangeError = this.validateAbsencesRange<AbsencesResponse>(filters)
    if (rangeError) return rangeError

    const { startDay, endDay } = filters
    const allowedBusinessUnitIds = scope.allowedBusinessUnitIds
    const employeeIds = await this.repo.getAbsencesEmployeeIds(
      startDay,
      endDay,
      allowedBusinessUnitIds,
      filters.branchOfficeIds
    )

    if (employeeIds.length === 0) {
      // Sin colaboradores posibles no se corre el SQL de calendarios: todos los días vacíos.
      return this.found(
        buildAbsencesResponse({
          startDay,
          endDay,
          branches: [],
          loans: [],
          bundles: [],
          visibleEmployeeIds: new Set(),
          // Sin sucursales no hay empresa que mostrar: no se consulta el permiso.
          canSeeContractingCompany: false,
          thresholds: {
            delayMinutes: DEFAULT_TOLERANCE_DELAY_MINUTES,
            faultMinutes: DEFAULT_TOLERANCE_FAULT_MINUTES,
          },
        })
      )
    }

    const [bundles, loans, thresholds] = await Promise.all([
      this.repo.getEmployeeCalendars(
        {
          startDay,
          endDay,
          employeeIds,
          payrollBusinessUnitId: filters.payrollBusinessUnitId,
        },
        allowedBusinessUnitIds
      ),
      this.repo.getLoansForRange(employeeIds, startDay, endDay, allowedBusinessUnitIds),
      this.dependencies.loadToleranceThresholds(),
    ])
    const [visibleEmployeeIds, branches, canSeeContractingCompany] = await Promise.all([
      this.resolveVisibleEmployeeIds(viewer.userId, bundles, allowedBusinessUnitIds),
      this.repo.getAbsencesBranches(
        collectCandidateBranchIds(bundles, loans),
        allowedBusinessUnitIds
      ),
      this.dependencies.hasShiftCoverageAccess(viewer.roleId),
    ])

    return this.found(
      buildAbsencesResponse({
        startDay,
        endDay,
        branches,
        loans,
        bundles,
        visibleEmployeeIds,
        canSeeContractingCompany,
        thresholds,
      })
    )
  }

  /**
   * Fechas existentes, rango ordenado y tope de días de absences. Devuelve el
   * error a responder o `null` si el periodo es válido.
   *
   * Por HTTP el validador ya rechaza una fecha inexistente con `details`; esta
   * revisión queda como guarda para quien llame al service directo.
   */
  private validateAbsencesRange<T>(filters: AbsencesFilters): ServiceResult<T> | null {
    const rangeDays = countRangeDaysInclusive(filters.startDay, filters.endDay)
    if (rangeDays === null) {
      return {
        status: 400,
        type: 'error',
        title: this.t('validation_error'),
        message: this.t('attendance_stats_invalid_input'),
        key: 'entrada-invalida',
        data: null,
      }
    }

    const rangeError = this.validateRange(filters)
    if (rangeError) return { ...rangeError, data: null }

    if (rangeDays > ABSENCES_MAX_RANGE_DAYS) {
      return {
        status: 400,
        type: 'error',
        title: this.t('attendance_stats_absences_range_exceeded_title'),
        message: this.t('attendance_stats_absences_range_exceeded_detail', {
          maxDays: ABSENCES_MAX_RANGE_DAYS,
        }),
        key: 'rango-maximo-excedido',
        data: null,
      }
    }
    return null
  }

  private found<T>(data: T): ServiceResult<T> {
    return {
      status: 200,
      type: 'success',
      title: this.t('resources'),
      message: this.t('resources_were_found_successfully'),
      data,
    }
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
      this.dependencies.loadToleranceThresholds(),
    ])

    return {
      status: 200,
      type: 'success',
      title: this.t('resources'),
      message: this.t('resources_were_found_successfully'),
      data: buildOverviewResponse({
        bundles,
        thresholds,
        startDay: filters.startDay,
        endDay: filters.endDay,
        granularity: filters.granularity ?? 'day',
      }),
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
      this.dependencies.loadToleranceThresholds(),
    ])

    const byDept = new Map<
      number,
      {
        name: string
        clean: CleanCounters
        informational: InformationalCounters
        employeesQty: number
      }
    >()

    for (const bundle of bundles) {
      const deptId = bundle.employee.departmentId
      if (deptId === null) continue
      const { clean, informational } = aggregateCalendar(bundle.calendar, thresholds)
      // Mismo criterio que el overview: cuenta al empleado solo si tuvo al
      // menos un día evaluable. Sin esto el conteo por departamento no sería
      // comparable con el total de la pantalla, que sí lo aplica.
      const hasEvaluableDay = bundle.calendar.some((day) => isEvaluableDay(day))
      const existing = byDept.get(deptId)
      if (existing) {
        addClean(existing.clean, clean)
        addInformational(existing.informational, informational)
        if (hasEvaluableDay) existing.employeesQty += 1
      } else {
        byDept.set(deptId, {
          name: bundle.departmentName ?? '',
          clean,
          informational,
          employeesQty: hasEvaluableDay ? 1 : 0,
        })
      }
    }

    const data: DepartmentRow[] = Array.from(byDept.entries())
      .map(([deptId, agg]) => ({
        department: { departmentId: deptId, departmentName: agg.name },
        statistics: toOverviewStatistics(agg.clean, agg.informational, agg.employeesQty),
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
      this.dependencies.loadToleranceThresholds(),
    ])

    const data: EmployeeRow[] = bundles.map((bundle) => {
      const { clean, informational } = aggregateCalendar(bundle.calendar, thresholds)
      return {
        employee: bundle.employee,
        statistics: toStatistics(clean, informational),
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

/**
 * Tolerancias de retardo y falta DE LA EMPRESA ACTIVA; sin empresa en contexto,
 * sin configuración o sin la tolerancia, los defaults del módulo.
 *
 * Antes tomaba `.first()` de cualquier configuración activa, sin filtrar por
 * empresa: el porcentaje de retardos y faltas de un cliente se calculaba con la
 * tolerancia de otro —la que primero devolviera la base—, y el suyo, el que
 * había ajustado desde su backoffice, no se aplicaba.
 */
async function loadToleranceThresholdsFromSettings(): Promise<ToleranceThresholds> {
  const setting = await new SystemSettingService().resolveForActiveTenant()

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

/** Entrada de `buildOverviewResponse`: calendarios ya cargados y el período pedido. */
export interface BuildOverviewInput {
  bundles: EmployeeCalendarBundle[]
  thresholds: ToleranceThresholds
  startDay: string
  endDay: string
  granularity: AttendanceStatsGranularity
}

/** Contadores acumulados de un día o de un mes, con los empleados evaluados en él. */
interface StatsBucket {
  clean: CleanCounters
  informational: InformationalCounters
  employeesQty: number
}

function bucketOf(buckets: Map<string, StatsBucket>, key: string): StatsBucket {
  let bucket = buckets.get(key)
  if (!bucket) {
    bucket = { clean: emptyClean(), informational: emptyInformational(), employeesQty: 0 }
    buckets.set(key, bucket)
  }
  return bucket
}

/** Estadísticas de un día o mes; sin acumulador (sin registros) van en cero. */
function bucketStatistics(bucket: StatsBucket | undefined): OverviewStatistics {
  return bucket
    ? toOverviewStatistics(bucket.clean, bucket.informational, bucket.employeesQty)
    : toOverviewStatistics(emptyClean(), emptyInformational(), 0)
}

/**
 * Arma la respuesta del overview a partir de los calendarios en memoria, sin
 * tocar BD. En una sola pasada acumula el total del período, el desglose por
 * día y, con `granularity=month`, el desglose por mes calendario.
 *
 * `employeesQty` cuenta empleados con al menos un día evaluable: en el período
 * para `statistics`, en esa fecha para `daily` y en ese mes para `monthly`.
 * Con `granularity=day` la respuesta no trae `monthly`.
 */
export function buildOverviewResponse(input: BuildOverviewInput): OverviewResponse {
  const { bundles, thresholds, startDay, endDay, granularity } = input
  const withMonthly = granularity === 'month'
  const totalClean = emptyClean()
  const totalInfo = emptyInformational()
  // Empleados con al menos un día evaluable en todo el período (conteo global).
  let evaluatedEmployees = 0
  // Acumuladores por fecha (yyyy-MM-dd) y por mes (yyyy-MM).
  const byDay = new Map<string, StatsBucket>()
  const byMonth = new Map<string, StatsBucket>()

  for (const bundle of bundles) {
    // Cada bundle es un empleado distinto, con a lo más una fila por fecha.
    let hasEvaluableDay = false
    const evaluableMonths = new Set<string>()
    for (const day of bundle.calendar) {
      const { clean, informational } = classifyDay(day, thresholds)
      addClean(totalClean, clean)
      addInformational(totalInfo, informational)

      const dayBucket = bucketOf(byDay, day.day)
      addClean(dayBucket.clean, clean)
      addInformational(dayBucket.informational, informational)

      const month = day.day.slice(0, 7)
      if (withMonthly) {
        const monthBucket = bucketOf(byMonth, month)
        addClean(monthBucket.clean, clean)
        addInformational(monthBucket.informational, informational)
      }

      if (isEvaluableDay(day)) {
        hasEvaluableDay = true
        dayBucket.employeesQty += 1
        if (withMonthly) evaluableMonths.add(month)
      }
    }
    if (hasEvaluableDay) evaluatedEmployees += 1
    // Una vez por mes aunque el empleado tenga varios días evaluables en él.
    for (const month of evaluableMonths) {
      bucketOf(byMonth, month).employeesQty += 1
    }
  }

  const statistics = toOverviewStatistics(totalClean, totalInfo, evaluatedEmployees)

  // Todos los días del rango, incluso los que no tienen registros evaluables.
  const daily: DailyStatsRow[] = enumerateDays(startDay, endDay).map((d) => ({
    day: d,
    statistics: bucketStatistics(byDay.get(d)),
  }))

  const response: OverviewResponse = {
    statistics,
    period: {
      startDay,
      endDay,
      evaluableDays: statistics.totalAvailable,
    },
    daily,
  }

  if (withMonthly) {
    // Todos los meses del rango, incluso los que no tienen registros.
    response.monthly = enumerateMonths(startDay, endDay).map((month) => ({
      month,
      statistics: bucketStatistics(byMonth.get(month)),
    }))
  }

  return response
}

/**
 * Enumera los meses calendario que toca [startDay, endDay] inclusive, en
 * formato yyyy-MM. Mismo criterio de fecha pura que `enumerateDays`.
 */
function enumerateMonths(startDay: string, endDay: string): string[] {
  const months: string[] = []
  let cursor = DateTime.fromISO(startDay).startOf('month')
  const end = DateTime.fromISO(endDay).startOf('month')
  while (cursor.isValid && cursor <= end) {
    months.push(cursor.toFormat('yyyy-MM'))
    cursor = cursor.plus({ months: 1 })
  }
  return months
}
