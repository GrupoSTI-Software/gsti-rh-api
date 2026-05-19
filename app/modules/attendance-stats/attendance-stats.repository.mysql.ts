import db from '@adonisjs/lucid/services/db'
import type {
  AttendanceStatsFilters,
  CleanCounters,
  DepartmentBundle,
  DepartmentGroup,
  EmployeeBundle,
  EmployeeGroup,
  InformationalCounters,
  OverviewBundle,
  PermissionDayRow,
} from './dto/attendance-stats.dto.js'
import type { AttendanceStatsRepository } from './attendance-stats.repository.js'

type GroupBy = 'overview' | 'department' | 'employee'

/**
 * Implementación MySQL del repositorio.
 *
 * Cada endpoint hace 3 queries en paralelo:
 * - Clean: agregados sobre días SIN shift_exception (status almacenado confiable).
 * - Informational: vacaciones / festivos / faltas justificadas.
 * - PermissionDays: filas crudas de días con late-arrival/early-departure para que el service recomputa el status efectivo.
 */
export default class AttendanceStatsRepositoryMysql implements AttendanceStatsRepository {
  async getOverview(
    filters: AttendanceStatsFilters,
    allowedBusinessUnitIds: number[]
  ): Promise<OverviewBundle> {
    if (allowedBusinessUnitIds.length === 0) {
      return {
        clean: emptyClean(),
        informational: emptyInformational(),
        permissionDays: [],
      }
    }

    const [cleanRow, infoRow, permissionDays] = await Promise.all([
      this.fetchCleanAggregate(filters, allowedBusinessUnitIds, 'overview'),
      this.fetchInformationalAggregate(filters, allowedBusinessUnitIds, 'overview'),
      this.fetchPermissionDays(filters, allowedBusinessUnitIds),
    ])

    return {
      clean: cleanRow[0] ? rowToClean(cleanRow[0]) : emptyClean(),
      informational: infoRow[0] ? rowToInformational(infoRow[0]) : emptyInformational(),
      permissionDays,
    }
  }

  async getByDepartment(
    filters: AttendanceStatsFilters,
    allowedBusinessUnitIds: number[]
  ): Promise<DepartmentBundle> {
    if (allowedBusinessUnitIds.length === 0) {
      return { groups: [], permissionDays: [] }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [cleanRows, infoRows, permissionDays] = (await Promise.all([
      this.fetchCleanAggregate(filters, allowedBusinessUnitIds, 'department'),
      this.fetchInformationalAggregate(filters, allowedBusinessUnitIds, 'department'),
      this.fetchPermissionDays(filters, allowedBusinessUnitIds),
    ])) as [any[], any[], PermissionDayRow[]]

    const groups = mergeDepartmentRows(cleanRows, infoRows)
    return { groups, permissionDays }
  }

  async getByEmployee(
    filters: AttendanceStatsFilters,
    allowedBusinessUnitIds: number[]
  ): Promise<EmployeeBundle> {
    if (allowedBusinessUnitIds.length === 0) {
      return { groups: [], permissionDays: [] }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [cleanRows, infoRows, permissionDays] = (await Promise.all([
      this.fetchCleanAggregate(filters, allowedBusinessUnitIds, 'employee'),
      this.fetchInformationalAggregate(filters, allowedBusinessUnitIds, 'employee'),
      this.fetchPermissionDays(filters, allowedBusinessUnitIds),
    ])) as [any[], any[], PermissionDayRow[]]

    const groups = mergeEmployeeRows(cleanRows, infoRows)
    return { groups, permissionDays }
  }

  /**
   * Query A — agregados sobre días SIN shift_exception (status almacenado es confiable).
   * Devuelve 1 fila para overview, N filas (con identidad) para department/employee.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async fetchCleanAggregate(
    filters: AttendanceStatsFilters,
    allowedBusinessUnitIds: number[],
    groupBy: GroupBy
  ): Promise<any[]> {
    const q = this.evaluableBaseQuery(filters, allowedBusinessUnitIds)
      .where('eac.has_exceptions', 0)

    const counters = [
      db.raw("SUM(CASE WHEN eac.check_in_status = 'ontime' THEN 1 ELSE 0 END) AS assists"),
      db.raw("SUM(CASE WHEN eac.check_in_status = 'tolerance' THEN 1 ELSE 0 END) AS tolerances"),
      db.raw("SUM(CASE WHEN eac.check_in_status = 'delay' THEN 1 ELSE 0 END) AS delays"),
      db.raw("SUM(CASE WHEN eac.check_in_status = 'fault' THEN 1 ELSE 0 END) AS faults"),
      db.raw("SUM(CASE WHEN eac.check_out_status = 'delay' THEN 1 ELSE 0 END) AS early_outs"),
    ]

    if (groupBy === 'overview') {
      return q.select(...counters)
    }

    if (groupBy === 'department') {
      return q
        .innerJoin('departments AS d', 'd.department_id', 'e.department_id')
        .whereNull('d.department_deleted_at')
        .select(
          'd.department_id AS department_id',
          'd.department_name AS department_name',
          ...counters
        )
        .groupBy('d.department_id', 'd.department_name')
        .orderBy('d.department_name', 'asc')
    }

    return q
      .leftJoin('departments AS d', 'd.department_id', 'e.department_id')
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
        'e.payroll_business_unit_id AS payroll_business_unit_id',
        ...counters
      )
      .groupBy(
        'e.employee_id',
        'e.employee_code',
        'e.employee_first_name',
        'e.employee_last_name',
        'e.employee_second_last_name',
        'e.department_id',
        'd.department_name',
        'e.position_id',
        'e.business_unit_id',
        'e.payroll_business_unit_id'
      )
      .orderBy('e.employee_first_name', 'asc')
      .orderBy('e.employee_last_name', 'asc')
  }

  /**
   * Query B — contadores informativos (vacations, holidays, justifiedAbsences).
   * No filtra por evaluable flags (al revés: contamos cuando el flag está en 1).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async fetchInformationalAggregate(
    filters: AttendanceStatsFilters,
    allowedBusinessUnitIds: number[],
    groupBy: GroupBy
  ): Promise<any[]> {
    const q = this.scopedBaseQuery(filters, allowedBusinessUnitIds)
      .where('eac.is_future_day', 0)
      .joinRaw(
        `LEFT JOIN (
          SELECT se.employee_id, DATE(se.shift_exceptions_date) AS day, COUNT(*) AS cnt
          FROM shift_exceptions se
          INNER JOIN exception_types et ON et.exception_type_id = se.exception_type_id
          WHERE et.exception_type_slug IN ('absence-from-work', 'nuevo-ingreso')
            AND se.shift_exceptions_deleted_at IS NULL
            AND se.shift_exceptions_date BETWEEN ? AND ?
          GROUP BY se.employee_id, DATE(se.shift_exceptions_date)
        ) AS just_abs ON just_abs.employee_id = e.employee_id AND just_abs.day = eac.day`,
        [filters.startDay, filters.endDay]
      )

    const counters = [
      db.raw('SUM(CASE WHEN eac.is_vacation_date = 1 THEN 1 ELSE 0 END) AS vacations'),
      db.raw('SUM(CASE WHEN eac.is_holiday = 1 THEN 1 ELSE 0 END) AS holidays'),
      db.raw('SUM(CASE WHEN just_abs.cnt > 0 THEN 1 ELSE 0 END) AS justified_absences'),
    ]

    if (groupBy === 'overview') {
      return q.select(...counters)
    }

    if (groupBy === 'department') {
      return q
        .innerJoin('departments AS d', 'd.department_id', 'e.department_id')
        .whereNull('d.department_deleted_at')
        .select(
          'd.department_id AS department_id',
          'd.department_name AS department_name',
          ...counters
        )
        .groupBy('d.department_id', 'd.department_name')
    }

    return q
      .leftJoin('departments AS d_info', 'd_info.department_id', 'e.department_id')
      .select(
        'e.employee_id AS employee_id',
        'e.employee_code AS employee_code',
        'e.employee_first_name AS employee_first_name',
        'e.employee_last_name AS employee_last_name',
        'e.employee_second_last_name AS employee_second_last_name',
        'e.department_id AS department_id',
        'd_info.department_name AS department_name',
        'e.position_id AS position_id',
        'e.business_unit_id AS business_unit_id',
        'e.payroll_business_unit_id AS payroll_business_unit_id',
        ...counters
      )
      .groupBy(
        'e.employee_id',
        'e.employee_code',
        'e.employee_first_name',
        'e.employee_last_name',
        'e.employee_second_last_name',
        'e.department_id',
        'd_info.department_name',
        'e.position_id',
        'e.business_unit_id',
        'e.payroll_business_unit_id'
      )
  }

  /**
   * Query C — filas crudas de días con permiso `late-arrival` o `early-departure`.
   * El service recomputa el status efectivo en TS contra la hora autorizada.
   * Excluye días con permisos no-generales (absence-from-work, vacation, etc.).
   */
  private async fetchPermissionDays(
    filters: AttendanceStatsFilters,
    allowedBusinessUnitIds: number[]
  ): Promise<PermissionDayRow[]> {
    const q = this.scopedBaseQuery(filters, allowedBusinessUnitIds)
      .where('eac.is_future_day', 0)
      .where('eac.is_rest_day', 0)
      .where('eac.is_vacation_date', 0)
      .where('eac.is_holiday', 0)
      .where('eac.is_work_disability_date', 0)
      .leftJoin('departments AS d_perm', 'd_perm.department_id', 'e.department_id')
      .leftJoin('shifts AS s_perm', 's_perm.shift_id', 'eac.shift_id')
      .leftJoin('assists AS ai_perm', 'ai_perm.assist_id', 'eac.check_in_assist_id')
      .leftJoin('assists AS ao_perm', 'ao_perm.assist_id', 'eac.check_out_assist_id')
      .joinRaw(
        `LEFT JOIN (
          SELECT se.employee_id, DATE(se.shift_exceptions_date) AS day, MIN(se.shift_exception_check_in_time) AS check_in_time
          FROM shift_exceptions se
          INNER JOIN exception_types et ON et.exception_type_id = se.exception_type_id
          WHERE et.exception_type_slug = 'late-arrival'
            AND se.shift_exceptions_deleted_at IS NULL
            AND se.shift_exceptions_date BETWEEN ? AND ?
          GROUP BY se.employee_id, DATE(se.shift_exceptions_date)
        ) AS la ON la.employee_id = e.employee_id AND la.day = eac.day`,
        [filters.startDay, filters.endDay]
      )
      .joinRaw(
        `LEFT JOIN (
          SELECT se.employee_id, DATE(se.shift_exceptions_date) AS day, MAX(se.shift_exception_check_out_time) AS check_out_time
          FROM shift_exceptions se
          INNER JOIN exception_types et ON et.exception_type_id = se.exception_type_id
          WHERE et.exception_type_slug = 'early-departure'
            AND se.shift_exceptions_deleted_at IS NULL
            AND se.shift_exceptions_date BETWEEN ? AND ?
          GROUP BY se.employee_id, DATE(se.shift_exceptions_date)
        ) AS ed ON ed.employee_id = e.employee_id AND ed.day = eac.day`,
        [filters.startDay, filters.endDay]
      )
      // Solo días que tienen al menos uno de los dos permisos.
      .where((sub) => {
        sub.whereNotNull('la.check_in_time').orWhereNotNull('ed.check_out_time')
      })
      // Excluir días con permisos NO-generales (absence-from-work, vacation, etc.).
      .whereNotExists((sub) => {
        sub
          .from('shift_exceptions AS se_excl')
          .innerJoin('exception_types AS et_excl', 'et_excl.exception_type_id', 'se_excl.exception_type_id')
          .whereRaw('se_excl.employee_id = e.employee_id')
          .whereRaw('DATE(se_excl.shift_exceptions_date) = eac.day')
          .whereNull('se_excl.shift_exceptions_deleted_at')
          .where('et_excl.exception_type_is_general', 0)
      })
      .select(
        'e.employee_id AS employee_id',
        'e.department_id AS department_id',
        'd_perm.department_name AS department_name',
        'e.position_id AS position_id',
        'e.business_unit_id AS business_unit_id',
        'e.payroll_business_unit_id AS payroll_business_unit_id',
        'e.employee_code AS employee_code',
        'e.employee_first_name AS employee_first_name',
        'e.employee_last_name AS employee_last_name',
        'e.employee_second_last_name AS employee_second_last_name',
        'eac.day AS day',
        'eac.check_in_status AS stored_check_in_status',
        'eac.check_out_status AS stored_check_out_status',
        's_perm.shift_time_start AS shift_time_start',
        's_perm.shift_active_hours AS shift_active_hours',
        'ai_perm.assist_punch_time_utc AS check_in_punch_utc',
        'ao_perm.assist_punch_time_utc AS check_out_punch_utc',
        'la.check_in_time AS late_arrival_check_in_time',
        'ed.check_out_time AS early_departure_check_out_time'
      )

    const rows = await q
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows.map((r: any) => ({
      employeeId: Number(r.employee_id),
      departmentId: r.department_id !== null && r.department_id !== undefined ? Number(r.department_id) : null,
      departmentName: r.department_name ?? null,
      positionId: r.position_id !== null && r.position_id !== undefined ? Number(r.position_id) : null,
      businessUnitId: Number(r.business_unit_id),
      payrollBusinessUnitId: Number(r.payroll_business_unit_id),
      employeeCode: r.employee_code ?? null,
      employeeFirstName: r.employee_first_name ?? null,
      employeeLastName: r.employee_last_name ?? null,
      employeeSecondLastName: r.employee_second_last_name ?? null,
      day: typeof r.day === 'string' ? r.day : new Date(r.day).toISOString().slice(0, 10),
      storedCheckInStatus: r.stored_check_in_status ?? null,
      storedCheckOutStatus: r.stored_check_out_status ?? null,
      shiftTimeStart: r.shift_time_start ? String(r.shift_time_start) : null,
      shiftActiveHours: r.shift_active_hours !== null && r.shift_active_hours !== undefined ? Number(r.shift_active_hours) : null,
      checkInPunchUtc: r.check_in_punch_utc ? String(r.check_in_punch_utc) : null,
      checkOutPunchUtc: r.check_out_punch_utc ? String(r.check_out_punch_utc) : null,
      lateArrivalCheckInTime: r.late_arrival_check_in_time ? String(r.late_arrival_check_in_time) : null,
      earlyDepartureCheckOutTime: r.early_departure_check_out_time ? String(r.early_departure_check_out_time) : null,
    }))
  }

  /**
   * Base con date range + scope multitenant + filtros opcionales (sin filtros de evaluable day).
   * La usan `fetchInformationalAggregate` y `fetchPermissionDays` que necesitan WHEREs distintos a "evaluable".
   */
  private scopedBaseQuery(filters: AttendanceStatsFilters, allowedBusinessUnitIds: number[]) {
    const q = db
      .from('employee_assist_calendars AS eac')
      .innerJoin('employees AS e', 'e.employee_id', 'eac.employee_id')
      .whereNull('eac.employee_assist_calendar_deleted_at')
      .whereNull('e.employee_deleted_at')
      .whereBetween('eac.day', [filters.startDay, filters.endDay])
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

  /**
   * Base con todos los filtros de evaluable day aplicados. Usada por `fetchCleanAggregate`.
   * NO incluye `has_exceptions = 0` — eso se agrega aparte porque para "permission days" lo invertimos.
   */
  private evaluableBaseQuery(filters: AttendanceStatsFilters, allowedBusinessUnitIds: number[]) {
    return this.scopedBaseQuery(filters, allowedBusinessUnitIds)
      .where('eac.is_future_day', 0)
      .where('eac.is_rest_day', 0)
      .where('eac.is_vacation_date', 0)
      .where('eac.is_holiday', 0)
      .where('eac.is_work_disability_date', 0)
  }
}

function emptyClean(): CleanCounters {
  return { assists: 0, tolerances: 0, delays: 0, earlyOuts: 0, faults: 0 }
}

function emptyInformational(): InformationalCounters {
  return { justifiedAbsences: 0, vacations: 0, holidays: 0 }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToClean(r: any): CleanCounters {
  return {
    assists: Number(r?.assists ?? 0),
    tolerances: Number(r?.tolerances ?? 0),
    delays: Number(r?.delays ?? 0),
    faults: Number(r?.faults ?? 0),
    earlyOuts: Number(r?.early_outs ?? 0),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToInformational(r: any): InformationalCounters {
  return {
    justifiedAbsences: Number(r?.justified_absences ?? 0),
    vacations: Number(r?.vacations ?? 0),
    holidays: Number(r?.holidays ?? 0),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mergeDepartmentRows(cleanRows: any[], infoRows: any[]): DepartmentGroup[] {
  const map = new Map<number, DepartmentGroup>()
  for (const r of cleanRows) {
    const id = Number(r.department_id)
    map.set(id, {
      department: { departmentId: id, departmentName: String(r.department_name) },
      clean: rowToClean(r),
      informational: emptyInformational(),
    })
  }
  for (const r of infoRows) {
    const id = Number(r.department_id)
    const existing = map.get(id)
    if (existing) {
      existing.informational = rowToInformational(r)
    } else {
      map.set(id, {
        department: { departmentId: id, departmentName: String(r.department_name) },
        clean: emptyClean(),
        informational: rowToInformational(r),
      })
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.department.departmentName.localeCompare(b.department.departmentName)
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mergeEmployeeRows(cleanRows: any[], infoRows: any[]): EmployeeGroup[] {
  const map = new Map<number, EmployeeGroup>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildEmployee = (r: any) => ({
    employeeId: Number(r.employee_id),
    employeeCode: r.employee_code ?? null,
    employeeFirstName: r.employee_first_name ?? null,
    employeeLastName: r.employee_last_name ?? null,
    employeeSecondLastName: r.employee_second_last_name ?? null,
    departmentId: r.department_id !== null && r.department_id !== undefined ? Number(r.department_id) : null,
    positionId: r.position_id !== null && r.position_id !== undefined ? Number(r.position_id) : null,
    businessUnitId: Number(r.business_unit_id),
    payrollBusinessUnitId: Number(r.payroll_business_unit_id),
  })
  for (const r of cleanRows) {
    const id = Number(r.employee_id)
    map.set(id, {
      employee: buildEmployee(r),
      clean: rowToClean(r),
      informational: emptyInformational(),
    })
  }
  for (const r of infoRows) {
    const id = Number(r.employee_id)
    const existing = map.get(id)
    if (existing) {
      existing.informational = rowToInformational(r)
    } else {
      map.set(id, {
        employee: buildEmployee(r),
        clean: emptyClean(),
        informational: rowToInformational(r),
      })
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const fa = (a.employee.employeeFirstName ?? '').toString()
    const fb = (b.employee.employeeFirstName ?? '').toString()
    if (fa !== fb) return fa.localeCompare(fb)
    const la = (a.employee.employeeLastName ?? '').toString()
    const lb = (b.employee.employeeLastName ?? '').toString()
    return la.localeCompare(lb)
  })
}
