import { I18n } from '@adonisjs/i18n'
import env from '#start/env'
import BusinessUnit from '#models/business_unit'
import User from '#models/user'
import AttendanceStatsRepositoryMysql from './attendance-stats.repository.mysql.js'
import type { AttendanceStatsRepository } from './attendance-stats.repository.js'
import type {
  AttendanceStatistics,
  AttendanceStatsFilters,
  DepartmentRow,
  EmployeeRow,
  OverviewResponse,
  RawCounters,
  ResolvedScope,
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
 * Lógica de negocio del módulo attendance-stats.
 *
 * Resuelve el scope multitenant del usuario autenticado, valida el rango
 * temporal, delega la agregación al repositorio MySQL y aplica el cierre
 * a 100% (faults absorbe el residuo de redondeo).
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

  /**
   * Valida el rango de fechas. Devuelve null si todo OK, o un ServiceResult
   * con el error listo para responder.
   */
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
    const counters = await this.repo.getOverview(filters, scope.allowedBusinessUnitIds)
    const statistics = this.toStatistics(counters)
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
    const rows = await this.repo.getByDepartment(filters, scope.allowedBusinessUnitIds)
    const data: DepartmentRow[] = rows.map((r) => ({
      department: { departmentId: r.departmentId, departmentName: r.departmentName },
      statistics: this.toStatistics(r),
    }))
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
    const rows = await this.repo.getByEmployee(filters, scope.allowedBusinessUnitIds)
    const data: EmployeeRow[] = rows.map((r) => ({
      employee: {
        employeeId: r.employeeId,
        employeeCode: r.employeeCode,
        employeeFirstName: r.employeeFirstName,
        employeeLastName: r.employeeLastName,
        employeeSecondLastName: r.employeeSecondLastName,
        departmentId: r.departmentId,
        positionId: r.positionId,
        businessUnitId: r.businessUnitId,
        payrollBusinessUnitId: r.payrollBusinessUnitId,
      },
      statistics: this.toStatistics(r),
    }))
    return {
      status: 200,
      type: 'success',
      title: this.t('resources'),
      message: this.t('resources_were_found_successfully'),
      data,
    }
  }

  /**
   * Convierte contadores crudos en AttendanceStatistics con cierre a 100%.
   * - totalAvailable = assists + tolerances + delays + faults (NO incluye earlyOuts).
   * - faultPercentage absorbe el residuo de redondeo para que ontime+tolerance+delay+fault = 100.
   * - earlyOutPercentage es independiente del cierre (se computa sobre check_out_status).
   */
  private toStatistics(c: RawCounters): AttendanceStatistics {
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
      }
    }
    const ontimePercentage = Math.round((c.assists / totalAvailable) * 100)
    const tolerancePercentage = Math.round((c.tolerances / totalAvailable) * 100)
    const delayPercentage = Math.round((c.delays / totalAvailable) * 100)
    const earlyOutPercentage = Math.round((c.earlyOuts / totalAvailable) * 100)
    const faultPercentage =
      100 - ontimePercentage - tolerancePercentage - delayPercentage

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
