import db from '@adonisjs/lucid/services/db'
import { I18n } from '@adonisjs/i18n'
import SyncAssistsService from '#services/sync_assists_service'
import type { AssistDayInterface } from '../../interfaces/assist_day_interface.js'
import type {
  AttendanceStatsFilters,
  EmployeeCalendarBundle,
  EmployeeInfo,
} from './dto/attendance-stats.dto.js'
import type { AttendanceStatsRepository } from './attendance-stats.repository.js'

/**
 * Implementación MySQL del repositorio.
 *
 * Estrategia: por cada empleado en scope, llama a `syncAssistsService.index`
 * que computa el calendario fresco desde `assists` (fuente de verdad) sin
 * depender del cache `employee_assist_calendars`. Reutiliza 100% de la lógica
 * de tolerancias, DST, holidays, exceptions y shift changes ya probada.
 *
 * Trade-off: N llamadas (una por empleado en scope). Para 200 empleados,
 * tarda más que la versión agregada-por-SQL anterior, pero garantiza datos
 * frescos sin depender del cron que populaba el cache.
 */
export default class AttendanceStatsRepositoryMysql implements AttendanceStatsRepository {
  private i18n: I18n

  constructor(i18n: I18n) {
    this.i18n = i18n
  }

  async getEmployeeCalendars(
    filters: AttendanceStatsFilters,
    allowedBusinessUnitIds: number[]
  ): Promise<EmployeeCalendarBundle[]> {
    if (allowedBusinessUnitIds.length === 0) {
      return []
    }

    const employees = await this.resolveEmployeesInScope(filters, allowedBusinessUnitIds)
    if (employees.length === 0) return []

    // Una sola instancia del SyncAssistsService — su tolerancesCache se reusa
    // entre llamadas, evitando releer SystemSetting → Tolerance N veces.
    const syncSvc = new SyncAssistsService(this.i18n)

    // Paralelizamos en lotes de CONCURRENCY para no saturar el pool de conexiones
    // de Lucid (default max=10). Para 100 empleados con CONCURRENCY=8, son ~13
    // batches y el throughput vs serial mejora ~6-8x.
    const CONCURRENCY = 8
    const bundles: EmployeeCalendarBundle[] = new Array(employees.length)
    for (let i = 0; i < employees.length; i += CONCURRENCY) {
      const slice = employees.slice(i, i + CONCURRENCY)
      // eslint-disable-next-line no-await-in-loop
      const computed = await Promise.all(
        slice.map((emp) => this.computeCalendarFor(syncSvc, filters, emp.employee.employeeId))
      )
      computed.forEach((calendar, j) => {
        const emp = slice[j]
        bundles[i + j] = {
          employee: emp.employee,
          departmentName: emp.departmentName,
          calendar,
        }
      })
    }

    return bundles
  }

  /**
   * Empleados activos que cumplen el scope multitenant y los filtros del request.
   */
  private async resolveEmployeesInScope(
    filters: AttendanceStatsFilters,
    allowedBusinessUnitIds: number[]
  ): Promise<Array<{ employee: EmployeeInfo; departmentName: string | null }>> {
    const q = db
      .from('employees AS e')
      .leftJoin('departments AS d', 'd.department_id', 'e.department_id')
      .whereNull('e.employee_deleted_at')
      .whereIn('e.business_unit_id', allowedBusinessUnitIds)

    if (filters.businessUnitId !== undefined) {
      q.where('e.business_unit_id', filters.businessUnitId)
    }
    if (filters.payrollBusinessUnitId !== undefined) {
      q.where('e.payroll_business_unit_id', filters.payrollBusinessUnitId)
    }
    if (filters.departmentIds && filters.departmentIds.length > 0) {
      q.whereIn('e.department_id', filters.departmentIds)
    }
    if (filters.employeeIds && filters.employeeIds.length > 0) {
      q.whereIn('e.employee_id', filters.employeeIds)
    }
    const branchOfficeIds = filters.branchOfficeIds
    if (branchOfficeIds && branchOfficeIds.length > 0) {
      q.whereExists((sub) => {
        sub
          .from('employee_branch_offices AS ebo')
          .whereRaw('ebo.employee_id = e.employee_id')
          .where('ebo.employee_branch_office_active', 1)
          .whereIn('ebo.branch_office_id', branchOfficeIds)
      })
    }

    const rows = await q
      .select(
        'e.employee_id AS employee_id',
        'e.employee_code AS employee_code',
        'e.employee_first_name AS employee_first_name',
        'e.employee_last_name AS employee_last_name',
        'e.employee_second_last_name AS employee_second_last_name',
        'e.department_id AS department_id',
        'd.department_name AS department_name',
        'e.position_id AS position_id',
        'e.business_unit_id AS business_unit_id',
        'e.payroll_business_unit_id AS payroll_business_unit_id'
      )
      .orderBy('e.employee_first_name', 'asc')
      .orderBy('e.employee_last_name', 'asc')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows.map((r: any) => ({
      employee: {
        employeeId: Number(r.employee_id),
        employeeCode: r.employee_code ?? null,
        employeeFirstName: r.employee_first_name ?? null,
        employeeLastName: r.employee_last_name ?? null,
        employeeSecondLastName: r.employee_second_last_name ?? null,
        departmentId:
          r.department_id !== null && r.department_id !== undefined ? Number(r.department_id) : null,
        positionId: r.position_id !== null && r.position_id !== undefined ? Number(r.position_id) : null,
        businessUnitId: Number(r.business_unit_id),
        payrollBusinessUnitId: Number(r.payroll_business_unit_id),
      },
      departmentName: r.department_name ?? null,
    }))
  }

  /**
   * Llama a syncAssistsService.index para obtener el calendario fresco del
   * empleado para el rango pedido. Devuelve [] si la respuesta no es 200.
   */
  private async computeCalendarFor(
    syncSvc: SyncAssistsService,
    filters: AttendanceStatsFilters,
    employeeId: number
  ): Promise<AssistDayInterface[]> {
    const response = await syncSvc.index({
      date: filters.startDay,
      dateEnd: filters.endDay,
      employeeID: employeeId,
    })
    if (response.status !== 200 || !response.data) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = response.data as any
    const calendar = data.employeeCalendar as AssistDayInterface[] | undefined
    return Array.isArray(calendar) ? calendar : []
  }
}
