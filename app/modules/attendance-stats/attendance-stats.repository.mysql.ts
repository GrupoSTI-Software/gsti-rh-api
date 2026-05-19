import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { I18n } from '@adonisjs/i18n'
import Employee from '#models/employee'
import SyncAssistsService from '#services/sync_assists_service'
import type { AssistDayInterface } from '../../interfaces/assist_day_interface.js'
import type {
  AttendanceStatsFilters,
  EmployeeCalendarBundle,
  EmployeeInfo,
} from './dto/attendance-stats.dto.js'
import type { AttendanceStatsRepository } from './attendance-stats.repository.js'

/**
 * Implementación MySQL del repositorio — versión bulk.
 *
 * Filosofía: cargar TODA la data necesaria en bulk (5-6 queries totales,
 * independientes del número de empleados) y luego iterar empleados en memoria
 * llamando a `syncAssistsService.getEmployeeCalendar` con los maps pre-loaded.
 *
 * Antes (N+1): ~5 queries × N empleados. Para 88 empleados, ~440 queries.
 * Después: ~6 queries fijas + iteración en memoria.
 *
 * Reusa toda la lógica de tolerancias, DST, holidays, exceptions y shift
 * changes de sync_assists_service. La función `getEmployeeCalendar` ahora
 * es pública y acepta maps de shiftChanges/exceptions pre-loaded.
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

    // 1. Empleados en scope + identidad + department (1 query).
    const employees = await this.resolveEmployeesInScope(filters, allowedBusinessUnitIds)
    if (employees.length === 0) return []

    const employeeIds = employees.map((e) => e.employee.employeeId)
    const employeeCodes = employees
      .map((e) => e.employee.employeeCode)
      .filter((c): c is string => c !== null && c.length > 0)

    // Rango en UTC-6 (Mexico) consistente con sync_assists_service.index.
    const timeCST = DateTime.fromISO(`${filters.startDay}T00:00:00.000-06:00`, { setZone: true }).setZone('UTC-6')
    const timeEndCST = DateTime.fromISO(`${filters.endDay}T23:59:59.000-06:00`, { setZone: true }).setZone('UTC-6').plus({ days: 1 })
    const endDayForGetCalendar = timeEndCST.minus({ days: 1 })

    // 2. Bulk-fetch employees como instancias Lucid (con person preloaded) para
    //    pasar a getEmployeeCalendar (usa employee.person para isBirthday).
    const employeeModels = await Employee.query()
      .whereIn('employee_id', employeeIds)
      .whereNull('employee_deleted_at')
      .preload('person')
    const employeeModelById = new Map(employeeModels.map((e) => [e.employeeId, e]))

    // 3. Bulk-fetch assists del rango para todos los empleados (1 query).
    const assistsRaw = await db
      .from('assists')
      .where('assist_active', 1)
      .where('assist_punch_time_origin', '>=', timeCST.toFormat('yyyy-LL-dd HH:mm:ss'))
      .where('assist_punch_time_origin', '<', timeEndCST.toFormat('yyyy-LL-dd HH:mm:ss'))
      .whereIn('assist_emp_code', employeeCodes)
      .orderBy('assist_punch_time_origin', 'desc')
      .select('*')
    // Agrupar assists por (employeeCode, day Mexico) ya como AssistDayInterface[]
    // siguiendo el shape que index() construye.
    const assistsByEmpCodeAndDay = this.groupAssistsByEmployeeAndDay(assistsRaw)

    // 4. Bulk-fetch employee_shifts joined con shifts (1 query).
    const shiftRowsRaw = await db
      .from('employee_shifts AS es')
      .innerJoin('shifts AS s', 's.shift_id', 'es.shift_id')
      .whereIn('es.employee_id', employeeIds)
      .whereNull('s.shift_deleted_at')
      .orderBy('es.employe_shifts_apply_since', 'desc')
      .select(
        'es.employee_id AS employee_id',
        'es.employee_shift_id AS employee_shift_id',
        'es.employe_shifts_apply_since AS employe_shifts_apply_since',
        's.shift_id AS shift_id',
        's.shift_name AS shift_name',
        's.shift_time_start AS shift_time_start',
        's.shift_active_hours AS shift_active_hours',
        's.shift_rest_days AS shift_rest_days',
        's.shift_accumulated_fault AS shift_accumulated_fault',
        's.shift_calculate_flag AS shift_calculate_flag'
      )
    const shiftsByEmployee = this.groupShiftsByEmployee(shiftRowsRaw)

    // 5. Bulk-fetch shift_changes del rango (1 query) → Map<empId, Map<day, shiftChanges[]>>.
    // FK es employee_id_from (no employee_id) — la relación hasMany del modelo
    // employee.shiftChanges usa employeeIdFrom.
    const shiftChangesRaw = await db
      .from('employee_shift_changes')
      .whereIn('employee_id_from', employeeIds)
      .where('employee_shift_change_date_from', '>=', `${timeCST.toFormat('yyyy-LL-dd')} 00:00:00`)
      .where('employee_shift_change_date_from', '<=', `${timeEndCST.toFormat('yyyy-LL-dd')} 23:59:59`)
      .select('*')
    const shiftChangesByEmployee = this.groupByEmployeeAndDay(
      shiftChangesRaw,
      'employee_id_from',
      'employee_shift_change_date_from'
    )

    // 6. Bulk-fetch shift_exceptions del rango + exception_types (1 query).
    const exceptionsRaw = await db
      .from('shift_exceptions AS se')
      .leftJoin('exception_types AS et', 'et.exception_type_id', 'se.exception_type_id')
      .whereIn('se.employee_id', employeeIds)
      .where('se.shift_exceptions_date', '>=', `${timeCST.toFormat('yyyy-LL-dd')} 00:00:00`)
      .where('se.shift_exceptions_date', '<=', `${timeEndCST.toFormat('yyyy-LL-dd')} 23:59:59`)
      .whereNull('se.shift_exceptions_deleted_at')
      .select(
        'se.*',
        'et.exception_type_id AS et_id',
        'et.exception_type_slug AS et_slug',
        'et.exception_type_type_name AS et_name',
        'et.exception_type_is_general AS et_is_general'
      )
    const exceptionsByEmployee = this.groupExceptionsByEmployeeAndDay(exceptionsRaw)

    // 7. Single syncSvc instance — tolerancesCache + holidaysCache se reusan.
    const syncSvc = new SyncAssistsService(this.i18n)
    // Pre-warm holidays cache (1 query).
    await this.preloadHolidays(syncSvc, timeCST, endDayForGetCalendar)
    // Tolerances cached.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tolerances = await (syncSvc as any).getTolerances()
    const TOLERANCE_DELAY_MINUTES = tolerances?.delayTolerance?.toleranceMinutes || 10
    const TOLERANCE_FAULT_MINUTES = tolerances?.faultTolerance?.toleranceMinutes || 30

    // 8. Procesar empleados en paralelo. Todos los datos están en memoria
    //    (bulk-load completó las queries). getEmployeeCalendar es CPU-only
    //    desde aquí — solo llama a employee.load('person') que está pre-cargado.
    //    Concurrency=16 satura el event loop sin abusar del pool de Lucid.
    const CONCURRENCY = 16
    const bundles: EmployeeCalendarBundle[] = new Array(employees.length)
    for (let i = 0; i < employees.length; i += CONCURRENCY) {
      const slice = employees.slice(i, i + CONCURRENCY)
      // eslint-disable-next-line no-await-in-loop
      const computed = await Promise.all(
        slice.map(async (emp) => {
          const empId = emp.employee.employeeId
          const empCode = emp.employee.employeeCode
          const employeeModel = employeeModelById.get(empId) ?? null
          const employeeShifts = shiftsByEmployee.get(empId) ?? []
          const shiftChangesMap = shiftChangesByEmployee.get(empId) ?? new Map()
          const exceptionsMap = exceptionsByEmployee.get(empId) ?? new Map()
          const assistsForEmp =
            empCode !== null ? assistsByEmpCodeAndDay.get(empCode) ?? new Map() : new Map()
          const assistDayCollection =
            empCode !== null
              ? this.buildAssistDayCollection(assistsForEmp, employeeShifts, syncSvc)
              : []

          const calendar = await syncSvc.getEmployeeCalendar(
            timeCST,
            endDayForGetCalendar,
            assistDayCollection,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            employeeShifts as any,
            empId,
            TOLERANCE_DELAY_MINUTES,
            TOLERANCE_FAULT_MINUTES,
            employeeModel,
            shiftChangesMap,
            exceptionsMap
          )

          return {
            employee: emp.employee,
            departmentName: emp.departmentName,
            calendar,
          }
        })
      )
      computed.forEach((bundle, j) => {
        bundles[i + j] = bundle
      })
    }

    return bundles
  }

  // -------- helpers para resolver empleados / pre-cargar datos --------

  private async resolveEmployeesInScope(
    filters: AttendanceStatsFilters,
    allowedBusinessUnitIds: number[]
  ): Promise<Array<{ employee: EmployeeInfo; departmentName: string | null }>> {
    const q = db
      .from('employees AS e')
      .leftJoin('departments AS d', 'd.department_id', 'e.department_id')
      .whereNull('e.employee_deleted_at')
      .whereIn('e.business_unit_id', allowedBusinessUnitIds)

    if (filters.businessUnitId !== undefined) q.where('e.business_unit_id', filters.businessUnitId)
    if (filters.payrollBusinessUnitId !== undefined) q.where('e.payroll_business_unit_id', filters.payrollBusinessUnitId)
    if (filters.departmentIds && filters.departmentIds.length > 0) q.whereIn('e.department_id', filters.departmentIds)
    if (filters.employeeIds && filters.employeeIds.length > 0) q.whereIn('e.employee_id', filters.employeeIds)

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
        departmentId: r.department_id !== null && r.department_id !== undefined ? Number(r.department_id) : null,
        positionId: r.position_id !== null && r.position_id !== undefined ? Number(r.position_id) : null,
        businessUnitId: Number(r.business_unit_id),
        payrollBusinessUnitId: Number(r.payroll_business_unit_id),
      },
      departmentName: r.department_name ?? null,
    }))
  }

  /**
   * Pre-popula el cache de holidays del syncSvc para que getEmployeeCalendar
   * no haga query por empleado.
   */
  private async preloadHolidays(syncSvc: SyncAssistsService, start: DateTime, end: DateTime): Promise<void> {
    // loadHolidaysInRange es private; usamos cast para invocarla. Cachea
    // internamente, así que llamar 1 vez aquí elimina el query per-empleado.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (syncSvc as any).loadHolidaysInRange(start, end)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private groupAssistsByEmployeeAndDay(rows: any[]): Map<string, Map<string, any[]>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = new Map<string, Map<string, any[]>>()
    for (const r of rows) {
      const empCode = r.assist_emp_code
      const punchUtc = r.assist_punch_time_utc
      const day = DateTime.fromJSDate(new Date(punchUtc)).setZone('UTC-6').toFormat('yyyy-LL-dd')
      // CRÍTICO: downstream code hace `DateTime.fromISO(`${assistPunchTimeUtc}`)` y similares.
      // En index() los assists vienen via Lucid model + toJSON() que convierte fechas a ISO strings.
      // En mi bulk con db.raw, mysql2 retorna Date objects → template literal produce non-ISO string.
      // Por eso convierto a ISO explícitamente aquí.
      const toISO = (v: unknown): string | null => {
        if (v === null || v === undefined) return null
        if (v instanceof Date) return v.toISOString()
        return String(v)
      }
      const assist = {
        assistId: Number(r.assist_id),
        assistUuid: r.assist_uuid ?? null,
        assistEmpCode: r.assist_emp_code,
        assistEmpId: r.assist_emp_id !== null && r.assist_emp_id !== undefined ? Number(r.assist_emp_id) : null,
        assistTerminalSn: r.assist_terminal_sn,
        assistTerminalAlias: r.assist_terminal_alias,
        assistAreaAlias: r.assist_area_alias,
        assistLongitude: r.assist_longitude,
        assistLatitude: r.assist_latitude,
        assistPrecision: r.assist_precision,
        assistUploadTime: toISO(r.assist_upload_time),
        assistPunchTime: toISO(r.assist_punch_time),
        assistPunchTimeUtc: toISO(r.assist_punch_time_utc),
        assistPunchTimeOrigin: toISO(r.assist_punch_time_origin),
        assistSyncId: r.assist_sync_id,
        assistActive: r.assist_active,
        assistUsed: false,
      }
      if (!out.has(empCode)) out.set(empCode, new Map())
      const dayMap = out.get(empCode)!
      if (!dayMap.has(day)) dayMap.set(day, [])
      dayMap.get(day)!.push(assist)
    }
    return out
  }

  /**
   * Convierte el Map<day, AssistInterface[]> de un empleado en AssistDayInterface[]
   * con el shape que getEmployeeCalendar espera (matchea index() líneas 1006-1042).
   */
  private buildAssistDayCollection(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dayMap: Map<string, any[]>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    employeeShifts: any[],
    syncSvc: SyncAssistsService
  ): AssistDayInterface[] {
    const collection: AssistDayInterface[] = []
    for (const [dayKey, dayAssists] of dayMap) {
      const sorted = dayAssists.sort(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (a: any, b: any) =>
          new Date(a.assistPunchTimeUtc).getTime() - new Date(b.assistPunchTimeUtc).getTime()
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dateShift = (syncSvc as any).getAssignedDateShift(sorted[0].assistPunchTimeUtc, employeeShifts)
      collection.push({
        day: dayKey,
        assist: {
          checkIn: pickByPosition(sorted, 'in'),
          checkEatIn: pickByPosition(sorted, 'eatIn'),
          checkEatOut: pickByPosition(sorted, 'eatOut'),
          checkOut: pickByPosition(sorted, 'out'),
          dateShift: dateShift ? dateShift.shift : null,
          dateShiftApplySince: dateShift ? dateShift.employeShiftsApplySince : null,
          employeeShiftId: dateShift ? dateShift.employeeShiftId : null,
          shiftCalculateFlag: dateShift ? dateShift.shiftCalculateFlag : '',
          checkInDateTime: null,
          checkOutDateTime: null,
          checkInStatus: '',
          checkOutStatus: '',
          isFutureDay: false,
          isSundayBonus: false,
          isRestDay: false,
          isVacationDate: false,
          isWorkDisabilityDate: false,
          isHoliday: false,
          isBirthday: false,
          holiday: null,
          hasExceptions: false,
          exceptions: [],
          assitFlatList: sorted,
        },
      })
    }
    return collection
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private groupShiftsByEmployee(rows: any[]): Map<number, any[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = new Map<number, any[]>()
    for (const r of rows) {
      const empId = Number(r.employee_id)
      const applySince =
        r.employe_shifts_apply_since instanceof Date
          ? r.employe_shifts_apply_since.toISOString()
          : r.employe_shifts_apply_since
      const record = {
        employeeShiftId: Number(r.employee_shift_id),
        employeShiftsApplySince: applySince,
        shiftCalculateFlag: r.shift_calculate_flag ?? '',
        shift: {
          shiftId: Number(r.shift_id),
          shiftName: r.shift_name,
          shiftTimeStart: r.shift_time_start,
          shiftActiveHours: r.shift_active_hours,
          shiftRestDays: r.shift_rest_days,
          shiftAccumulatedFault: r.shift_accumulated_fault,
          shiftIsChange: false,
        },
      }
      if (!out.has(empId)) out.set(empId, [])
      out.get(empId)!.push(record)
    }
    return out
  }

  private groupByEmployeeAndDay(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows: any[],
    empCol: string,
    dateCol: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Map<number, Map<string, any[]>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = new Map<number, Map<string, any[]>>()
    for (const r of rows) {
      const empId = Number(r[empCol])
      const date = DateTime.fromJSDate(new Date(r[dateCol])).toFormat('yyyy-LL-dd')
      if (!out.has(empId)) out.set(empId, new Map())
      const dayMap = out.get(empId)!
      if (!dayMap.has(date)) dayMap.set(date, [])
      dayMap.get(date)!.push(r)
    }
    return out
  }

  // Convierte filas crudas de shift_exceptions JOIN exception_types al shape
  // que el código existente espera (con .exceptionType anidado y camelCase).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private groupExceptionsByEmployeeAndDay(rows: any[]): Map<number, Map<string, any[]>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = new Map<number, Map<string, any[]>>()
    for (const r of rows) {
      const empId = Number(r.employee_id)
      const date = DateTime.fromJSDate(new Date(r.shift_exceptions_date)).toFormat('yyyy-LL-dd')
      const shaped = {
        shiftExceptionId: Number(r.shift_exception_id),
        employeeId: Number(r.employee_id),
        exceptionTypeId: Number(r.exception_type_id),
        shiftExceptionsDate: r.shift_exceptions_date,
        shiftExceptionDescription: r.shift_exception_description,
        shiftExceptionCheckInTime: r.shift_exception_check_in_time,
        shiftExceptionCheckOutTime: r.shift_exception_check_out_time,
        shiftExceptionEnjoymentOfSalary: r.shift_exception_enjoyment_of_salary,
        shiftExceptionTimeByTime: r.shift_exception_time_by_time,
        workDisabilityPeriodId: r.work_disability_period_id ?? null,
        exceptionType: {
          exceptionTypeId: r.et_id !== null && r.et_id !== undefined ? Number(r.et_id) : null,
          exceptionTypeSlug: r.et_slug ?? null,
          exceptionTypeTypeName: r.et_name ?? null,
          exceptionTypeIsGeneral: r.et_is_general !== null && r.et_is_general !== undefined ? Number(r.et_is_general) : 0,
        },
      }
      if (!out.has(empId)) out.set(empId, new Map())
      const dayMap = out.get(empId)!
      if (!dayMap.has(date)) dayMap.set(date, [])
      dayMap.get(date)!.push(shaped)
    }
    return out
  }
}

/**
 * Replica getCheckInDate/getCheckEatInDate/getCheckEatOutDate/getCheckOutDate
 * de sync_assists_service (lines 2477-2510). Asume el array ordenado por punch
 * time ascendente.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickByPosition(sorted: any[], which: 'in' | 'eatIn' | 'eatOut' | 'out'): any | null {
  const n = sorted.length
  if (n === 0) return null
  if (which === 'in') return sorted[0]
  if (which === 'eatIn') return n > 2 ? sorted[1] : null
  if (which === 'eatOut') return n > 3 ? sorted[2] : null
  // 'out': si hay más de 1, el último.
  return n > 1 ? sorted[n - 1] : null
}
