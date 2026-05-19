import db from '@adonisjs/lucid/services/db'
import type {
  AttendanceStatsFilters,
  DepartmentCountersRow,
  EmployeeCountersRow,
  OverviewCountersRow,
} from './dto/attendance-stats.dto.js'
import type { AttendanceStatsRepository } from './attendance-stats.repository.js'

/**
 * Implementación MySQL del repositorio.
 *
 * Estrategia: una sola query por endpoint con GROUP BY + SUM(CASE…)
 * sobre employee_assist_calendars JOIN employees, filtrando los 6
 * flags de evaluableDay en el WHERE.
 *
 * Importante: el `scope` (allowedBusinessUnitIds) ya viene resuelto
 * por el service. Si llega vacío, el service nunca debió llamar al
 * repo — pero por defensa retornamos zeros / [] sin pegarle a DB.
 */
export default class AttendanceStatsRepositoryMysql implements AttendanceStatsRepository {
  async getOverview(
    filters: AttendanceStatsFilters,
    allowedBusinessUnitIds: number[]
  ): Promise<OverviewCountersRow> {
    if (allowedBusinessUnitIds.length === 0) {
      return { assists: 0, tolerances: 0, delays: 0, earlyOuts: 0, faults: 0 }
    }

    const query = this.baseQuery(filters, allowedBusinessUnitIds)

    // 'delay' en check_out_status = salida temprana (convención heredada de assist_service.ts:1666).
    const row = await query
      .select(
        db.raw("SUM(CASE WHEN eac.check_in_status = 'ontime' THEN 1 ELSE 0 END) AS assists"),
        db.raw(
          "SUM(CASE WHEN eac.check_in_status = 'tolerance' THEN 1 ELSE 0 END) AS tolerances"
        ),
        db.raw("SUM(CASE WHEN eac.check_in_status = 'delay' THEN 1 ELSE 0 END) AS delays"),
        db.raw("SUM(CASE WHEN eac.check_in_status = 'fault' THEN 1 ELSE 0 END) AS faults"),
        db.raw("SUM(CASE WHEN eac.check_out_status = 'delay' THEN 1 ELSE 0 END) AS early_outs")
      )
      .first()

    return {
      assists: Number(row?.assists ?? 0),
      tolerances: Number(row?.tolerances ?? 0),
      delays: Number(row?.delays ?? 0),
      faults: Number(row?.faults ?? 0),
      earlyOuts: Number(row?.early_outs ?? 0),
    }
  }

  async getByDepartment(
    filters: AttendanceStatsFilters,
    allowedBusinessUnitIds: number[]
  ): Promise<DepartmentCountersRow[]> {
    if (allowedBusinessUnitIds.length === 0) {
      return []
    }

    const rows = await this.baseQuery(filters, allowedBusinessUnitIds)
      .innerJoin('departments AS d', 'd.department_id', 'e.department_id')
      .whereNull('d.department_deleted_at')
      .select(
        'd.department_id AS department_id',
        'd.department_name AS department_name',
        db.raw("SUM(CASE WHEN eac.check_in_status = 'ontime' THEN 1 ELSE 0 END) AS assists"),
        db.raw(
          "SUM(CASE WHEN eac.check_in_status = 'tolerance' THEN 1 ELSE 0 END) AS tolerances"
        ),
        db.raw("SUM(CASE WHEN eac.check_in_status = 'delay' THEN 1 ELSE 0 END) AS delays"),
        db.raw("SUM(CASE WHEN eac.check_in_status = 'fault' THEN 1 ELSE 0 END) AS faults"),
        db.raw("SUM(CASE WHEN eac.check_out_status = 'delay' THEN 1 ELSE 0 END) AS early_outs")
      )
      .groupBy('d.department_id', 'd.department_name')
      .orderBy('d.department_name', 'asc')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows.map((r: any) => ({
      departmentId: Number(r.department_id),
      departmentName: String(r.department_name),
      assists: Number(r.assists ?? 0),
      tolerances: Number(r.tolerances ?? 0),
      delays: Number(r.delays ?? 0),
      faults: Number(r.faults ?? 0),
      earlyOuts: Number(r.early_outs ?? 0),
    }))
  }

  async getByEmployee(
    filters: AttendanceStatsFilters,
    allowedBusinessUnitIds: number[]
  ): Promise<EmployeeCountersRow[]> {
    if (allowedBusinessUnitIds.length === 0) {
      return []
    }

    const rows = await this.baseQuery(filters, allowedBusinessUnitIds)
      .select(
        'e.employee_id AS employee_id',
        'e.employee_code AS employee_code',
        'e.employee_first_name AS employee_first_name',
        'e.employee_last_name AS employee_last_name',
        'e.employee_second_last_name AS employee_second_last_name',
        'e.department_id AS department_id',
        'e.position_id AS position_id',
        'e.business_unit_id AS business_unit_id',
        'e.payroll_business_unit_id AS payroll_business_unit_id',
        db.raw("SUM(CASE WHEN eac.check_in_status = 'ontime' THEN 1 ELSE 0 END) AS assists"),
        db.raw(
          "SUM(CASE WHEN eac.check_in_status = 'tolerance' THEN 1 ELSE 0 END) AS tolerances"
        ),
        db.raw("SUM(CASE WHEN eac.check_in_status = 'delay' THEN 1 ELSE 0 END) AS delays"),
        db.raw("SUM(CASE WHEN eac.check_in_status = 'fault' THEN 1 ELSE 0 END) AS faults"),
        db.raw("SUM(CASE WHEN eac.check_out_status = 'delay' THEN 1 ELSE 0 END) AS early_outs")
      )
      .groupBy(
        'e.employee_id',
        'e.employee_code',
        'e.employee_first_name',
        'e.employee_last_name',
        'e.employee_second_last_name',
        'e.department_id',
        'e.position_id',
        'e.business_unit_id',
        'e.payroll_business_unit_id'
      )
      .orderBy('e.employee_first_name', 'asc')
      .orderBy('e.employee_last_name', 'asc')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows.map((r: any) => ({
      employeeId: Number(r.employee_id),
      employeeCode: r.employee_code ?? null,
      employeeFirstName: r.employee_first_name ?? null,
      employeeLastName: r.employee_last_name ?? null,
      employeeSecondLastName: r.employee_second_last_name ?? null,
      departmentId: r.department_id !== null && r.department_id !== undefined ? Number(r.department_id) : null,
      positionId: r.position_id !== null && r.position_id !== undefined ? Number(r.position_id) : null,
      businessUnitId: Number(r.business_unit_id),
      payrollBusinessUnitId: Number(r.payroll_business_unit_id),
      assists: Number(r.assists ?? 0),
      tolerances: Number(r.tolerances ?? 0),
      delays: Number(r.delays ?? 0),
      faults: Number(r.faults ?? 0),
      earlyOuts: Number(r.early_outs ?? 0),
    }))
  }

  /**
   * Query base reusada por los 3 endpoints. Aplica el WHERE de evaluableDay,
   * el rango de fechas, el scope multitenant y los filtros opcionales del request.
   */
  private baseQuery(filters: AttendanceStatsFilters, allowedBusinessUnitIds: number[]) {
    const q = db
      .from('employee_assist_calendars AS eac')
      .innerJoin('employees AS e', 'e.employee_id', 'eac.employee_id')
      .whereNull('eac.employee_assist_calendar_deleted_at')
      .whereNull('e.employee_deleted_at')
      .whereBetween('eac.day', [filters.startDay, filters.endDay])
      .where('eac.is_future_day', 0)
      .where('eac.is_rest_day', 0)
      .where('eac.is_vacation_date', 0)
      .where('eac.is_holiday', 0)
      .where('eac.is_work_disability_date', 0)
      .where('eac.has_exceptions', 0)
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

    return q
  }
}
