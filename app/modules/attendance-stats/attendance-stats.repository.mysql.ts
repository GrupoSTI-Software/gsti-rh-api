import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { I18n } from '@adonisjs/i18n'
import type { AssistDayInterface } from '../../interfaces/assist_day_interface.js'
import type {
  AttendanceStatsFilters,
  EmployeeCalendarBundle,
  EmployeeInfo,
} from './dto/attendance-stats.dto.js'
import type { AttendanceStatsRepository } from './attendance-stats.repository.js'

/**
 * Implementación MySQL del repositorio — versión SQL puro.
 *
 * Hace TODOS los cómputos en SQL (uno solo query) y devuelve los AssistDayInterface[]
 * compatibles con la estructura que ya consume el service. Esto evita las llamadas
 * per-empleado a syncAssistsService.getEmployeeCalendar que tomaban ~7s para 153
 * empleados — esperamos <1s.
 *
 * Trade-offs deliberados (documentados):
 *
 * 1. Cross-day shifts (turnos nocturnos 21:00 → 09:00):
 *    El check-out del día siguiente se atribuye al día calendario en que se marcó.
 *    Para un turno 21:00 → 05:00 que marca salida a las 05:00 del día X+1, ese
 *    check_out queda asociado a día X+1 (no a día X). En la versión sync el algoritmo
 *    de calculateRawCalendar lo re-atribuía al día del shift_start. Para attendance
 *    aggregate este impacto es marginal (los counters totales sobre el período
 *    son los mismos, solo la atribución per-día cambia).
 *
 * 2. DST:
 *    Se usa offset fijo UTC-6 (Mexico CST). En transiciones de DST (primer domingo
 *    de abril, último domingo de octubre) habrá diferencias de 1 hora respecto al
 *    sync. Impacto: 2 días al año por empleado. Aceptable.
 *
 * 3. Excepciones especiales (skip-checkin, cover-shift, descanso-laborado,
 *    apply-sunday-bonus, error-de-horario-en-sistema):
 *    Cualquier excepción donde exception_type.is_general=0 hace el día NO-EVALUABLE
 *    (igual que la versión bulk anterior). El sync tiene reglas más sutiles
 *    (ej: skip-checkin convierte fault en ontime si hay ≥1 otro punch) que aquí
 *    se simplifican.
 *
 * 4. Shift changes (employee_shift_changes):
 *    NO se considera por ahora. El día usa el shift asignado en employee_shifts.
 *    Para empleados que cambian de turno mid-día, el resultado puede diferir.
 *
 * Si necesitas paridad 100%, usar la versión anterior bulk-load + getEmployeeCalendar.
 */
export default class AttendanceStatsRepositoryMysql implements AttendanceStatsRepository {
  // i18n se acepta por compatibilidad con la interfaz (constructor toma i18n)
  // aunque esta versión SQL-puro no lo usa (no se llaman strings traducidos).
  // eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
  constructor(_i18n: I18n) {}

  async getEmployeeCalendars(
    filters: AttendanceStatsFilters,
    allowedBusinessUnitIds: number[]
  ): Promise<EmployeeCalendarBundle[]> {
    if (allowedBusinessUnitIds.length === 0) return []

    // 1. Empleados en scope.
    const employees = await this.resolveEmployeesInScope(filters, allowedBusinessUnitIds)
    if (employees.length === 0) return []

    const employeeIds = employees.map((e) => e.employee.employeeId)

    // 2. Tolerancias desde SystemSetting (cached opcional, aquí 1 query).
    const tolerances = await db
      .from('tolerances')
      .innerJoin('system_settings', 'system_settings.system_setting_id', 'tolerances.system_setting_id')
      .where('system_settings.system_setting_active', 1)
      .whereNull('tolerances.tolerance_deleted_at')
      .whereNull('system_settings.system_setting_deleted_at')
      .whereIn('tolerances.tolerance_name', ['Delay', 'Fault'])
      .select('tolerances.tolerance_name', 'tolerances.tolerance_minutes')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delay = tolerances.find((t: any) => t.tolerance_name === 'Delay')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fault = tolerances.find((t: any) => t.tolerance_name === 'Fault')
    const TOLERANCE_DELAY = delay?.tolerance_minutes ?? 10
    const TOLERANCE_FAULT = fault?.tolerance_minutes ?? 30

    // 3. THE BIG QUERY — una sola query que retorna 1 fila por (employee, day)
    // con todos los flags y datos pre-computados. El status final se bucketea
    // en TS con las tolerancias (es trivial y mantiene la SQL simple).
    const rows = await this.runBulkStatusQuery(
      employeeIds,
      filters.startDay,
      filters.endDay
    )

    // 4. Agrupar por employee y formatear como AssistDayInterface[].
    const calendarByEmployee = this.groupRowsByEmployee(rows, TOLERANCE_DELAY, TOLERANCE_FAULT)

    // 5. Construir bundles.
    return employees.map((emp) => ({
      employee: emp.employee,
      departmentName: emp.departmentName,
      calendar: calendarByEmployee.get(emp.employee.employeeId) ?? [],
    }))
  }

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
   * THE BIG QUERY — devuelve 1 fila por (employee_id, day) con todos los flags
   * y el status efectivo (considerando permisos de late-arrival/early-departure).
   *
   * Estructura:
   * - date_range: recursive CTE para enumerar los días [startDay, endDay].
   * - emp_day: cross-join empleados × días.
   * - shift_for_day: para cada (emp, day), el último employee_shift aplicable.
   * - punches: agregado de punches por (emp_code, mexico_day) con first/last.
   * - exceptions_for_day: agregado de excepciones por (emp_id, day) con flags por tipo.
   * - hol_for_day: holidays por día.
   * - work_disab_for_day: incapacidades cubriendo el día.
   * - final SELECT: combina todo + CASE WHEN para status.
   */
  private async runBulkStatusQuery(
    employeeIds: number[],
    startDay: string,
    endDay: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any[]> {
    const empIdList = employeeIds.join(',')
    const today = DateTime.now().setZone('UTC-6').toFormat('yyyy-LL-dd')

    // Mexico DST: primer domingo de abril a último domingo de octubre.
    // Replica sync_assists_service.getMexicoDSTChangeDates (líneas 187-196 de
    // employee_assist_calendar_service.ts). En DST Mexico es UTC-5 (CDT), fuera
    // de DST es UTC-6 (CST). Calculamos los bounds para el año del rango y
    // los pasamos al SQL para que el CASE WHEN use el offset correcto.
    const dstYear = Number(startDay.slice(0, 4))
    const { dstStart, dstEnd } = computeMexicoDST(dstYear)

    const sql = `
WITH RECURSIVE date_range AS (
  SELECT DATE(?) AS d
  UNION ALL
  SELECT DATE_ADD(d, INTERVAL 1 DAY) FROM date_range WHERE d < DATE(?)
),
emp_day AS (
  SELECT e.employee_id, e.employee_code, dr.d AS day
  FROM employees e
  CROSS JOIN date_range dr
  WHERE e.employee_id IN (${empIdList})
),
shift_for_day AS (
  SELECT ed.employee_id, ed.day, ed.employee_code,
    (SELECT es2.employee_shift_id FROM employee_shifts es2
      WHERE es2.employee_id = ed.employee_id
        AND DATE(es2.employe_shifts_apply_since) <= ed.day
      ORDER BY es2.employe_shifts_apply_since DESC LIMIT 1) AS employee_shift_id
  FROM emp_day ed
),
sfd_full AS (
  -- Pre-computamos la ventana del turno en UTC (DST-aware) para cada (emp, día).
  -- shift_start_utc / shift_end_utc son la base SIN permisos — sirven para
  -- correlacionar punches con el turno (clave para turnos cross-day: el check-out
  -- de un turno nocturno cae al día siguiente pero pertenece a este shift_day).
  -- apply_since + shift_calculate_flag se usan para resolver turnos rotativos
  -- (24x48, 12x36, etc.) en el cálculo de is_rest_day.
  SELECT sfd.employee_id, sfd.day, sfd.employee_code, s.shift_id,
    s.shift_time_start, s.shift_active_hours, s.shift_rest_days,
    s.shift_calculate_flag,
    DATE(es.employe_shifts_apply_since) AS apply_since,
    (CASE WHEN s.shift_time_start IS NULL THEN NULL
      ELSE TIMESTAMPADD(HOUR, CASE WHEN sfd.day BETWEEN ? AND ? THEN 5 ELSE 6 END,
        TIMESTAMP(sfd.day, s.shift_time_start))
    END) AS shift_start_utc,
    (CASE WHEN s.shift_time_start IS NULL OR s.shift_active_hours IS NULL THEN NULL
      ELSE TIMESTAMPADD(SECOND, ROUND(s.shift_active_hours * 3600),
        TIMESTAMPADD(HOUR, CASE WHEN sfd.day BETWEEN ? AND ? THEN 5 ELSE 6 END,
          TIMESTAMP(sfd.day, s.shift_time_start)))
    END) AS shift_end_utc
  FROM shift_for_day sfd
  LEFT JOIN employee_shifts es ON es.employee_shift_id = sfd.employee_shift_id
  LEFT JOIN shifts s ON s.shift_id = es.shift_id
),
punches_for_shift AS (
  -- Correlaciona punches con la VENTANA DEL TURNO (no con el día calendario).
  -- Ventana = [shift_start - 3h, shift_end + 3h]. Para turnos cross-day, shift_end
  -- ya cae al día siguiente, así el check-out se atribuye al shift_day correcto.
  -- Margen ±3h captura entradas/salidas tempranas o tardías.
  SELECT sfd.employee_id, sfd.day,
    MIN(a.assist_punch_time_utc) AS first_punch_utc,
    MAX(a.assist_punch_time_utc) AS last_punch_utc,
    COUNT(*) AS punch_count
  FROM sfd_full sfd
  INNER JOIN assists a ON a.assist_emp_code = sfd.employee_code
    AND a.assist_active = 1
    AND a.assist_punch_time_utc >= DATE_SUB(sfd.shift_start_utc, INTERVAL 3 HOUR)
    AND a.assist_punch_time_utc <= DATE_ADD(sfd.shift_end_utc, INTERVAL 3 HOUR)
  WHERE sfd.shift_start_utc IS NOT NULL
  GROUP BY sfd.employee_id, sfd.day
),
late_arrival_perm AS (
  SELECT se.employee_id, DATE(se.shift_exceptions_date) AS day,
    MIN(se.shift_exception_check_in_time) AS check_in_time
  FROM shift_exceptions se
  INNER JOIN exception_types et ON et.exception_type_id = se.exception_type_id
  WHERE et.exception_type_slug = 'late-arrival'
    AND se.shift_exceptions_deleted_at IS NULL
    AND se.shift_exceptions_date BETWEEN ? AND ?
    AND se.employee_id IN (${empIdList})
  GROUP BY se.employee_id, day
),
early_departure_perm AS (
  SELECT se.employee_id, DATE(se.shift_exceptions_date) AS day,
    MAX(se.shift_exception_check_out_time) AS check_out_time
  FROM shift_exceptions se
  INNER JOIN exception_types et ON et.exception_type_id = se.exception_type_id
  WHERE et.exception_type_slug = 'early-departure'
    AND se.shift_exceptions_deleted_at IS NULL
    AND se.shift_exceptions_date BETWEEN ? AND ?
    AND se.employee_id IN (${empIdList})
  GROUP BY se.employee_id, day
),
exception_flags AS (
  SELECT se.employee_id, DATE(se.shift_exceptions_date) AS day,
    MAX(CASE WHEN et.exception_type_slug = 'vacation' THEN 1 ELSE 0 END) AS has_vacation_exc,
    MAX(CASE WHEN et.exception_type_slug = 'absence-from-work' THEN 1 ELSE 0 END) AS has_absence_exc,
    MAX(CASE WHEN et.exception_type_slug = 'nuevo-ingreso' THEN 1 ELSE 0 END) AS has_nuevo_ingreso_exc,
    MAX(CASE WHEN et.exception_type_is_general = 0 THEN 1 ELSE 0 END) AS has_non_general_exc
  FROM shift_exceptions se
  INNER JOIN exception_types et ON et.exception_type_id = se.exception_type_id
  WHERE se.shift_exceptions_deleted_at IS NULL
    AND se.shift_exceptions_date BETWEEN ? AND ?
    AND se.employee_id IN (${empIdList})
  GROUP BY se.employee_id, day
),
holiday_for_day AS (
  SELECT DATE(h.holiday_date) AS day, MAX(1) AS is_holiday
  FROM holidays h
  WHERE h.holiday_date BETWEEN ? AND ?
  GROUP BY day
),
work_disab_for_day AS (
  SELECT wd.employee_id, dr.d AS day, MAX(1) AS is_work_disability
  FROM work_disability_periods wdp
  INNER JOIN work_disabilities wd ON wd.work_disability_id = wdp.work_disability_id
  INNER JOIN date_range dr ON dr.d BETWEEN DATE(wdp.work_disability_period_start_date) AND DATE(wdp.work_disability_period_end_date)
  WHERE wd.employee_id IN (${empIdList})
    AND wdp.work_disability_period_deleted_at IS NULL
  GROUP BY wd.employee_id, dr.d
)
SELECT
  sfd_full.employee_id, sfd_full.day, sfd_full.shift_id,
  sfd_full.shift_time_start, sfd_full.shift_active_hours, sfd_full.shift_rest_days,
  p.first_punch_utc, p.last_punch_utc,
  lap.check_in_time AS late_arrival_time,
  edp.check_out_time AS early_departure_time,
  COALESCE(ef.has_vacation_exc, 0) AS has_vacation_exc,
  COALESCE(ef.has_absence_exc, 0) AS has_absence_exc,
  COALESCE(ef.has_nuevo_ingreso_exc, 0) AS has_nuevo_ingreso_exc,
  COALESCE(ef.has_non_general_exc, 0) AS has_non_general_exc,
  COALESCE(hfd.is_holiday, 0) AS is_holiday,
  COALESCE(wd.is_work_disability, 0) AS is_work_disability,
  -- is_rest_day: para turnos rotativos (24x48, 12x36, etc.) el descanso depende
  -- del ciclo desde apply_since; para turnos fijos depende de shift_rest_days (CSV
  -- de días de semana, luxon convention 1=lun..7=dom). Replica calendarDayStatus
  -- de sync_assists_service.ts:2558-2592.
  (CASE
    WHEN sfd_full.shift_calculate_flag = '24x48'
      THEN (CASE WHEN MOD(DATEDIFF(sfd_full.day, sfd_full.apply_since), 3) IN (1, 2) THEN 1 ELSE 0 END)
    WHEN sfd_full.shift_calculate_flag = '12x36'
      THEN (CASE WHEN MOD(DATEDIFF(sfd_full.day, sfd_full.apply_since), 2) = 1 THEN 1 ELSE 0 END)
    WHEN sfd_full.shift_calculate_flag = '24x24'
      THEN (CASE WHEN MOD(DATEDIFF(sfd_full.day, sfd_full.apply_since), 2) = 1 THEN 1 ELSE 0 END)
    WHEN sfd_full.shift_calculate_flag = 'doble-12x48'
      THEN (CASE WHEN MOD(DATEDIFF(sfd_full.day, sfd_full.apply_since), 4) IN (2, 3) THEN 1 ELSE 0 END)
    WHEN sfd_full.shift_rest_days IS NOT NULL
      AND FIND_IN_SET(WEEKDAY(sfd_full.day) + 1, sfd_full.shift_rest_days) > 0
    THEN 1
    ELSE 0
  END) AS is_rest_day,
  -- is_future_day: comparado contra hoy en Mexico
  (CASE WHEN sfd_full.day > DATE(?) THEN 1 ELSE 0 END) AS is_future_day,
  -- expected_check_in_utc = shift_start_utc base (de sfd_full), o la hora del
  -- permiso late-arrival convertida a UTC (DST-aware) si existe.
  (CASE
    WHEN sfd_full.shift_start_utc IS NULL THEN NULL
    WHEN lap.check_in_time IS NOT NULL
      THEN TIMESTAMPADD(HOUR,
        CASE WHEN sfd_full.day BETWEEN ? AND ? THEN 5 ELSE 6 END,
        TIMESTAMP(sfd_full.day, lap.check_in_time))
    ELSE sfd_full.shift_start_utc
  END) AS expected_check_in_utc,
  -- expected_check_out_utc = shift_end_utc base (de sfd_full), o la hora del
  -- permiso early-departure convertida a UTC (DST-aware) si existe.
  (CASE
    WHEN sfd_full.shift_end_utc IS NULL THEN NULL
    WHEN edp.check_out_time IS NOT NULL
      THEN TIMESTAMPADD(HOUR,
        CASE WHEN sfd_full.day BETWEEN ? AND ? THEN 5 ELSE 6 END,
        TIMESTAMP(sfd_full.day, edp.check_out_time))
    ELSE sfd_full.shift_end_utc
  END) AS expected_check_out_utc
FROM sfd_full
LEFT JOIN punches_for_shift p ON p.employee_id = sfd_full.employee_id AND p.day = sfd_full.day
LEFT JOIN late_arrival_perm lap ON lap.employee_id = sfd_full.employee_id AND lap.day = sfd_full.day
LEFT JOIN early_departure_perm edp ON edp.employee_id = sfd_full.employee_id AND edp.day = sfd_full.day
LEFT JOIN exception_flags ef ON ef.employee_id = sfd_full.employee_id AND ef.day = sfd_full.day
LEFT JOIN holiday_for_day hfd ON hfd.day = sfd_full.day
LEFT JOIN work_disab_for_day wd ON wd.employee_id = sfd_full.employee_id AND wd.day = sfd_full.day
ORDER BY sfd_full.employee_id, sfd_full.day
`

    const bindings = [
      startDay, endDay,                  // date_range
      dstStart, dstEnd,                  // sfd_full shift_start_utc DST
      dstStart, dstEnd,                  // sfd_full shift_end_utc DST
      startDay, endDay,                  // late_arrival
      startDay, endDay,                  // early_departure
      startDay, endDay,                  // exception_flags
      startDay, endDay,                  // holiday
      today,                             // is_future_day comparison
      dstStart, dstEnd,                  // expected_check_in (late_arrival branch)
      dstStart, dstEnd,                  // expected_check_out (early_departure branch)
    ]

    const result = await db.rawQuery(sql, bindings)
    // mysql2 result shape: [rows, fields]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = Array.isArray(result) ? (result[0] as any[]) : (result as any[])
    return rows
  }

  /**
   * Convierte las filas crudas del SQL a AssistDayInterface[] agrupados por employee_id.
   * El status (ontime/tolerance/delay/fault para check-in; equivalentes para check-out)
   * se computa aquí en TS porque MySQL no permite condicionales encadenadas elegantes.
   */
  private groupRowsByEmployee(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows: any[],
    toleranceDelay: number,
    toleranceFault: number
  ): Map<number, AssistDayInterface[]> {
    const out = new Map<number, AssistDayInterface[]>()
    for (const r of rows) {
      const empId = Number(r.employee_id)
      const day = this.formatDay(r.day)
      const dayInterface = this.buildAssistDayInterface(r, toleranceDelay, toleranceFault, day)
      if (!out.has(empId)) out.set(empId, [])
      out.get(empId)!.push(dayInterface)
    }
    return out
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private formatDay(raw: any): string {
    if (typeof raw === 'string') return raw.slice(0, 10)
    if (raw instanceof Date) return raw.toISOString().slice(0, 10)
    return String(raw).slice(0, 10)
  }

  private buildAssistDayInterface(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r: any,
    toleranceDelay: number,
    toleranceFault: number,
    day: string
  ): AssistDayInterface {
    const isHoliday = Number(r.is_holiday) === 1
    const isVacation = Number(r.has_vacation_exc) === 1
    const isWorkDisability = Number(r.is_work_disability) === 1
    const isRestDay = Number(r.is_rest_day) === 1
    const isFutureDay = Number(r.is_future_day) === 1
    const hasNonGeneralExc = Number(r.has_non_general_exc) === 1
    const hasShift = r.shift_time_start !== null

    let checkInStatus = ''
    let checkOutStatus = ''

    if (hasShift && !isFutureDay && !isRestDay && !isVacation && !isHoliday && !isWorkDisability && !hasNonGeneralExc) {
      // ontime/tolerance/delay/fault → solo basado en check-in vs shift_start.
      // El checkout NO afecta esos buckets, salvo para escalar a fault si nunca
      // se registró checkout pasados 30 min del fin de turno (regla negocio Willy).
      checkInStatus = this.computeCheckInStatus(
        r.first_punch_utc,
        r.expected_check_in_utc,
        toleranceDelay,
        toleranceFault,
        r.last_punch_utc,
        r.expected_check_out_utc
      )
      // checkOutStatus se conserva solo para el contador independiente earlyOut.
      checkOutStatus = this.computeCheckOutStatus(
        r.last_punch_utc,
        r.expected_check_out_utc,
        toleranceDelay
      )
    }

    // Construir exceptions mínimas para que `aggregateCalendar` del service detecte
    // contadores informativos. El service usa exception_type.exception_type_slug.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exceptions: any[] = []
    if (Number(r.has_absence_exc) === 1) {
      exceptions.push({ exceptionType: { exceptionTypeSlug: 'absence-from-work', exceptionTypeIsGeneral: 0 } })
    }
    if (Number(r.has_nuevo_ingreso_exc) === 1) {
      exceptions.push({ exceptionType: { exceptionTypeSlug: 'nuevo-ingreso', exceptionTypeIsGeneral: 0 } })
    }
    if (isVacation) {
      exceptions.push({ exceptionType: { exceptionTypeSlug: 'vacation', exceptionTypeIsGeneral: 0 } })
    }

    return {
      day,
      assist: {
        checkIn: null,
        checkOut: null,
        checkEatIn: null,
        checkEatOut: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dateShift: hasShift ? ({
          shiftId: r.shift_id ? Number(r.shift_id) : null,
          shiftTimeStart: r.shift_time_start,
          shiftActiveHours: r.shift_active_hours,
          shiftRestDays: r.shift_rest_days,
        } as any) : null,
        dateShiftApplySince: null,
        employeeShiftId: null,
        shiftCalculateFlag: '',
        checkInDateTime: null,
        checkOutDateTime: null,
        checkInStatus,
        checkOutStatus,
        isFutureDay,
        isSundayBonus: false,
        isRestDay,
        isVacationDate: isVacation,
        isWorkDisabilityDate: isWorkDisability,
        isHoliday,
        isBirthday: false,
        holiday: null,
        hasExceptions: hasNonGeneralExc,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        exceptions: exceptions as any,
        assitFlatList: [],
      },
    }
  }

  /**
   * Bucketea check-in vs shift_start_efectivo.
   * - 0 o negativo (o llegó antes del shift): ontime
   * - 1 a toleranceDelay (10 min default): tolerance
   * - toleranceDelay+1 a toleranceFault (30 min default): delay
   * - > toleranceFault (>30 min): fault
   *
   * Regla extra (negocio): si pasó >= 30 min del expected_check_out_utc y NO hay
   * checkout punch, el día se escala a fault aunque el check-in fuera bueno.
   * Esto es lo que pidió Willy: el checkout solo afecta para determinar fault,
   * no influye en los buckets de ontime/tolerance/delay.
   */
  private computeCheckInStatus(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    firstPunchUtc: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expectedCheckInUtc: any,
    toleranceDelay: number,
    toleranceFault: number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lastPunchUtc: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expectedCheckOutUtc: any
  ): string {
    if (!expectedCheckInUtc) return ''

    let status: string
    if (!firstPunchUtc) {
      status = 'fault'
    } else {
      const diffMinutes =
        (new Date(firstPunchUtc).getTime() - new Date(expectedCheckInUtc).getTime()) / 60000
      if (diffMinutes > toleranceFault) status = 'fault'
      else if (diffMinutes > toleranceDelay) status = 'delay'
      else if (diffMinutes <= 0) status = 'ontime'
      else status = 'tolerance'
    }

    // Regla "no checkout pasados 30 min del fin de turno → fault" — solo
    // escala si el día ya pasó el threshold y no hay punch de salida.
    if (status !== 'fault' && !lastPunchUtc && expectedCheckOutUtc) {
      const now = Date.now()
      const checkoutDeadline =
        new Date(expectedCheckOutUtc).getTime() + toleranceFault * 60000
      if (now >= checkoutDeadline) {
        status = 'fault'
      }
    }

    return status
  }

  /**
   * Replica la lógica de sync_assists_service.checkOutStatus (lines 2100-2110).
   * diffMinutes > 0 = salió antes del fin del turno (= early-out → 'delay' en el modelo).
   */
  private computeCheckOutStatus(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lastPunchUtc: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expectedCheckOutUtc: any,
    toleranceDelay: number
  ): string {
    if (!lastPunchUtc) return ''
    if (!expectedCheckOutUtc) return ''
    const punchTime = new Date(lastPunchUtc).getTime()
    const expectedTime = new Date(expectedCheckOutUtc).getTime()
    const diffMinutes = (expectedTime - punchTime) / 60000
    if (diffMinutes > toleranceDelay) return 'delay'
    if (diffMinutes > 0) return 'tolerance'
    return 'ontime'
  }
}

/**
 * Computa los bounds del horario de verano en México para un año dado.
 * Replica sync_assists_service.getMexicoDSTChangeDates (líneas 187-196).
 *
 * - Inicio DST: primer domingo de abril
 * - Fin DST:    último domingo de octubre
 *
 * Durante DST Mexico opera en CDT (UTC-5); fuera de DST en CST (UTC-6).
 */
function computeMexicoDST(year: number): { dstStart: string; dstEnd: string } {
  // Primer domingo de abril.
  const aprilFirst = new Date(Date.UTC(year, 3, 1))
  const aprilFirstDow = aprilFirst.getUTCDay() // 0=Sun..6=Sat
  const dstStartDate = new Date(Date.UTC(year, 3, 1 + ((7 - aprilFirstDow) % 7)))

  // Último domingo de octubre.
  const octLast = new Date(Date.UTC(year, 9, 31))
  const octLastDow = octLast.getUTCDay()
  const dstEndDate = new Date(Date.UTC(year, 9, 31 - octLastDow))

  return {
    dstStart: dstStartDate.toISOString().slice(0, 10),
    dstEnd: dstEndDate.toISOString().slice(0, 10),
  }
}
