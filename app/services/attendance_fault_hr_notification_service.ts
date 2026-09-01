import Employee from '#models/employee'
import { resolvePublicAssetUrl } from '#helpers/public_asset_url'
import SystemSetting from '#models/system_setting'
import BusinessUnit from '#models/business_unit'
import Tolerance from '#models/tolerance'
import {
  ATTENDANCE_FAULT_HR_ROLE_SLUGS,
  ATTENDANCE_FAULT_HR_TEST_ROLE_SLUG,
} from '#constants/attendance_fault_hr_notification'
import AssistsService from '#services/assist_service'
import mail from '@adonisjs/mail/services/main'
import { resolveMailSender } from '#helpers/resolve_mail_sender'
import Database from '@adonisjs/lucid/services/db'
import i18nManager from '@adonisjs/i18n/services/main'
import { DateTime } from 'luxon'

export interface AttendanceFaultHrNotifyRow {
  employeeAssistCalendarId: number
  employeeId: number
  day: string
  shiftTimeStart: string
  shiftName: string | null
}

export interface AttendanceFaultHrRunOptions {
  /** Simula faltas para todos los elegibles del día y envía solo al rol de prueba (sin insertar log). */
  test?: boolean
}

export type AttendanceFaultHrSkipReason =
  | 'disabled'
  | 'no_business_units'
  | 'no_recipients'
  | 'no_pending'
  | 'no_employees'
  | 'mail_error'
  | 'process_error'

export type AttendanceFaultHrProcessSettingResult =
  | { sent: true; count: number }
  | { sent: false; reason: AttendanceFaultHrSkipReason; error?: string }

export type AttendanceFaultHrSettingRunResult = {
  systemSettingId: number
  tradeName: string
} & AttendanceFaultHrProcessSettingResult

export type AttendanceFaultHrRunResult = {
  sent: boolean
  count: number
  processedSettings: number
  sentSettings: number
  failedSettings: number
  skippedSettings: number
  results: AttendanceFaultHrSettingRunResult[]
  reason?: 'no_system_setting' | AttendanceFaultHrSkipReason
  error?: string
}

export interface ResolveActiveSystemSettingsOptions {
  /** Si es false, incluye settings aunque el flag de faltas esté apagado (modo prueba). */
  requireAttendanceFaultFlag?: boolean
}

/**
 * Destinatarios: solo por rol (y usuario activo con empleado vinculado + `user_email`).
 * Empleados evaluados: todos los activos en las unidades del system setting con turno asignado
 * y fila de calendario para “hoy” (se genera la fila faltante vía sync antes de evaluar).
 */
export default class AttendanceFaultHrNotificationService {
  /**
   * Indica si el setting tiene al menos una unidad de negocio entre los slugs permitidos.
   */
  private settingMatchesAllowedBusinessUnits(
    setting: SystemSetting,
    allowedBusinessUnitSlugs: string[]
  ): boolean {
    const units = setting.systemSettingBusinessUnits
      ? setting.systemSettingBusinessUnits.split(',').map((u: string) => u.trim())
      : []
    return units.some((u) => allowedBusinessUnitSlugs.includes(u))
  }

  /**
   * Resuelve el system setting activo cuyas unidades de negocio tengan al menos
   * una coincidencia con los slugs permitidos (resolvedor central del scope de tenant).
   * Devuelve el primer match en el orden de la consulta (comportamiento legacy de una sola empresa).
   */
  resolveActiveSystemSetting(systemSettings: SystemSetting[], allowedBusinessUnitSlugs: string[]): SystemSetting | null {
    if (allowedBusinessUnitSlugs.length === 0) {
      return null
    }
    for (const setting of systemSettings) {
      if (setting.systemSettingActive === 1 && this.settingMatchesAllowedBusinessUnits(setting, allowedBusinessUnitSlugs)) {
        return setting
      }
    }
    return null
  }

  /**
   * Resuelve todos los system settings activos con notificación de faltas a RH habilitada
   * y al menos una unidad de negocio entre los slugs permitidos, en orden estable por id.
   */
  resolveActiveSystemSettings(
    systemSettings: SystemSetting[],
    allowedBusinessUnitSlugs: string[],
    options?: ResolveActiveSystemSettingsOptions
  ): SystemSetting[] {
    if (allowedBusinessUnitSlugs.length === 0) {
      return []
    }

    const requireFlag = options?.requireAttendanceFaultFlag !== false

    return systemSettings
      .filter((setting) => {
        if (setting.systemSettingActive !== 1) {
          return false
        }
        if (requireFlag && !setting.systemSettingAttendanceFaultHrEmails) {
          return false
        }
        return this.settingMatchesAllowedBusinessUnits(setting, allowedBusinessUnitSlugs)
      })
      .sort((a, b) => a.systemSettingId - b.systemSettingId)
  }

  async getFaultToleranceMinutes(systemSettingId: number): Promise<number> {
    const fault = await Tolerance.query()
      .whereNull('tolerance_deleted_at')
      .where('system_setting_id', systemSettingId)
      .where('tolerance_name', 'Fault')
      .first()
    return fault?.toleranceMinutes ?? 30
  }

  /**
   * Empleados activos (no dados de baja) en unidades del ajuste, con calendario del día,
   * sin entrada, plazo Fault vencido y sin registro previo en log. No usa rol: solo BU del system setting.
   */
  async fetchPendingFaultRows(
    calendarDay: string,
    businessUnitSlugs: string[],
    faultOffsetMinutes: number
  ): Promise<AttendanceFaultHrNotifyRow[]> {
    if (businessUnitSlugs.length === 0) {
      return []
    }

    const slugPlaceholders = businessUnitSlugs.map(() => '?').join(', ')
    const slugBindings = businessUnitSlugs.map((s) => s.toLowerCase())

    const rows = await Database.from('employee_assist_calendars as eac')
      .innerJoin('employees as e', 'e.employee_id', 'eac.employee_id')
      .innerJoin('business_units as bu', 'bu.business_unit_id', 'e.business_unit_id')
      .innerJoin('shifts as s', 's.shift_id', 'eac.shift_id')
      .whereNull('eac.employee_assist_calendar_deleted_at')
      .whereNull('e.employee_deleted_at')
      .where((q) => {
        q.whereNull('e.employee_terminated_date').orWhereRaw('DATE(e.employee_terminated_date) > ?', [
          calendarDay,
        ])
      })
      .whereNull('bu.business_unit_deleted_at')
      .whereNull('s.shift_deleted_at')
      .where('eac.day', calendarDay)
      .whereNull('eac.check_in_assist_id')
      .whereNotNull('eac.shift_id')
      .where('eac.is_rest_day', 0)
      .where('eac.is_holiday', 0)
      .where('eac.is_vacation_date', 0)
      .where('eac.is_work_disability_date', 0)
      .whereRaw(`LOWER(TRIM(bu.business_unit_slug)) IN (${slugPlaceholders})`, slugBindings)
      .whereRaw(
        `NOT EXISTS (
          SELECT 1 FROM attendance_fault_hr_notification_logs l
          WHERE l.employee_assist_calendar_id = eac.employee_assist_calendar_id
        )`
      )
      .whereRaw(
        `UTC_TIMESTAMP() > TIMESTAMPADD(MINUTE, ?, CONVERT_TZ(
          STR_TO_DATE(CONCAT(eac.day, ' ', TIME_FORMAT(s.shift_time_start, '%H:%i:%s')), '%Y-%m-%d %H:%i:%s'),
          '-06:00', '+00:00'
        ))`,
        [faultOffsetMinutes]
      )
      .orderBy('e.employee_last_name', 'asc')
      .orderBy('e.employee_first_name', 'asc')
      .orderBy('eac.employee_assist_calendar_id', 'asc')
      .select(
        'eac.employee_assist_calendar_id as employeeAssistCalendarId',
        'eac.employee_id as employeeId',
        'eac.day as day',
        Database.raw('TIME_FORMAT(s.shift_time_start, \'%H:%i:%s\') as shiftTimeStart'),
        's.shift_name as shiftName'
      )

    return rows as AttendanceFaultHrNotifyRow[]
  }

  /**
   * Igual criterio de elegibilidad que `fetchPendingFaultRows`, pero sin exigir plazo Fault vencido
   * ni excluir filas ya registradas en log (para simular “todos con falta” en modo prueba).
   */
  async fetchTestPendingFaultRows(
    calendarDay: string,
    businessUnitSlugs: string[]
  ): Promise<AttendanceFaultHrNotifyRow[]> {
    if (businessUnitSlugs.length === 0) {
      return []
    }

    const slugPlaceholders = businessUnitSlugs.map(() => '?').join(', ')
    const slugBindings = businessUnitSlugs.map((s) => s.toLowerCase())

    const rows = await Database.from('employee_assist_calendars as eac')
      .innerJoin('employees as e', 'e.employee_id', 'eac.employee_id')
      .innerJoin('business_units as bu', 'bu.business_unit_id', 'e.business_unit_id')
      .innerJoin('shifts as s', 's.shift_id', 'eac.shift_id')
      .whereNull('eac.employee_assist_calendar_deleted_at')
      .whereNull('e.employee_deleted_at')
      .where((q) => {
        q.whereNull('e.employee_terminated_date').orWhereRaw('DATE(e.employee_terminated_date) > ?', [
          calendarDay,
        ])
      })
      .whereNull('bu.business_unit_deleted_at')
      .whereNull('s.shift_deleted_at')
      .where('eac.day', calendarDay)
      .whereNull('eac.check_in_assist_id')
      .whereNotNull('eac.shift_id')
      .where('eac.is_rest_day', 0)
      .where('eac.is_holiday', 0)
      .where('eac.is_vacation_date', 0)
      .where('eac.is_work_disability_date', 0)
      .whereRaw(`LOWER(TRIM(bu.business_unit_slug)) IN (${slugPlaceholders})`, slugBindings)
      .orderBy('e.employee_last_name', 'asc')
      .orderBy('e.employee_first_name', 'asc')
      .orderBy('eac.employee_assist_calendar_id', 'asc')
      .select(
        'eac.employee_assist_calendar_id as employeeAssistCalendarId',
        'eac.employee_id as employeeId',
        'eac.day as day',
        Database.raw('TIME_FORMAT(s.shift_time_start, \'%H:%i:%s\') as shiftTimeStart'),
        's.shift_name as shiftName'
      )

    return rows as AttendanceFaultHrNotifyRow[]
  }

  /**
   * Empleados en las unidades del ajuste, con turno asignado, activos y sin fila de calendario para `calendarDay`.
   */
  async findEmployeeIdsMissingCalendar(
    calendarDay: string,
    businessUnitSlugs: string[]
  ): Promise<number[]> {
    if (businessUnitSlugs.length === 0) {
      return []
    }
    const slugPh = businessUnitSlugs.map(() => '?').join(', ')
    const slugLower = businessUnitSlugs.map((s) => s.toLowerCase())
    const bindings = [calendarDay, ...slugLower, calendarDay]
    const sql = `
      SELECT DISTINCT e.employee_id AS employeeId
      FROM employees e
      INNER JOIN business_units bu ON bu.business_unit_id = e.business_unit_id AND bu.business_unit_deleted_at IS NULL
      LEFT JOIN employee_assist_calendars eac ON eac.employee_id = e.employee_id
        AND eac.day = ?
        AND eac.employee_assist_calendar_deleted_at IS NULL
      WHERE e.employee_deleted_at IS NULL
        AND LOWER(TRIM(bu.business_unit_slug)) IN (${slugPh})
        AND (e.employee_terminated_date IS NULL OR DATE(e.employee_terminated_date) > ?)
        AND eac.employee_assist_calendar_id IS NULL
        AND EXISTS (
          SELECT 1 FROM employee_shifts es
          WHERE es.employee_id = e.employee_id AND es.employe_shifts_deleted_at IS NULL
        )
    `
    const result = await Database.rawQuery(sql, bindings)
    const pack = result[0] as { employeeId: number }[]
    return pack.map((r) => Number(r.employeeId))
  }

  /**
   * Genera filas en `employee_assist_calendars` para el día vía el mismo sync que el resto del sistema.
   */
  async ensureEmployeeAssistCalendarsForDay(
    calendarDay: string,
    businessUnitSlugs: string[],
    logger?: { info: (m: string) => void; error: (m: string) => void }
  ): Promise<void> {
    const missingIds = await this.findEmployeeIdsMissingCalendar(calendarDay, businessUnitSlugs)
    if (missingIds.length === 0) {
      return
    }

    const i18n = i18nManager.locale(i18nManager.defaultLocale)
    const assistsService = new AssistsService(i18n)
    const dateJs = DateTime.fromFormat(calendarDay, 'yyyy-MM-dd', { zone: 'UTC-6' }).toJSDate()

    let ok = 0
    const chunkSize = 8
    for (let i = 0; i < missingIds.length; i += chunkSize) {
      const chunk = missingIds.slice(i, i + chunkSize)
      const chunkResults = await Promise.all(
        chunk.map(async (employeeId) => {
          try {
            await assistsService.updateAssistCalendar(employeeId, dateJs)
            return true
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err)
            logger?.error?.(`Sincronizar calendario empleado ${employeeId}: ${msg}`)
            return false
          }
        })
      )
      ok += chunkResults.filter(Boolean).length
    }

    logger?.info?.(
      `Calendario de asistencia para ${calendarDay}: ${missingIds.length} empleado(s) sin fila previa; sincronización correcta: ${ok}`
    )
  }

  /**
   * Un empleado no debe aparecer dos veces si hubiera más de una fila de calendario el mismo día.
   */
  dedupePendingByEmployeeId(pending: AttendanceFaultHrNotifyRow[]): AttendanceFaultHrNotifyRow[] {
    const byEmployee = new Map<number, AttendanceFaultHrNotifyRow>()
    for (const row of pending) {
      if (!byEmployee.has(row.employeeId)) {
        byEmployee.set(row.employeeId, row)
      }
    }
    return [...byEmployee.values()]
  }

  /**
   * `user_email` de usuarios activos con rol permitido y empleado asociado (`person_id`).
   * No filtra por unidad de negocio: el alcance del correo lo define solo el rol.
   */
  async fetchHrRecipientUserEmails(): Promise<string[]> {
    if (ATTENDANCE_FAULT_HR_ROLE_SLUGS.length === 0) {
      return []
    }

    const roleSlugsLower = ATTENDANCE_FAULT_HR_ROLE_SLUGS.map((s) => s.toLowerCase().trim())
    const rolePlaceholders = roleSlugsLower.map(() => '?').join(', ')

    const rows = await Database.from('users as u')
      .innerJoin('roles as r', 'r.role_id', 'u.role_id')
      .innerJoin('employees as e', 'e.person_id', 'u.person_id')
      .whereNull('u.user_deleted_at')
      .where('u.user_active', 1)
      .whereNotNull('u.user_email')
      .whereRaw('TRIM(u.user_email) <> \'\'')
      .whereNull('r.role_deleted_at')
      .where('r.role_active', 1)
      .whereNull('e.employee_deleted_at')
      .whereRaw(`LOWER(TRIM(r.role_slug)) IN (${rolePlaceholders})`, roleSlugsLower)
      .select(Database.raw('DISTINCT TRIM(u.user_email) as email'))

    const seen = new Set<string>()
    const out: string[] = []
    for (const row of rows as { email: string }[]) {
      const raw = row.email ? String(row.email).trim() : ''
      if (!raw) {
        continue
      }
      const key = raw.toLowerCase()
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      out.push(raw)
    }
    return out.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
  }

  /**
   * Correos de usuarios activos con un rol concreto (slug), empleado asociado y `user_email`.
   */
  async fetchRecipientUserEmailsByRoleSlug(roleSlug: string): Promise<string[]> {
    const slugLower = roleSlug.trim().toLowerCase()
    if (!slugLower) {
      return []
    }

    const rows = await Database.from('users as u')
      .innerJoin('roles as r', 'r.role_id', 'u.role_id')
      .innerJoin('employees as e', 'e.person_id', 'u.person_id')
      .whereNull('u.user_deleted_at')
      .where('u.user_active', 1)
      .whereNotNull('u.user_email')
      .whereRaw('TRIM(u.user_email) <> \'\'')
      .whereNull('r.role_deleted_at')
      .where('r.role_active', 1)
      .whereNull('e.employee_deleted_at')
      .whereRaw('LOWER(TRIM(r.role_slug)) = ?', [slugLower])
      .select(Database.raw('DISTINCT TRIM(u.user_email) as email'))

    const seen = new Set<string>()
    const out: string[] = []
    for (const row of rows as { email: string }[]) {
      const raw = row.email ? String(row.email).trim() : ''
      if (!raw) {
        continue
      }
      const key = raw.toLowerCase()
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      out.push(raw)
    }
    return out.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
  }

  formatSidebarColor(color: string): string {
    const c = color?.trim() || '333333'
    return c.startsWith('#') ? c : `#${c}`
  }

  /**
   * URL de la foto para la plantilla del correo. Vacia cuando la referencia es
   * un objeto privado: un cliente de correo no puede autenticarse, y componerla
   * con `APP_URL` solo producia una imagen rota. La plantilla ya degrada con
   * `@if(emp.photoUrl)`.
   */
  resolvePhotoUrl(photo: string | null): string {
    return resolvePublicAssetUrl(photo) ?? ''
  }

  /**
   * Misma noción de “sucursales en el sistema” que la API (unidades del scope central, no eliminadas).
   */
  async hasAtLeastOneBranchOfficeInAllowedBusinessUnits(
    allowedBusinessUnitIds: number[]
  ): Promise<boolean> {
    if (allowedBusinessUnitIds.length === 0) {
      return false
    }
    const row = await Database.from('branch_offices')
      .whereNull('branch_office_deleted_at')
      .whereIn('business_unit_id', allowedBusinessUnitIds)
      .limit(1)
      .select(Database.raw('1 as ok'))
      .first()
    return row !== null
  }

  /**
   * Nombre de sucursal activa por empleado (mismo criterio que `whereHas('activeEmployeeBranchOffice')` + sucursal vigente en listados).
   */
  async loadActiveBranchOfficeNamesByEmployeeIds(
    employeeIds: number[],
    allowedBusinessUnitIds: number[]
  ): Promise<Map<number, string>> {
    const map = new Map<number, string>()
    if (employeeIds.length === 0 || allowedBusinessUnitIds.length === 0) {
      return map
    }
    const unique = [...new Set(employeeIds)]
    const rows = await Database.from('employee_branch_offices as ebo')
      .innerJoin('branch_offices as bo', 'bo.branch_office_id', 'ebo.branch_office_id')
      .whereNull('bo.branch_office_deleted_at')
      .whereIn('ebo.employee_id', unique)
      .where('ebo.employee_branch_office_active', 1)
      .whereIn('bo.business_unit_id', allowedBusinessUnitIds)
      .orderBy('ebo.employee_branch_office_id', 'desc')
      .select(
        'ebo.employee_id as employeeId',
        'bo.branch_office_name as branchOfficeName'
      )

    for (const r of rows as { employeeId: number; branchOfficeName: string }[]) {
      const id = Number(r.employeeId)
      if (!map.has(id)) {
        map.set(id, String(r.branchOfficeName ?? '').trim())
      }
    }
    return map
  }

  /**
   * Carga empleados para el correo en una sola consulta con relaciones necesarias.
   */
  async loadEmployeesForEmail(employeeIds: number[]) {
    if (employeeIds.length === 0) {
      return []
    }
    const unique = [...new Set(employeeIds)]
    return Employee.query()
      .whereIn('employeeId', unique)
      .whereNull('employee_deleted_at')
      .preload('department')
      .preload('position')
      .preload('businessUnit')
  }

  /**
   * Procesa un system setting de punta a punta: faltas pendientes, correo y log de deduplicación.
   */
  private async processSetting(
    systemSetting: SystemSetting,
    context: {
      isTest: boolean
      log: {
        info: (m: string) => void
        error: (m: string) => void
        warning: (m: string) => void
      }
    }
  ): Promise<AttendanceFaultHrProcessSettingResult> {
    const { isTest, log } = context
    const settingLabel = `${systemSetting.systemSettingTradeName} (id ${systemSetting.systemSettingId})`

    if (!isTest && !systemSetting.systemSettingAttendanceFaultHrEmails) {
      log.info(`Notificaciones de falta por asistencia a RH deshabilitadas en ${settingLabel}`)
      return { sent: false, reason: 'disabled' }
    }

    if (isTest && !systemSetting.systemSettingAttendanceFaultHrEmails) {
      log.info(
        `Modo prueba (${settingLabel}): se omite la desactivación de notificaciones en ajustes del sistema para poder enviar el correo de prueba`
      )
    }

    const faultMinutes = await this.getFaultToleranceMinutes(systemSetting.systemSettingId)
    const faultOffsetMinutes = 1 + faultMinutes

    const nowCst = DateTime.now().setZone('UTC-6')
    const calendarDay = nowCst.toFormat('yyyy-MM-dd')
    const businessUnitSlugs = (systemSetting.systemSettingBusinessUnits || '')
      .split(',')
      .map((u) => u.trim().toLowerCase())
      .filter(Boolean)

    if (businessUnitSlugs.length === 0) {
      log.warning(`${settingLabel}: el system setting no tiene unidades de negocio configuradas`)
      return { sent: false, reason: 'no_business_units' }
    }

    const recipients = isTest
      ? await this.fetchRecipientUserEmailsByRoleSlug(ATTENDANCE_FAULT_HR_TEST_ROLE_SLUG)
      : await this.fetchHrRecipientUserEmails()

    if (recipients.length === 0) {
      log.warning(
        isTest
          ? `${settingLabel}: no hay destinatarios de prueba con rol "${ATTENDANCE_FAULT_HR_TEST_ROLE_SLUG}", empleado asociado y user_email`
          : `${settingLabel}: no hay destinatarios con roles configurados, empleado asociado y user_email`
      )
      return { sent: false, reason: 'no_recipients' }
    }

    await this.ensureEmployeeAssistCalendarsForDay(calendarDay, businessUnitSlugs, log)

    const pendingRaw = isTest
      ? await this.fetchTestPendingFaultRows(calendarDay, businessUnitSlugs)
      : await this.fetchPendingFaultRows(calendarDay, businessUnitSlugs, faultOffsetMinutes)
    const pending = this.dedupePendingByEmployeeId(pendingRaw)
    if (pending.length === 0) {
      log.info(
        isTest
          ? `${settingLabel}: modo prueba sin colaboradores elegibles sin entrada hoy`
          : `${settingLabel}: sin faltas nuevas por registro de asistencia para notificar`
      )
      return { sent: false, reason: 'no_pending' }
    }

    if (isTest) {
      log.info(
        `${settingLabel}: modo prueba con ${pending.length} colaborador(es) en la simulación (sin plazo Fault ni exclusión por log previo)`
      )
    } else if (pendingRaw.length !== pending.length) {
      log.info(
        `${settingLabel}: filas de calendario consolidadas por empleado: ${pendingRaw.length} → ${pending.length} en el correo`
      )
    }

    const employees = await this.loadEmployeesForEmail(pending.map((p) => p.employeeId))
    const employeeById = new Map(employees.map((e) => [e.employeeId, e]))
    const activeBusinessUnits = await BusinessUnit.query()
      .where('business_unit_active', 1)
      .whereNull('business_unit_deleted_at')
      .select('business_unit_id')
    const allowedBranchBusinessUnitIds = activeBusinessUnits.map((u) => u.businessUnitId)
    const hasBranchOfficesInSystem =
      await this.hasAtLeastOneBranchOfficeInAllowedBusinessUnits(allowedBranchBusinessUnitIds)
    const branchNameByEmployeeId = hasBranchOfficesInSystem
      ? await this.loadActiveBranchOfficeNamesByEmployeeIds(
          pending.map((p) => p.employeeId),
          allowedBranchBusinessUnitIds
        )
      : new Map<number, string>()

    const emailRows = pending
      .map((row) => {
        const emp = employeeById.get(row.employeeId)
        if (!emp) {
          return null
        }
        const branchName = branchNameByEmployeeId.get(emp.employeeId)?.trim() ?? ''
        const rowPayload: {
          employeeAssistCalendarId: number
          name: string
          code: string
          department: string
          position: string
          businessUnit: string
          branchDisplay?: string
          shiftName: string
          shiftStart: string
          photoUrl: string
        } = {
          employeeAssistCalendarId: row.employeeAssistCalendarId,
          name: `${emp.employeeFirstName ?? ''} ${emp.employeeLastName ?? ''}`.trim(),
          code: String(emp.employeeCode ?? ''),
          department: emp.department?.departmentName ?? '—',
          position: emp.position?.positionName ?? '—',
          businessUnit: emp.businessUnit?.businessUnitName ?? '—',
          shiftName: row.shiftName ?? '—',
          shiftStart: row.shiftTimeStart,
          photoUrl: this.resolvePhotoUrl(emp.employeePhoto),
        }
        if (hasBranchOfficesInSystem) {
          rowPayload.branchDisplay = branchName ? branchName : 'No asignada'
        }
        return rowPayload
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    if (emailRows.length === 0) {
      log.warning(`${settingLabel}: no se pudieron resolver empleados para las filas de calendario pendientes`)
      return { sent: false, reason: 'no_employees' }
    }

    const sidebarColor = this.formatSidebarColor(systemSetting.systemSettingSidebarColor || '333')
    const emailData = {
      tradeName: systemSetting.systemSettingTradeName,
      sidebarColor,
      calendarDayLabel: nowCst.setLocale('es').toFormat("cccc d 'de' LLLL yyyy"),
      employees: emailRows,
      faultCount: emailRows.length,
      hasBranchOfficesInSystem,
      isTestEmail: isTest,
    }

    const subject = isTest
      ? `[PRUEBA] Alerta: registro de asistencia no recibido — ${systemSetting.systemSettingTradeName}`
      : `Alerta: registro de asistencia no recibido — ${systemSetting.systemSettingTradeName}`

    try {
       await mail.send((message) => {
         message.subject(subject).from(resolveMailSender()).htmlView('emails/attendance_fault_hr_batch', emailData)
         // Un solo correo para todo RH: mismo cuerpo con la tabla completa de faltas
         message.to(recipients[0])
         if (recipients.length > 1) {
          message.bcc(recipients.slice(1))
        }
      })

      const fixedLogs = emailRows.map((r) => {
        const p = pending.find((x) => x.employeeAssistCalendarId === r.employeeAssistCalendarId)!
        return {
          employeeAssistCalendarId: r.employeeAssistCalendarId,
          employeeId: p.employeeId,
          systemSettingId: systemSetting.systemSettingId,
          businessUnitId: employeeById.get(p.employeeId)?.businessUnitId ?? 1,
        }
      })

     if (!isTest) {
        await Database.table('attendance_fault_hr_notification_logs').insert(
          fixedLogs.map((l) => ({
            employee_assist_calendar_id: l.employeeAssistCalendarId,
            employee_id: l.employeeId,
            business_unit_id: l.businessUnitId,
            system_setting_id: l.systemSettingId,
            attendance_fault_hr_notification_log_created_at: new Date(),
          }))
        )
      }

      log.info(
        isTest
          ? `${settingLabel}: correo de prueba enviado a ${recipients.length} destinatario(s); sin registro en log (${fixedLogs.length} fila(s) simulada(s))`
          : `${settingLabel}: correo enviado a ${recipients.length} destinatario(s); ${fixedLogs.length} registro(s) en log`
      )
      return { sent: true, count: fixedLogs.length }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      log.error(`${settingLabel}: error al enviar correo de faltas a RH: ${message}`)
      return { sent: false, reason: 'mail_error', error: message }
    }
  }

  /**
   * Registra un resumen agregado de la corrida multi-empresa.
   */
  private logRunSummary(
    results: AttendanceFaultHrSettingRunResult[],
    totalNotified: number,
    isTest: boolean,
    log: {
      info: (m: string) => void
      error: (m: string) => void
    }
  ): void {
    const sentSettings = results.filter((r) => r.sent).length
    const failedSettings = results.filter(
      (r) => !r.sent && (r.reason === 'mail_error' || r.reason === 'process_error')
    ).length
    const skippedSettings = results.length - sentSettings - failedSettings

    const parts: string[] = [`${results.length} empresa(s) evaluada(s)`]
    if (sentSettings > 0) {
      parts.push(`${sentSettings} con correo enviado (${totalNotified} aviso(s))`)
    }
    if (skippedSettings > 0) {
      parts.push(`${skippedSettings} sin envío`)
    }
    if (failedSettings > 0) {
      parts.push(`${failedSettings} con error`)
    }

    const prefix = isTest ? 'Resumen de corrida (prueba)' : 'Resumen de corrida'
    log.info(`${prefix}: ${parts.join('; ')}`)

    for (const result of results) {
      if (
        !result.sent &&
        (result.reason === 'mail_error' || result.reason === 'process_error')
      ) {
        log.error(
          `${result.tradeName} (id ${result.systemSettingId}): falló el procesamiento (${result.reason})${result.error ? `: ${result.error}` : ''}`
        )
      }
    }
  }

  async run(
    logger?: { info: (m: string) => void; error: (m: string) => void; warning: (m: string) => void },
    options?: AttendanceFaultHrRunOptions
  ): Promise<AttendanceFaultHrRunResult> {
    const isTest = options?.test === true
    const log = {
      info: (m: string) => logger?.info(m),
      error: (m: string) => logger?.error(m),
      warning: (m: string) => logger?.warning(m),
    }

    const systemSettings = await SystemSetting.query()
      .whereNull('system_setting_deleted_at')
      .where('system_setting_active', 1)
      .select(
        'system_setting_id',
        'system_setting_business_units',
        'system_setting_active',
        'system_setting_trade_name',
        'system_setting_sidebar_color',
        'system_setting_attendance_fault_hr_emails'
      )

    const activeUnits = await BusinessUnit.query()
      .whereNull('business_unit_deleted_at')
      .where('business_unit_active', 1)
      .select('business_unit_slug')
    const allowedBusinessUnitSlugs = activeUnits.map((u) => u.businessUnitSlug).filter(Boolean)

    const activeSettings = this.resolveActiveSystemSettings(
      systemSettings as SystemSetting[],
      allowedBusinessUnitSlugs,
      { requireAttendanceFaultFlag: !isTest }
    )

    if (activeSettings.length === 0) {
      log.warning(
        isTest
          ? 'No hay system settings activos que coincidan con las unidades de negocio activas'
          : 'No hay system settings activos con notificación de faltas habilitada'
      )
      return {
        sent: false,
        reason: 'no_system_setting',
        count: 0,
        processedSettings: 0,
        sentSettings: 0,
        failedSettings: 0,
        skippedSettings: 0,
        results: [],
      }
    }

    const results: AttendanceFaultHrSettingRunResult[] = []
    let totalNotified = 0

    for (const systemSetting of activeSettings) {
      const settingLabel = `${systemSetting.systemSettingTradeName} (id ${systemSetting.systemSettingId})`
      try {
        const result = await this.processSetting(systemSetting, { isTest, log })
        results.push({
          systemSettingId: systemSetting.systemSettingId,
          tradeName: systemSetting.systemSettingTradeName,
          ...result,
        })
        if (result.sent) {
          totalNotified += result.count
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        log.error(`${settingLabel}: error inesperado al procesar notificación de faltas: ${message}`)
        results.push({
          systemSettingId: systemSetting.systemSettingId,
          tradeName: systemSetting.systemSettingTradeName,
          sent: false,
          reason: 'process_error',
          error: message,
        })
      }
    }

    const sentSettings = results.filter((r) => r.sent).length
    const failedSettings = results.filter(
      (r) => !r.sent && (r.reason === 'mail_error' || r.reason === 'process_error')
    ).length
    const skippedSettings = results.length - sentSettings - failedSettings

    this.logRunSummary(results, totalNotified, isTest, log)

    if (totalNotified > 0) {
      return {
        sent: true,
        count: totalNotified,
        processedSettings: activeSettings.length,
        sentSettings,
        failedSettings,
        skippedSettings,
        results,
      }
    }

    const failedResult = results.find(
      (r) => !r.sent && (r.reason === 'mail_error' || r.reason === 'process_error')
    )
    const lastResult = results[results.length - 1]
    const lastReason =
      failedResult && failedResult.sent === false
        ? failedResult.reason
        : lastResult && lastResult.sent === false
          ? lastResult.reason
          : 'no_pending'

    return {
      sent: false,
      reason: lastReason,
      count: 0,
      processedSettings: activeSettings.length,
      sentSettings,
      failedSettings,
      skippedSettings,
      results,
      error: failedResult && failedResult.sent === false ? failedResult.error : undefined,
    }
  }
}
