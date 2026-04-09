import Employee from '#models/employee'
import SystemSetting from '#models/system_setting'
import Tolerance from '#models/tolerance'
import { ATTENDANCE_FAULT_HR_ROLE_SLUGS } from '#constants/attendance_fault_hr_notification'
import AssistsService from '#services/assist_service'
import env from '#start/env'
import mail from '@adonisjs/mail/services/main'
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

/**
 * Destinatarios: solo por rol (y usuario activo con empleado vinculado + `user_email`).
 * Empleados evaluados: todos los activos en las unidades del system setting con turno asignado
 * y fila de calendario para “hoy” (se genera la fila faltante vía sync antes de evaluar).
 */
export default class AttendanceFaultHrNotificationService {
  /**
   * Resuelve system setting activo según SYSTEM_BUSINESS (mismo criterio que otros comandos).
   */
  resolveActiveSystemSetting(systemSettings: SystemSetting[]): SystemSetting | null {
    const systemBusinessEnv = env.get('SYSTEM_BUSINESS', '')
    if (!systemBusinessEnv) {
      return null
    }
    const businessList = systemBusinessEnv.split(',').map((u: string) => u.trim())
    for (const setting of systemSettings) {
      const units = setting.systemSettingBusinessUnits
        ? setting.systemSettingBusinessUnits.split(',').map((u: string) => u.trim())
        : []
      const hasMatch = units.some((u) => businessList.includes(u))
      if (hasMatch && setting.systemSettingActive === 1) {
        return setting
      }
    }
    return null
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

  formatSidebarColor(color: string): string {
    const c = color?.trim() || '333333'
    return c.startsWith('#') ? c : `#${c}`
  }

  resolvePhotoUrl(photo: string | null): string {
    if (!photo) {
      return ''
    }
    if (photo.startsWith('http://') || photo.startsWith('https://')) {
      return photo
    }
    const base = env.get('APP_URL', '').replace(/\/$/, '')
    if (!base) {
      return photo
    }
    const path = photo.startsWith('/') ? photo : `/${photo}`
    return `${base}${path}`
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
      .whereIn('employee_id', unique)
      .whereNull('employee_deleted_at')
      .preload('department')
      .preload('position')
      .preload('businessUnit')
  }

  async run(logger?: { info: (m: string) => void; error: (m: string) => void; warning: (m: string) => void }) {
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

    const systemSetting = this.resolveActiveSystemSetting(systemSettings as SystemSetting[])
    if (!systemSetting) {
      log.warning('No hay system setting activo que coincida con SYSTEM_BUSINESS')
      return { sent: false, reason: 'no_system_setting' as const }
    }

    if (!systemSetting.systemSettingAttendanceFaultHrEmails) {
      log.info('Notificaciones de falta por asistencia a RH deshabilitadas en ajustes del sistema')
      return { sent: false, reason: 'disabled' as const }
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
      log.warning('El system setting no tiene unidades de negocio configuradas')
      return { sent: false, reason: 'no_business_units' as const }
    }

    const recipients = await this.fetchHrRecipientUserEmails()

    if (recipients.length === 0) {
      log.warning(
        'No hay destinatarios: usuarios activos con roles configurados, empleado asociado y user_email'
      )
      return { sent: false, reason: 'no_recipients' as const }
    }

    await this.ensureEmployeeAssistCalendarsForDay(calendarDay, businessUnitSlugs, log)

    const pendingRaw = await this.fetchPendingFaultRows(calendarDay, businessUnitSlugs, faultOffsetMinutes)
    const pending = this.dedupePendingByEmployeeId(pendingRaw)
    if (pending.length === 0) {
      log.info('Sin faltas nuevas por registro de asistencia para notificar')
      return { sent: false, reason: 'no_pending' as const }
    }

    if (pendingRaw.length !== pending.length) {
      log.info(
        `Filas de calendario consolidadas por empleado: ${pendingRaw.length} → ${pending.length} en el correo`
      )
    }

    const employees = await this.loadEmployeesForEmail(pending.map((p) => p.employeeId))
    const employeeById = new Map(employees.map((e) => [e.employeeId, e]))

    const emailRows = pending
      .map((row) => {
        const emp = employeeById.get(row.employeeId)
        if (!emp) {
          return null
        }
        return {
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
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    if (emailRows.length === 0) {
      log.warning('No se pudieron resolver empleados para las filas de calendario pendientes')
      return { sent: false, reason: 'no_employees' as const }
    }

    const sidebarColor = this.formatSidebarColor(systemSetting.systemSettingSidebarColor || '333')
    const emailData = {
      tradeName: systemSetting.systemSettingTradeName,
      sidebarColor,
      calendarDayLabel: nowCst.setLocale('es').toFormat("cccc d 'de' LLLL yyyy"),
      employees: emailRows,
      faultCount: emailRows.length,
    }

    const subject = `Alerta: registro de asistencia no recibido — ${systemSetting.systemSettingTradeName}`

    try {
      await mail.send((message) => {
        message.subject(subject).htmlView('emails/attendance_fault_hr_batch', emailData)
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
        }
      })

      await Database.table('attendance_fault_hr_notification_logs').insert(
        fixedLogs.map((l) => ({
          employee_assist_calendar_id: l.employeeAssistCalendarId,
          employee_id: l.employeeId,
          system_setting_id: l.systemSettingId,
          attendance_fault_hr_notification_log_created_at: new Date(),
        }))
      )

      log.info(`Correo enviado a ${recipients.length} destinatario(s); ${fixedLogs.length} registro(s) en log`)
      return { sent: true, count: fixedLogs.length as number }
    } catch (e: any) {
      log.error(`Error al enviar correo de faltas a RH: ${e?.message ?? e}`)
      return { sent: false, reason: 'mail_error' as const, error: e?.message }
    }
  }
}
