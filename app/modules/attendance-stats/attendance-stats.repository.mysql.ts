import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { I18n } from '@adonisjs/i18n'
import type { AssistDayInterface } from '../../interfaces/assist_day_interface.js'
import {
  dayKeyOf,
  nowInZone,
  shiftEndInstant,
  shiftStartInstant,
  toInstant,
  utcOffsetHours,
} from '#modules/attendance-time/attendance_clock'
import {
  bucketCheckIn,
  bucketCheckOut,
  minutesAfter,
} from '#modules/attendance-time/attendance_bucketing'
import SiteTimeZoneService from '#modules/attendance-time/site_time_zone.service'
import type {
  AttendanceTolerances,
  EmployeeSiteTimeZoneMap,
} from '#modules/attendance-time/attendance_time.interface'
import { toAbsencesBranch } from './attendance-stats.absences.js'
import type {
  AbsencesBranch,
  AttendanceStatsFilters,
  CoverageRangeLoanRow,
  EmployeeCalendarBundle,
  EmployeeInfo,
} from './dto/attendance-stats.dto.js'
import type { AttendanceStatsRepository } from './attendance-stats.repository.js'
import { getBusinessTimeZone } from '#utils/business_date'

/** Zona del sistema cuando un colaborador no trae zona resuelta. */
const DEFAULT_ZONE_FALLBACK = (): string => getBusinessTimeZone()

/** Fila cruda de `runBulkStatusQuery`: una por (colaborador, día). */
interface BulkStatusRow {
  employee_id: number | string
  day: string | Date
  shift_id: number | string | null
  shift_time_start: string | null
  shift_active_hours: number | string | null
  shift_rest_days: string | null
  first_punch_utc: string | Date | null
  last_punch_utc: string | Date | null
  punch_count: number | string
  late_arrival_time: string | null
  early_departure_time: string | null
  has_vacation_exc: number | string
  has_absence_exc: number | string
  has_nuevo_ingreso_exc: number | string
  has_skip_checkout_exc: number | string
  has_skip_checkin_exc: number | string
  has_day_excluding_exc: number | string
  is_holiday: number | string
  is_work_disability: number | string
  is_rest_day: number | string
}

/** Excepción mínima que las reglas leen por `exceptionTypeSlug`. */
interface MinimalException {
  exceptionType: { exceptionTypeSlug: string; exceptionTypeIsGeneral: number }
}

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
 * 2. Zona horaria:
 *    assists.assist_punch_time_utc es un instante UTC real (quien escribe la
 *    checada ya convirtió la hora del equipo). La hora del turno es hora civil
 *    del sitio del colaborador, cuya zona IANA resuelve `SiteTimeZoneService`
 *    (sucursal, empresa, sistema). El SQL solo usa un offset aproximado por
 *    empleado (`utc_offset`, el del inicio del rango) para la ventana de
 *    correlación de checadas, que tiene 3 h de margen; los instantes exactos del
 *    turno, el día futuro y el día de hoy se calculan en TS con la zona, así que
 *    un sitio con horario de verano (Ciudad Juárez) clasifica bien cada día.
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
  private siteTimeZones: SiteTimeZoneService

  /**
   * @param _i18n Aceptado por compatibilidad con la interfaz; esta versión no traduce.
   * @param siteTimeZones Resolutor de zona por colaborador; las pruebas inyectan uno con repositorio falso.
   */
  // eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
  constructor(_i18n: I18n, siteTimeZones?: SiteTimeZoneService) {
    this.siteTimeZones = siteTimeZones ?? new SiteTimeZoneService()
  }

  async getEmployeeCalendars(
    filters: AttendanceStatsFilters,
    allowedBusinessUnitIds: number[]
  ): Promise<EmployeeCalendarBundle[]> {
    if (allowedBusinessUnitIds.length === 0) return []

    // 1. Empleados en scope.
    const employees = await this.resolveEmployeesInScope(filters, allowedBusinessUnitIds)
    if (employees.length === 0) return []

    const employeeIds = employees.map((e) => e.employee.employeeId)

    // Zona del sitio de cada colaborador: con ella se calculan en TS los
    // instantes del turno y, aproximado, el offset de la ventana SQL.
    const zones = await this.siteTimeZones.forEmployees(employeeIds)

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
    const attendanceTolerances: AttendanceTolerances = {
      delayMinutes: Number(delay?.tolerance_minutes ?? 10),
      faultMinutes: Number(fault?.tolerance_minutes ?? 30),
    }

    // 3. THE BIG QUERY — una sola query que retorna 1 fila por (employee, day)
    // con todos los flags y datos pre-computados. El status final se bucketea
    // en TS con las tolerancias (es trivial y mantiene la SQL simple).
    const rows = await this.runBulkStatusQuery(
      employeeIds,
      filters.startDay,
      filters.endDay,
      this.groupEmployeesByUtcOffset(employeeIds, zones, filters.startDay)
    )

    // 4. Agrupar por employee y formatear como AssistDayInterface[].
    const calendarByEmployee = this.groupRowsByEmployee(rows, attendanceTolerances, zones)

    // 5. Construir bundles.
    return employees.map((emp) => ({
      employee: emp.employee,
      departmentName: emp.departmentName,
      timeZone: this.zoneOf(zones, emp.employee.employeeId),
      calendar: calendarByEmployee.get(emp.employee.employeeId) ?? [],
    }))
  }

  /** Zona IANA del colaborador; la del sistema si no se resolvió (no debería pasar). */
  private zoneOf(zones: EmployeeSiteTimeZoneMap, employeeId: number): string {
    return zones.get(employeeId)?.zone ?? DEFAULT_ZONE_FALLBACK()
  }

  /**
   * Offset aproximado por colaborador para la ventana SQL de correlación de
   * checadas: el de su zona al inicio del rango. Si el rango cruza un cambio de
   * horario de verano el error es de 1 h, dentro del margen de 3 h de la
   * ventana; la clasificación exacta no usa este valor.
   */
  private groupEmployeesByUtcOffset(
    employeeIds: number[],
    zones: EmployeeSiteTimeZoneMap,
    startDay: string
  ): Map<number, number[]> {
    const groups = new Map<number, number[]>()
    for (const employeeId of employeeIds) {
      const offset = utcOffsetHours(this.zoneOf(zones, employeeId), startDay)
      if (!groups.has(offset)) groups.set(offset, [])
      groups.get(offset)!.push(employeeId)
    }
    return groups
  }

  private async resolveEmployeesInScope(
    filters: AttendanceStatsFilters,
    allowedBusinessUnitIds: number[]
  ): Promise<Array<{ employee: EmployeeInfo; departmentName: string | null }>> {
    const q = db
      .from('employees AS e')
      .leftJoin('departments AS d', 'd.department_id', 'e.department_id')
      // Posición: se descarta el join si la posición está soft-deleted (el nombre
      // queda NULL en lugar de exponer una posición eliminada).
      .leftJoin('positions AS p', (join) => {
        join.on('p.position_id', 'e.position_id').andOnNull('p.position_deleted_at')
      })
      .leftJoin('business_units AS bu', 'bu.business_unit_id', 'e.business_unit_id')
      .leftJoin('employee_branch_offices AS ebo', (join) => {
        join
          .on('ebo.employee_id', 'e.employee_id')
          .andOnVal('ebo.employee_branch_office_active', 1)
      })
      // La sucursal base solo cuenta si es de una unidad de negocio permitida:
      // una de otra empresa no aporta nombre ni se usa como sucursal efectiva
      // en cobertura. Es leftJoin, así que no cambia las filas de los KPIs.
      .leftJoin('branch_offices AS bo', (join) => {
        join
          .on('bo.branch_office_id', 'ebo.branch_office_id')
          .andOnNull('bo.branch_office_deleted_at')
          .andOnIn('bo.business_unit_id', allowedBusinessUnitIds)
      })
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
        'e.employee_slug AS employee_slug',
        'e.employee_code AS employee_code',
        'e.employee_payroll_code AS employee_payroll_code',
        'e.employee_first_name AS employee_first_name',
        'e.employee_last_name AS employee_last_name',
        'e.employee_second_last_name AS employee_second_last_name',
        'e.employee_photo AS employee_photo',
        'e.department_id AS department_id',
        'd.department_name AS department_name',
        'd.department_alias AS department_alias',
        'e.position_id AS position_id',
        'p.position_name AS position_name',
        'p.position_alias AS position_alias',
        'e.business_unit_id AS business_unit_id',
        'bu.business_unit_name AS business_unit_name',
        'e.payroll_business_unit_id AS payroll_business_unit_id',
        // Del join a `bo`, no de `ebo`: así una sucursal base borrada o de otra
        // empresa queda en NULL en lugar de colarse como sucursal efectiva.
        'bo.branch_office_id AS branch_office_id',
        'bo.branch_office_name AS branch_office_name'
      )
      .orderBy('e.employee_first_name', 'asc')
      .orderBy('e.employee_last_name', 'asc')
      // Desempate determinista entre homónimos y entre las filas de un colaborador
      // con varias sucursales base activas; no cambia el orden por nombre.
      .orderBy('e.employee_id', 'asc')
      .orderBy('bo.branch_office_id', 'asc')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows.map((r: any) => {
      const departmentId =
        r.department_id !== null && r.department_id !== undefined ? Number(r.department_id) : null
      const positionId =
        r.position_id !== null && r.position_id !== undefined ? Number(r.position_id) : null
      const businessUnitId = Number(r.business_unit_id)
      const departmentName = r.department_name ?? null
      const branchOfficeId =
        r.branch_office_id !== null && r.branch_office_id !== undefined
          ? Number(r.branch_office_id)
          : null

      return {
        employee: {
          employeeId: Number(r.employee_id),
          employeeSlug: String(r.employee_slug ?? ''),
          employeeCode: r.employee_code ?? null,
          employeePayrollCode: r.employee_payroll_code ?? null,
          employeeFirstName: r.employee_first_name ?? null,
          employeeLastName: r.employee_last_name ?? null,
          employeeSecondLastName: r.employee_second_last_name ?? null,
          employeePhoto: r.employee_photo ?? null,
          departmentId,
          positionId,
          businessUnitId,
          payrollBusinessUnitId: Number(r.payroll_business_unit_id),
          branchOfficeId,
          branchOfficeName: r.branch_office_name ?? null,
          departmentAlias: r.department_alias ?? null,
          positionAlias: r.position_alias ?? null,
          department: departmentId !== null ? { departmentId, departmentName } : null,
          position:
            positionId !== null
              ? { positionId, positionName: r.position_name ?? null }
              : null,
          businessUnit: { businessUnitId, businessUnitName: r.business_unit_name ?? null },
        },
        departmentName,
      }
    })
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
    endDay: string,
    offsetGroups: Map<number, number[]>
  ): Promise<BulkStatusRow[]> {
    const empIdList = employeeIds.join(',')

    // utc_offset por colaborador: horas que separan la pared del sitio de UTC al
    // inicio del rango. Los ids ya están validados como enteros por el scope.
    const offsetCases = [...offsetGroups.entries()]
      .map(([offset, ids]) => `WHEN e.employee_id IN (${ids.join(',')}) THEN ${offset}`)
      .join(' ')
    const utcOffsetExpression = offsetCases.length > 0 ? `(CASE ${offsetCases} ELSE 6 END)` : '6'

    const sql = `
WITH RECURSIVE date_range AS (
  SELECT DATE(?) AS d
  UNION ALL
  SELECT DATE_ADD(d, INTERVAL 1 DAY) FROM date_range WHERE d < DATE(?)
),
emp_day AS (
  -- utc_offset: horas a sumar a la hora de pared del sitio del colaborador para
  -- llegar a UTC (aproximado: el del inicio del rango, ver groupEmployeesByUtcOffset).
  -- Solo alimenta la ventana de correlación de checadas; no clasifica.
  SELECT e.employee_id, e.employee_code, e.business_unit_id, bu.business_unit_slug, dr.d AS day,
    ${utcOffsetExpression} AS utc_offset
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
  SELECT ed.employee_id, ed.day, ed.employee_code, ed.business_unit_id, ed.business_unit_slug, ed.utc_offset,
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
  SELECT sfd.employee_id, sfd.day, sfd.employee_code, sfd.business_unit_id, sfd.business_unit_slug, s.shift_id,
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
  -- USRH1786566437097: correlacionar checadas por (empresa, código), no solo
  -- por código — evita mezclar punches de otra empresa con el mismo employee_code.
  -- Deuda conocida (2026-08-13): solo filtra assist_active = 1; no excluye
  -- assist_deleted_at — cambiarlo alteraría KPIs ya reportados (fuera de alcance).
  SELECT /*+ NO_MERGE(sfd) */ sfd.employee_id, sfd.day,
    MIN(a.assist_punch_time_utc) AS first_punch_utc,
    MAX(a.assist_punch_time_utc) AS last_punch_utc,
    COUNT(*) AS punch_count
  FROM sfd_full sfd
  INNER JOIN assists a ON a.assist_emp_code = sfd.employee_code
    AND a.business_unit_id = sfd.business_unit_id
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
  END) AS is_rest_day
  -- El día futuro, el día de hoy y los instantes esperados de entrada y salida
  -- (turno o permiso) se calculan en TS con la zona IANA del colaborador: el SQL
  -- no conoce el horario de verano de cada sitio.
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
    ]

    const result: unknown = await db.rawQuery(sql, bindings)
    // mysql2 result shape: [rows, fields]
    const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result
    return rows as BulkStatusRow[]
  }

  /**
   * Convierte las filas crudas del SQL a AssistDayInterface[] agrupados por employee_id.
   * El status (ontime/tolerance/delay/fault para check-in; equivalentes para check-out)
   * se computa aquí en TS con la zona del sitio de cada colaborador.
   */
  private groupRowsByEmployee(
    rows: BulkStatusRow[],
    tolerances: AttendanceTolerances,
    zones: EmployeeSiteTimeZoneMap
  ): Map<number, AssistDayInterface[]> {
    const out = new Map<number, AssistDayInterface[]>()
    for (const row of rows) {
      const employeeId = Number(row.employee_id)
      const day = this.formatDay(row.day)
      const zone = this.zoneOf(zones, employeeId)
      const dayInterface = this.buildAssistDayInterface(row, tolerances, day, zone)
      if (!out.has(employeeId)) out.set(employeeId, [])
      out.get(employeeId)!.push(dayInterface)
    }
    return out
  }

  private formatDay(raw: string | Date): string {
    if (typeof raw === 'string') return raw.slice(0, 10)
    if (raw instanceof Date) return raw.toISOString().slice(0, 10)
    return String(raw).slice(0, 10)
  }

  /**
   * Instante esperado de entrada: la hora del permiso late-arrival si existe,
   * si no la del turno, ambas como hora civil del sitio. `null` sin turno.
   */
  private expectedCheckIn(row: BulkStatusRow, day: string, zone: string): DateTime | null {
    if (row.shift_time_start === null) return null
    const clockTime = row.late_arrival_time ?? row.shift_time_start
    const instant = shiftStartInstant(day, String(clockTime), zone)
    return instant.isValid ? instant : null
  }

  /**
   * Instante esperado de salida: la hora del permiso early-departure si existe,
   * si no el fin del turno (inicio más horas activas). `null` sin turno.
   */
  private expectedCheckOut(row: BulkStatusRow, day: string, zone: string): DateTime | null {
    if (row.shift_time_start === null) return null
    if (row.early_departure_time !== null && row.early_departure_time !== undefined) {
      const permitted = shiftStartInstant(day, String(row.early_departure_time), zone)
      return permitted.isValid ? permitted : null
    }
    if (row.shift_active_hours === null || row.shift_active_hours === undefined) return null
    const instant = shiftEndInstant(day, String(row.shift_time_start), Number(row.shift_active_hours), zone)
    return instant.isValid ? instant : null
  }

  private buildAssistDayInterface(
    row: BulkStatusRow,
    tolerances: AttendanceTolerances,
    day: string,
    zone: string
  ): AssistDayInterface {
    const isHoliday = Number(row.is_holiday) === 1
    const isVacation = Number(row.has_vacation_exc) === 1
    const isWorkDisability = Number(row.is_work_disability) === 1
    const isRestDay = Number(row.is_rest_day) === 1
    const hasDayExcludingExc = Number(row.has_day_excluding_exc) === 1
    const hasShift = row.shift_time_start !== null

    // Día futuro: el turno del día aún no inicia en tiempo real. Cubre los días
    // posteriores y el día en curso cuyo turno todavía no comienza (turno
    // nocturno consultado por la mañana). Día de hoy: la regla "sin checkout →
    // falta" no aplica a la jornada en curso.
    const now = nowInZone(zone)
    const shiftStart = hasShift ? shiftStartInstant(day, String(row.shift_time_start), zone) : null
    const isFutureDay = shiftStart !== null && shiftStart.isValid && now.toUTC() < shiftStart
    const isToday = dayKeyOf(now, zone) === day

    let checkInStatus = ''
    let checkOutStatus = ''

    if (hasShift && !isFutureDay && !isRestDay && !isVacation && !isHoliday && !isWorkDisability && !hasDayExcludingExc) {
      // El check-out existe SOLO si hay >= 2 punches (first != last). Con 1 punch
      // ese punch es el check-in y no hubo salida — first_punch_utc === last_punch_utc
      // por el MIN/MAX, así que distinguimos con punch_count.
      const punchCount = Number(row.punch_count) || 0
      const checkOutPunch = punchCount >= 2 ? row.last_punch_utc : null
      const expectedCheckIn = this.expectedCheckIn(row, day, zone)
      const expectedCheckOut = this.expectedCheckOut(row, day, zone)

      const hasSkipCheckoutExc = Number(row.has_skip_checkout_exc) === 1
      const hasSkipCheckinExc = Number(row.has_skip_checkin_exc) === 1

      if (hasSkipCheckinExc) {
        // skip-checkin: el empleado tiene permiso de iniciar turno sin marcar
        // entrada. Si registró al menos un punch en el día → ontime; si no marcó
        // nada → fault. Replica sync_assists_service.checkInStatus.
        checkInStatus = punchCount >= 1 ? 'ontime' : 'fault'
      } else {
        // ontime/tolerance/delay/fault → solo basado en check-in vs inicio esperado.
        // El checkout NO afecta esos buckets, salvo para escalar a fault si nunca
        // se registró checkout pasados `faultMinutes` del fin de turno (regla de negocio).
        // La escalación NO aplica: (a) al día de hoy — la jornada sigue en curso;
        // (b) si el día tiene excepción skip-checkout — el empleado tiene permiso
        // de salir sin marcar, así que la salida ausente no es falta.
        checkInStatus = this.computeCheckInStatus(
          row.first_punch_utc,
          expectedCheckIn,
          tolerances,
          checkOutPunch,
          isToday || hasSkipCheckoutExc ? null : expectedCheckOut
        )
      }
      // checkOutStatus se conserva solo para el contador independiente earlyOut.
      checkOutStatus = this.computeCheckOutStatus(checkOutPunch, expectedCheckOut, tolerances)
    }

    // Construir exceptions mínimas para que `aggregateCalendar` (attendance-stats.rules) detecte
    // contadores informativos. El service usa exception_type.exception_type_slug.
    const exceptions: MinimalException[] = []
    if (Number(row.has_absence_exc) === 1) {
      exceptions.push({ exceptionType: { exceptionTypeSlug: 'absence-from-work', exceptionTypeIsGeneral: 0 } })
    }
    if (Number(row.has_nuevo_ingreso_exc) === 1) {
      exceptions.push({ exceptionType: { exceptionTypeSlug: 'nuevo-ingreso', exceptionTypeIsGeneral: 0 } })
    }
    if (isVacation) {
      exceptions.push({ exceptionType: { exceptionTypeSlug: 'vacation', exceptionTypeIsGeneral: 0 } })
    }

    // El calendario en memoria reutiliza la forma del sync; los campos que aquí
    // no aplican van nulos y el turno solo lleva lo que las reglas consumen.
    const dateShift = hasShift
      ? ({
          shiftId: row.shift_id ? Number(row.shift_id) : null,
          shiftTimeStart: row.shift_time_start,
          shiftActiveHours: row.shift_active_hours,
          shiftRestDays: row.shift_rest_days,
        } as unknown as AssistDayInterface['assist']['dateShift'])
      : null

    return {
      day,
      assist: {
        checkIn: null,
        checkOut: null,
        checkEatIn: null,
        checkEatOut: null,
        dateShift,
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
        exceptions: exceptions as unknown as AssistDayInterface['assist']['exceptions'],
        assitFlatList: [],
      },
    }
  }

  /**
   * Bucketea check-in vs inicio esperado con granularidad de MINUTO (los
   * segundos se truncan: 08:00:53 → 0 min → ontime; 08:01:00 → tolerance).
   *
   * Regla extra (negocio): si pasó >= faultMinutes del fin esperado y NO hay
   * checkout punch, el día se escala a fault aunque el check-in fuera bueno.
   * El checkout solo afecta para determinar fault, no los buckets ontime/tolerance/delay.
   */
  private computeCheckInStatus(
    firstPunchUtc: string | Date | null,
    expectedCheckIn: DateTime | null,
    tolerances: AttendanceTolerances,
    lastPunchUtc: string | Date | null,
    expectedCheckOut: DateTime | null
  ): string {
    if (!expectedCheckIn) return ''

    let status: string
    if (!firstPunchUtc) {
      status = 'fault'
    } else {
      status = bucketCheckIn(minutesAfter(expectedCheckIn, toInstant(firstPunchUtc)), tolerances)
    }

    // Regla "no checkout pasados faultMinutes del fin de turno → fault" — solo
    // escala si el día ya pasó el threshold y no hay punch de salida.
    if (status !== 'fault' && !lastPunchUtc && expectedCheckOut) {
      const checkoutDeadline = expectedCheckOut.plus({ minutes: tolerances.faultMinutes })
      if (DateTime.utc() >= checkoutDeadline) {
        status = 'fault'
      }
    }

    return status
  }

  /**
   * Misma regla que la salida del sync: `delay` = salió antes del fin esperado
   * más allá de la tolerancia (salida anticipada), `tolerance` dentro de ella.
   */
  private computeCheckOutStatus(
    lastPunchUtc: string | Date | null,
    expectedCheckOut: DateTime | null,
    tolerances: AttendanceTolerances
  ): string {
    if (!lastPunchUtc) return ''
    if (!expectedCheckOut) return ''
    const minutesEarly = minutesAfter(toInstant(lastPunchUtc), expectedCheckOut)
    return bucketCheckOut(minutesEarly, tolerances)
  }

  async getAbsencesEmployeeIds(
    startDay: string,
    endDay: string,
    allowedBusinessUnitIds: number[],
    branchOfficeIds?: number[]
  ): Promise<number[]> {
    if (allowedBusinessUnitIds.length === 0) return []

    // db.from salta el mixin de tenant: el corte por empresa va explícito. Mismo
    // criterio de plantilla que resolveEmployeesInScope (no borrados, sin
    // discriminador de asistencia = 1). Sin join a sucursales: un id por colaborador.
    const query = db
      .from('employees AS e')
      .whereNull('e.employee_deleted_at')
      .whereRaw('COALESCE(e.employee_assist_discriminator, 0) <> 1')
      .whereIn('e.business_unit_id', allowedBusinessUnitIds)

    const uniqueBranchIds = [...new Set(branchOfficeIds ?? [])]
    if (uniqueBranchIds.length > 0) {
      query.where((universe) => {
        universe
          .whereExists((base) => {
            base
              .from('employee_branch_offices AS ebo')
              .whereRaw('ebo.employee_id = e.employee_id')
              .where('ebo.employee_branch_office_active', 1)
              .whereIn('ebo.branch_office_id', uniqueBranchIds)
          })
          .orWhereExists((loan) => {
            loan
              .from('employee_temporary_assignments AS eta')
              .innerJoin('branch_offices AS source_bo', 'source_bo.branch_office_id', 'eta.source_branch_id')
              .whereRaw('eta.employee_id = e.employee_id')
              .whereIn('source_bo.business_unit_id', allowedBusinessUnitIds)
              .whereIn('eta.target_branch_id', uniqueBranchIds)
              .whereNull('eta.employee_temporary_assignment_deleted_at')
              .where('eta.start_date', '<=', endDay)
              .where('eta.end_date', '>=', startDay)
              .where((cancel) => {
                cancel.whereNull('eta.cancelled_at').orWhere('eta.cancelled_at', '>', startDay)
              })
          })
      })
    }

    const rows: Array<{ employee_id: number | string }> = await query
      .select('e.employee_id AS employee_id')
      .orderBy('e.employee_id', 'asc')

    return rows.map((row) => Number(row.employee_id))
  }

  async getAbsencesBranches(
    branchOfficeIds: number[],
    allowedBusinessUnitIds: number[]
  ): Promise<AbsencesBranch[]> {
    const uniqueIds = [...new Set(branchOfficeIds)]
    if (uniqueIds.length === 0 || allowedBusinessUnitIds.length === 0) return []

    // db.from salta el mixin de tenant: el corte por empresa va explícito sobre
    // la sucursal. La empresa contratante se lee cruda y `toAbsencesBranch`
    // decide si está viva y es del tenant.
    const rows: Array<{
      branch_office_id: number | string
      branch_office_name: string | null
      empresa_contratante_id: number | string | null
      empresa_contratante_razon_social: string | null
      empresa_contratante_business_unit_id: number | string | null
      empresa_contratante_deleted_at: Date | string | null
    }> = await db
      .from('branch_offices AS bo')
      .leftJoin('empresas_contratantes AS ec', 'ec.empresa_contratante_id', 'bo.empresa_contratante_id')
      .whereIn('bo.branch_office_id', uniqueIds)
      .whereNull('bo.branch_office_deleted_at')
      .whereIn('bo.business_unit_id', allowedBusinessUnitIds)
      .select(
        'bo.branch_office_id AS branch_office_id',
        'bo.branch_office_name AS branch_office_name',
        'ec.empresa_contratante_id AS empresa_contratante_id',
        'ec.empresa_contratante_razon_social AS empresa_contratante_razon_social',
        'ec.business_unit_id AS empresa_contratante_business_unit_id',
        'ec.empresa_contratante_deleted_at AS empresa_contratante_deleted_at'
      )

    return rows.map((row) =>
      toAbsencesBranch(
        {
          branchOfficeId: Number(row.branch_office_id),
          name: String(row.branch_office_name ?? ''),
          empresaContratante:
            row.empresa_contratante_id === null
              ? null
              : {
                  empresaContratanteId: Number(row.empresa_contratante_id),
                  razonSocial: String(row.empresa_contratante_razon_social ?? ''),
                  businessUnitId: Number(row.empresa_contratante_business_unit_id),
                  isDeleted: row.empresa_contratante_deleted_at !== null,
                },
        },
        allowedBusinessUnitIds
      )
    )
  }

  async getLoansForRange(
    employeeIds: number[],
    startDay: string,
    endDay: string,
    allowedBusinessUnitIds: number[]
  ): Promise<CoverageRangeLoanRow[]> {
    const uniqueEmployeeIds = [...new Set(employeeIds)]
    if (uniqueEmployeeIds.length === 0 || allowedBusinessUnitIds.length === 0) return []

    const rows: Array<{
      assignment_id: number | string
      employee_id: number | string
      source_branch_id: number | string
      target_branch_id: number | string
      start_date: string
      end_date: string
      cancelled_at: string | null
    }> = await db
      .from('employee_temporary_assignments AS eta')
      .innerJoin('employees AS e', 'e.employee_id', 'eta.employee_id')
      // Origen y destino deben ser sucursales de la empresa: un préstamo que
      // apunte a otra no puede mover al colaborador.
      .innerJoin('branch_offices AS source_bo', 'source_bo.branch_office_id', 'eta.source_branch_id')
      .innerJoin('branch_offices AS target_bo', 'target_bo.branch_office_id', 'eta.target_branch_id')
      .whereIn('source_bo.business_unit_id', allowedBusinessUnitIds)
      .whereIn('target_bo.business_unit_id', allowedBusinessUnitIds)
      .whereIn('e.business_unit_id', allowedBusinessUnitIds)
      .whereNull('e.employee_deleted_at')
      .whereIn('eta.employee_id', uniqueEmployeeIds)
      .whereNull('eta.employee_temporary_assignment_deleted_at')
      .where('eta.start_date', '<=', endDay)
      .where('eta.end_date', '>=', startDay)
      // Cancelado a más tardar en startDay no mueve a nadie en el rango; la
      // vigencia exacta por día se resuelve en memoria con cancelled_at.
      .where((cancel) => {
        cancel.whereNull('eta.cancelled_at').orWhere('eta.cancelled_at', '>', startDay)
      })
      .select(
        'eta.employee_temporary_assignment_id AS assignment_id',
        'eta.employee_id AS employee_id',
        'eta.source_branch_id AS source_branch_id',
        'eta.target_branch_id AS target_branch_id',
        // Fechas como texto: sin conversión de zona horaria del driver.
        db.raw("DATE_FORMAT(eta.start_date, '%Y-%m-%d') AS start_date"),
        db.raw("DATE_FORMAT(eta.end_date, '%Y-%m-%d') AS end_date"),
        db.raw("DATE_FORMAT(eta.cancelled_at, '%Y-%m-%d') AS cancelled_at")
      )
      .orderBy('eta.start_date', 'desc')
      .orderBy('eta.employee_temporary_assignment_id', 'desc')

    return rows.map((row) => ({
      assignmentId: Number(row.assignment_id),
      employeeId: Number(row.employee_id),
      sourceBranchId: Number(row.source_branch_id),
      targetBranchId: Number(row.target_branch_id),
      startDate: row.start_date,
      endDate: row.end_date,
      cancelledAt: row.cancelled_at,
    }))
  }

  async getEmployeeIdsInResponsibleScope(
    userId: number,
    employeeIds: number[],
    allowedBusinessUnitIds: number[]
  ): Promise<number[]> {
    const uniqueIds = [...new Set(employeeIds)]
    if (uniqueIds.length === 0 || allowedBusinessUnitIds.length === 0) return []

    // Mismo criterio que `NoticeService.applyRoleScope`: a cargo vigente o el
    // propio usuario. db.from salta el mixin de tenant, así que el corte por
    // empresa va explícito sobre el empleado.
    const rows: Array<{ employee_id: number | string }> = await db
      .from('employees AS e')
      .whereIn('e.employee_id', uniqueIds)
      .whereIn('e.business_unit_id', allowedBusinessUnitIds)
      .where((scoped) => {
        scoped
          .whereExists((responsible) => {
            responsible
              .from('user_responsible_employees AS ure')
              .whereRaw('ure.employee_id = e.employee_id')
              .where('ure.user_id', userId)
              .whereNull('ure.user_responsible_employee_deleted_at')
          })
          .orWhereExists((ownUser) => {
            ownUser
              .from('users AS u')
              .whereRaw('u.person_id = e.person_id')
              .where('u.user_id', userId)
          })
      })
      .select('e.employee_id AS employee_id')

    return rows.map((row) => Number(row.employee_id))
  }
}

