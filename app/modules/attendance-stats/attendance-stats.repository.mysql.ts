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
 * 2. Zona horaria / DST:
 *    assists.assist_punch_time_utc guarda la hora del biométrico, que SÍ aplica
 *    horario de verano: +5 en verano (DST) y +6 el resto del año. Por eso el
 *    turno se convierte a UTC con el mismo offset por día (ver utc_offset y
 *    computeMexicoDST). Aunque México abolió el DST civil en 2022, los relojes
 *    de los biométricos siguen registrando con DST — verificado contra datos
 *    reales (check-in de las 08:00 aparece ~14:00 en invierno y ~13:00 en verano).
 *
 * 3. Excepciones especiales:
 *    Solo una lista explícita de excepciones hace el día NO-EVALUABLE (rest-day,
 *    vacation, absence-from-work, change-shift, incapacidades — ver
 *    has_day_excluding_exc). Las demás (skip-checkin, skip-checkout, cover-shift,
 *    descanso-laborado, overtime, etc.) dejan el día evaluable. El sync tiene
 *    reglas más sutiles (ej: descanso-laborado fuerza día laboral aunque la
 *    rotación diga descanso) que aquí se simplifican.
 *
 * 4. Shift changes (employee_shift_changes):
 *    SÍ se consideran (CTE shift_change_for_day). Si un (empleado, día) tiene un
 *    cambio en el lado "from", ese día usa el shift_id_to y su descanso lo dicta
 *    date_to_is_rest_day. Replica sync_assists_service.hasOtherShift.
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

    // 2. Tolerancias desde SystemSetting (1 query).
    // - Delay: límite del bucket tolerance (1..Delay min tarde = tolerance, > Delay = delay).
    // - Fault: límite del bucket delay (Delay..Fault = delay, > Fault = fault).
    // El status se computa con granularidad de MINUTO (se truncan los segundos):
    // llegar 08:00:53 cuenta como 0 min tarde → ontime; 08:01:17 cuenta como 1 → tolerance.
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
      // Excluir empleados discriminados de asistencia (employee_assist_discriminator=1):
      // el sistema viejo nunca les asigna status (siempre ''), así que no deben
      // contar en las estadísticas. NULL/0 sí se evalúan.
      .whereRaw('COALESCE(e.employee_assist_discriminator, 0) <> 1')
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
   * - shift_change_for_day: override de turno/descanso por employee_shift_changes.
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

    // Bounds del horario de verano para el año del rango. Se pasan al SQL para
    // que utc_offset use +5 dentro de DST y +6 fuera.
    const { dstStart, dstEnd } = computeMexicoDST(Number(startDay.slice(0, 4)))

    const sql = `
WITH RECURSIVE date_range AS (
  SELECT DATE(?) AS d
  UNION ALL
  SELECT DATE_ADD(d, INTERVAL 1 DAY) FROM date_range WHERE d < DATE(?)
),
emp_day AS (
  -- utc_offset: horas a sumar a la hora local México para obtener el valor que
  -- guarda assists.assist_punch_time_utc. El biométrico registra hora local CON
  -- horario de verano: +5 en verano (DST, abr-oct) y +6 el resto del año.
  SELECT e.employee_id, e.employee_code, bu.business_unit_slug, dr.d AS day,
    (CASE WHEN dr.d BETWEEN ? AND ? THEN 5 ELSE 6 END) AS utc_offset
  FROM employees e
  CROSS JOIN date_range dr
  LEFT JOIN business_units bu ON bu.business_unit_id = e.business_unit_id
  WHERE e.employee_id IN (${empIdList})
),
shift_change_for_day AS (
  -- Cambios de turno (employee_shift_changes): para el empleado en el lado
  -- "from" del cambio, el día date_from se reasigna al shift_id_to y su descanso
  -- lo dicta date_to_is_rest_day. Cubre swaps entre empleados y cambios self
  -- (en ambos casos cada lado afectado existe como una fila con su employee_id_from).
  -- Replica sync_assists_service.hasOtherShift (1418-1457): la búsqueda es por
  -- employee_id_from + DATE(date_from); ante varias filas el sync toma la primera
  -- (orden de PK) — aquí se resuelve con MIN(id). El INNER JOIN a shifts replica
  -- el guard "if (shiftTo)" del sync: si el shift_id_to está borrado o no existe,
  -- el cambio se ignora y el día conserva su turno regular.
  SELECT esc.employee_id_from AS employee_id,
    DATE(esc.employee_shift_change_date_from) AS day,
    esc.shift_id_to AS change_shift_id,
    esc.employee_shift_change_date_to_is_rest_day AS change_is_rest_day
  FROM employee_shift_changes esc
  INNER JOIN shifts s_to ON s_to.shift_id = esc.shift_id_to
    AND s_to.shift_deleted_at IS NULL
  WHERE esc.employee_id_from IN (${empIdList})
    AND DATE(esc.employee_shift_change_date_from) BETWEEN ? AND ?
    AND esc.employee_shift_change_deleted_at IS NULL
    AND esc.employee_shift_change_id = (
      SELECT MIN(esc2.employee_shift_change_id)
      FROM employee_shift_changes esc2
      WHERE esc2.employee_id_from = esc.employee_id_from
        AND DATE(esc2.employee_shift_change_date_from) = DATE(esc.employee_shift_change_date_from)
        AND esc2.employee_shift_change_deleted_at IS NULL
    )
),
shift_for_day AS (
  -- Turno vigente del día = el employee_shift NO BORRADO con apply_since más
  -- reciente <= día. El filtro employe_shifts_deleted_at IS NULL es crítico:
  -- replica whereNull('deletedAt') de ShiftForEmployeeService.getEmployeeShifts.
  -- Sin él, un turno borrado con apply_since posterior gana sobre el vigente
  -- (ej: emp con rotación re-asignada — la fila vieja queda soft-deleted).
  -- Desempate por created_at DESC: si dos turnos comparten apply_since, gana el
  -- creado más recientemente (matchea getEmployeeShifts, que ordena por createdAt).
  SELECT ed.employee_id, ed.day, ed.employee_code, ed.business_unit_slug, ed.utc_offset,
    (SELECT es2.employee_shift_id FROM employee_shifts es2
      WHERE es2.employee_id = ed.employee_id
        AND es2.employe_shifts_deleted_at IS NULL
        AND DATE(es2.employe_shifts_apply_since) <= ed.day
      ORDER BY es2.employe_shifts_apply_since DESC, es2.employe_shifts_created_at DESC
      LIMIT 1) AS employee_shift_id
  FROM emp_day ed
),
sfd_full AS (
  -- Pre-computamos la ventana del turno en UTC (DST-aware vía utc_offset) para
  -- cada (emp, día). shift_start_utc / shift_end_utc son la base SIN permisos —
  -- sirven para correlacionar punches con el turno (clave para turnos cross-day:
  -- el check-out de un turno nocturno cae al día siguiente pero pertenece a este
  -- shift_day). apply_since + shift_calculate_flag se usan para resolver turnos
  -- rotativos (24x48, 12x36, etc.) en el cálculo de is_rest_day.
  SELECT sfd.employee_id, sfd.day, sfd.employee_code, sfd.business_unit_slug, s.shift_id,
    sfd.utc_offset,
    s.shift_time_start, s.shift_active_hours, s.shift_rest_days,
    s.shift_calculate_flag,
    DATE(es.employe_shifts_apply_since) AS apply_since,
    -- Override por cambio de turno: has_shift_change marca que el día fue
    -- reasignado, change_is_rest_day dicta el descanso de ese día.
    (CASE WHEN scd.change_shift_id IS NOT NULL THEN 1 ELSE 0 END) AS has_shift_change,
    scd.change_is_rest_day AS change_is_rest_day,
    (CASE WHEN s.shift_time_start IS NULL THEN NULL
      ELSE TIMESTAMPADD(HOUR, sfd.utc_offset,
        TIMESTAMP(sfd.day, s.shift_time_start))
    END) AS shift_start_utc,
    (CASE WHEN s.shift_time_start IS NULL OR s.shift_active_hours IS NULL THEN NULL
      ELSE TIMESTAMPADD(SECOND, ROUND(s.shift_active_hours * 3600),
        TIMESTAMPADD(HOUR, sfd.utc_offset,
          TIMESTAMP(sfd.day, s.shift_time_start)))
    END) AS shift_end_utc,
    -- day_start_utc / day_end_utc = medianoche 00:00:00 y 23:59:59 del día
    -- calendario México convertidos a UTC. Definen la ventana "día calendario"
    -- para correlacionar punches en turnos diurnos (ver punches_for_shift).
    TIMESTAMPADD(HOUR, sfd.utc_offset,
      TIMESTAMP(sfd.day, '00:00:00')) AS day_start_utc,
    TIMESTAMPADD(HOUR, sfd.utc_offset,
      TIMESTAMP(sfd.day, '23:59:59')) AS day_end_utc
  FROM shift_for_day sfd
  LEFT JOIN shift_change_for_day scd
    ON scd.employee_id = sfd.employee_id AND scd.day = sfd.day
  LEFT JOIN employee_shifts es ON es.employee_shift_id = sfd.employee_shift_id
  -- El turno efectivo es el del cambio (change_shift_id) si existe, si no el regular.
  LEFT JOIN shifts s ON s.shift_id = COALESCE(scd.change_shift_id, es.shift_id)
),
punches_for_shift AS (
  -- Correlaciona punches con un (empleado, día). La ventana depende de si el
  -- turno cruza la medianoche (TIME_TO_SEC(start) + active_hours*3600 > 86400):
  --
  --   * Turno DIURNO (no cruza medianoche): ventana = día calendario completo
  --     [day_start_utc, day_end_utc]. Replica el agrupamiento por día calendario
  --     del sistema viejo — captura punches que caen lejos de la hora del turno
  --     (ej: empleado con turno 13:00 que marca a las 07:00; el sync lo cuenta).
  --   * Turno CROSS-DAY (nocturno): ventana = [shift_start - 3h, shift_end + 3h].
  --     No se extiende a day_start porque el check-out cae al día siguiente y
  --     ampliar el límite inferior duplicaría punches con el turno vecino.
  -- NO_MERGE(sfd): obliga a materializar sfd_full UNA vez (~4k filas) en lugar de
  -- re-evaluarla por cada fila de assists. Sin el hint, MySQL fusiona sfd_full
  -- en este join y resuelve turno/cambio-de-turno millones de veces (la consulta
  -- pasaba de ~5s a ~25s+). Materializada, los lookups corren ~4k veces.
  SELECT /*+ NO_MERGE(sfd) */ sfd.employee_id, sfd.day,
    MIN(a.assist_punch_time_utc) AS first_punch_utc,
    MAX(a.assist_punch_time_utc) AS last_punch_utc,
    COUNT(*) AS punch_count
  FROM sfd_full sfd
  INNER JOIN assists a ON a.assist_emp_code = sfd.employee_code
    AND a.assist_active = 1
    AND a.assist_punch_time_utc >= (CASE
      WHEN (TIME_TO_SEC(sfd.shift_time_start) + sfd.shift_active_hours * 3600) > 86400
        THEN DATE_SUB(sfd.shift_start_utc, INTERVAL 3 HOUR)
      ELSE LEAST(DATE_SUB(sfd.shift_start_utc, INTERVAL 3 HOUR), sfd.day_start_utc)
    END)
    AND a.assist_punch_time_utc <= GREATEST(
      DATE_ADD(sfd.shift_end_utc, INTERVAL 3 HOUR),
      sfd.day_end_utc
    )
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
    AND DATE(se.shift_exceptions_date) BETWEEN ? AND ?
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
    AND DATE(se.shift_exceptions_date) BETWEEN ? AND ?
    AND se.employee_id IN (${empIdList})
  GROUP BY se.employee_id, day
),
exception_flags AS (
  -- has_day_excluding_exc: excepciones que hacen el día NO-EVALUABLE para los
  -- buckets ontime/tolerance/delay/fault. Es una lista EXPLÍCITA — casi todas
  -- las exception_types tienen is_general=0, así que filtrar por is_general
  -- excluiría días que el sistema viejo sí evalúa (ej: skip-checkin/skip-checkout,
  -- overtime, cover-shift — el empleado sí trabajó, su check-in cuenta).
  SELECT se.employee_id, DATE(se.shift_exceptions_date) AS day,
    MAX(CASE WHEN et.exception_type_slug = 'vacation' THEN 1 ELSE 0 END) AS has_vacation_exc,
    MAX(CASE WHEN et.exception_type_slug = 'absence-from-work' THEN 1 ELSE 0 END) AS has_absence_exc,
    MAX(CASE WHEN et.exception_type_slug = 'nuevo-ingreso' THEN 1 ELSE 0 END) AS has_nuevo_ingreso_exc,
    MAX(CASE WHEN et.exception_type_slug = 'skip-checkout' THEN 1 ELSE 0 END) AS has_skip_checkout_exc,
    MAX(CASE WHEN et.exception_type_slug = 'skip-checkin' THEN 1 ELSE 0 END) AS has_skip_checkin_exc,
    MAX(CASE WHEN et.exception_type_slug IN (
      'rest-day', 'vacation', 'absence-from-work', 'change-shift',
      'falta-por-incapacidad', 'incapacidad-por-maternidad', 'nuevo-ingreso'
    ) THEN 1 ELSE 0 END) AS has_day_excluding_exc
  FROM shift_exceptions se
  INNER JOIN exception_types et ON et.exception_type_id = se.exception_type_id
  WHERE se.shift_exceptions_deleted_at IS NULL
    AND DATE(se.shift_exceptions_date) BETWEEN ? AND ?
    AND se.employee_id IN (${empIdList})
  GROUP BY se.employee_id, day
),
holiday_for_day AS (
  -- Solo holidays que son DESCANSO OFICIAL (holiday_is_official_rest_day=1).
  -- Los que no lo son (observancias, eventos) NO excluyen el día — el sync los
  -- trata como workHoliday (día laborable). Se conserva holiday_business_units
  -- para filtrar por unidad de negocio del empleado en el SELECT final.
  SELECT DATE(h.holiday_date) AS day, h.holiday_business_units
  FROM holidays h
  WHERE DATE(h.holiday_date) BETWEEN ? AND ?
    AND h.holiday_is_official_rest_day = 1
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
SELECT /*+ NO_MERGE(sfd_full) */
  sfd_full.employee_id, sfd_full.day, sfd_full.shift_id,
  sfd_full.shift_time_start, sfd_full.shift_active_hours, sfd_full.shift_rest_days,
  p.first_punch_utc, p.last_punch_utc, COALESCE(p.punch_count, 0) AS punch_count,
  lap.check_in_time AS late_arrival_time,
  edp.check_out_time AS early_departure_time,
  COALESCE(ef.has_vacation_exc, 0) AS has_vacation_exc,
  COALESCE(ef.has_absence_exc, 0) AS has_absence_exc,
  COALESCE(ef.has_nuevo_ingreso_exc, 0) AS has_nuevo_ingreso_exc,
  COALESCE(ef.has_skip_checkout_exc, 0) AS has_skip_checkout_exc,
  COALESCE(ef.has_skip_checkin_exc, 0) AS has_skip_checkin_exc,
  COALESCE(ef.has_day_excluding_exc, 0) AS has_day_excluding_exc,
  -- is_holiday: existe un holiday oficial-rest en este día Y aplica a la unidad
  -- de negocio del empleado (holiday_business_units vacío = aplica a todas).
  (CASE WHEN EXISTS (
    SELECT 1 FROM holiday_for_day hfd
    WHERE hfd.day = sfd_full.day
      AND (hfd.holiday_business_units IS NULL OR hfd.holiday_business_units = ''
           OR sfd_full.business_unit_slug IS NULL
           OR FIND_IN_SET(sfd_full.business_unit_slug, hfd.holiday_business_units) > 0)
  ) THEN 1 ELSE 0 END) AS is_holiday,
  COALESCE(wd.is_work_disability, 0) AS is_work_disability,
  -- is_rest_day: si el día tiene cambio de turno, el descanso lo dicta el cambio
  -- (change_is_rest_day) — tiene prioridad sobre la rotación/shift_rest_days.
  -- Para turnos rotativos (24x48, 12x36, etc.) el descanso depende del ciclo desde
  -- apply_since; para turnos fijos depende de shift_rest_days (CSV de días de
  -- semana, luxon convention 1=lun..7=dom). Replica calendarDayStatus +
  -- hasOtherShift de sync_assists_service.ts:2558-2592 / 1418-1457.
  (CASE
    WHEN sfd_full.has_shift_change = 1 THEN COALESCE(sfd_full.change_is_rest_day, 0)
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
  -- is_future_day: el turno del día AÚN NO INICIA en tiempo real (ahora < inicio).
  -- Un día "futuro" no cuenta como falta: cubre días calendario posteriores y el
  -- día en curso cuyo turno todavía no comenzó (ej: turno nocturno consultado por
  -- la mañana).
  --
  -- OJO — aquí NO se usa shift_start_utc. Ese valor lleva el offset DST del
  -- biométrico (+5 en verano) para alinearse con assist_punch_time_utc, que vive
  -- en ese "UTC falso" 1 h atrasado del UTC real. Pero UTC_TIMESTAMP() es UTC
  -- real, y la hora del turno es hora civil de México (UTC-6 fijo desde que se
  -- abolió el DST civil en 2022). Comparar UTC real contra shift_start_utc (+5)
  -- adelantaba el inicio del turno 1 h en verano y marcaba falta a empleados
  -- cuyo turno aún no empezaba. Por eso el instante real de inicio se calcula
  -- con +6 (offset civil), no con utc_offset.
  (CASE WHEN sfd_full.shift_time_start IS NOT NULL
        AND UTC_TIMESTAMP() < TIMESTAMPADD(HOUR, 6, TIMESTAMP(sfd_full.day, sfd_full.shift_time_start))
        THEN 1 ELSE 0 END) AS is_future_day,
  -- is_today: el día en curso. La regla "sin checkout → fault" NO aplica a hoy
  -- (la jornada no terminó y el sync puede tener lag en traer la salida).
  (CASE WHEN sfd_full.day = DATE(?) THEN 1 ELSE 0 END) AS is_today,
  -- expected_check_in_utc = shift_start_utc base (de sfd_full), o la hora del
  -- permiso late-arrival convertida a UTC (offset fijo UTC-6) si existe.
  (CASE
    WHEN sfd_full.shift_start_utc IS NULL THEN NULL
    WHEN lap.check_in_time IS NOT NULL
      THEN TIMESTAMPADD(HOUR,
        sfd_full.utc_offset,
        TIMESTAMP(sfd_full.day, lap.check_in_time))
    ELSE sfd_full.shift_start_utc
  END) AS expected_check_in_utc,
  -- expected_check_out_utc = shift_end_utc base (de sfd_full), o la hora del
  -- permiso early-departure convertida a UTC (offset fijo UTC-6) si existe.
  (CASE
    WHEN sfd_full.shift_end_utc IS NULL THEN NULL
    WHEN edp.check_out_time IS NOT NULL
      THEN TIMESTAMPADD(HOUR,
        sfd_full.utc_offset,
        TIMESTAMP(sfd_full.day, edp.check_out_time))
    ELSE sfd_full.shift_end_utc
  END) AS expected_check_out_utc
FROM sfd_full
LEFT JOIN punches_for_shift p ON p.employee_id = sfd_full.employee_id AND p.day = sfd_full.day
LEFT JOIN late_arrival_perm lap ON lap.employee_id = sfd_full.employee_id AND lap.day = sfd_full.day
LEFT JOIN early_departure_perm edp ON edp.employee_id = sfd_full.employee_id AND edp.day = sfd_full.day
LEFT JOIN exception_flags ef ON ef.employee_id = sfd_full.employee_id AND ef.day = sfd_full.day
LEFT JOIN work_disab_for_day wd ON wd.employee_id = sfd_full.employee_id AND wd.day = sfd_full.day
ORDER BY sfd_full.employee_id, sfd_full.day
`

    const bindings = [
      `${startDay}`,
      `${endDay}`,
      `${dstStart}`,
      `${dstEnd}`,
      `${startDay}`,
      `${endDay}`,
      `${startDay}`,
      `${endDay}`,
      `${startDay}`,
      `${endDay}`,
      `${startDay}`,
      `${endDay}`,
      `${startDay}`,
      `${endDay}`,
      `${today}`,
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
    const isToday = Number(r.is_today) === 1
    const hasDayExcludingExc = Number(r.has_day_excluding_exc) === 1
    const hasShift = r.shift_time_start !== null

    let checkInStatus = ''
    let checkOutStatus = ''

    if (hasShift && !isFutureDay && !isRestDay && !isVacation && !isHoliday && !isWorkDisability && !hasDayExcludingExc) {
      // El check-out existe SOLO si hay >= 2 punches (first != last). Con 1 punch
      // ese punch es el check-in y no hubo salida — first_punch_utc === last_punch_utc
      // por el MIN/MAX, así que distinguimos con punch_count.
      const punchCount = Number(r.punch_count) || 0
      const checkOutPunch = punchCount >= 2 ? r.last_punch_utc : null

      const hasSkipCheckoutExc = Number(r.has_skip_checkout_exc) === 1
      const hasSkipCheckinExc = Number(r.has_skip_checkin_exc) === 1

      if (hasSkipCheckinExc) {
        // skip-checkin: el empleado tiene permiso de iniciar turno sin marcar
        // entrada. Si registró al menos un punch en el día → ontime; si no marcó
        // nada → fault. Replica sync_assists_service.checkInStatus (1896-1917).
        checkInStatus = punchCount >= 1 ? 'ontime' : 'fault'
      } else {
        // ontime/tolerance/delay/fault → solo basado en check-in vs shift_start.
        // El checkout NO afecta esos buckets, salvo para escalar a fault si nunca
        // se registró checkout pasados 30 min del fin de turno (regla negocio Willy).
        // La escalación NO aplica: (a) al día de hoy — la jornada sigue en curso;
        // (b) si el día tiene excepción skip-checkout — el empleado tiene permiso
        // de salir sin marcar, así que la salida ausente no es falta.
        checkInStatus = this.computeCheckInStatus(
          r.first_punch_utc,
          r.expected_check_in_utc,
          toleranceDelay,
          toleranceFault,
          checkOutPunch,
          isToday || hasSkipCheckoutExc ? null : r.expected_check_out_utc
        )
      }
      // checkOutStatus se conserva solo para el contador independiente earlyOut.
      checkOutStatus = this.computeCheckOutStatus(
        checkOutPunch,
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
        hasExceptions: hasDayExcludingExc,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        exceptions: exceptions as any,
        assitFlatList: [],
      },
    }
  }

  /**
   * Bucketea check-in vs shift_start_efectivo con granularidad de MINUTO.
   * El diff se mide contra shift_start y se trunca con Math.floor — los segundos
   * no cuentan (08:00:53 → 0 min):
   * - diff <= 0 min: ontime (llegar antes y el primer minuto, 08:00:00–08:00:59)
   * - 1 min .. toleranceDelay (10 default): tolerance
   * - toleranceDelay+1 .. toleranceFault (30 default): delay
   * - > toleranceFault: fault
   *
   * Regla extra (negocio): si pasó >= toleranceFault min del expected_check_out_utc
   * y NO hay checkout punch, el día se escala a fault aunque el check-in fuera bueno.
   * El checkout solo afecta para determinar fault, no los buckets ontime/tolerance/delay.
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
      // Math.floor trunca los segundos: el minuto incompleto no cuenta como
      // tardanza. ontime cubre el primer minuto del turno (08:00:00–08:00:59);
      // desde 08:01:00 ya es tolerance. Sin gracia adicional.
      const diffMinutes = Math.floor(
        (new Date(firstPunchUtc).getTime() - new Date(expectedCheckInUtc).getTime()) / 60000
      )
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
 * Computa los bounds del horario de verano para un año dado.
 * Replica sync_assists_service.getMexicoDSTChangeDates: inicio = primer domingo
 * de abril, fin = último domingo de octubre.
 *
 * Los relojes de los biométricos registran las marcaciones aplicando DST: dentro
 * de esta ventana el offset efectivo es UTC-5, fuera de ella UTC-6. Por eso el
 * turno (hora local) se convierte a UTC con el offset correspondiente al día.
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
