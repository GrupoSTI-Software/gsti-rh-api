import { writeFile } from 'node:fs/promises'
import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import db from '@adonisjs/lucid/services/db'
import SyncAssistsService from '#services/sync_assists_service'
import SiteTimeZoneService from '#modules/attendance-time/site_time_zone.service'
import { toInstant } from '#modules/attendance-time/attendance_clock'
import type { AttendanceTolerances } from '#modules/attendance-time/attendance_time.interface'
import type { AssistDayInterface } from '../app/interfaces/assist_day_interface.js'
import {
  diffAttendanceDay,
  type ReconcileDifference,
} from '#modules/attendance-time/reconcile/attendance_timezone_diff'

const DEFAULT_TOLERANCE_DELAY_MINUTES = 10
const DEFAULT_TOLERANCE_FAULT_MINUTES = 30

interface EmployeeInScope {
  employeeId: number
  employeeCode: string
  fullName: string
}

interface EmployeeDifference extends ReconcileDifference {
  employeeId: number
  employeeCode: string
  fullName: string
}

/**
 * Compuerta de nómina para el cambio de zona horaria en asistencia.
 *
 * Recorre el calendario de cada colaborador en el alcance y compara, día por
 * día, el bucket que daba la regla legada (turno en -06:00 fijo; salida con la
 * pared del checador) contra el de la regla vigente (instantes en la zona IANA
 * del sitio). Lista solo los días que cambian de bucket y un resumen por tipo
 * de cambio. Con ese listado se decide si el cambio sale silencioso o con
 * aviso a la empresa, y qué periodos ya pagados quedan afectados.
 *
 * No escribe nada. Lee el calendario por el contrato público del motor
 * (`SyncAssistsService.index`), así que compara sobre las mismas checadas que
 * ve el monitor.
 */
export default class AttendanceReconcileTimezone extends BaseCommand {
  static commandName = 'attendance:reconcile-timezone'
  static description =
    'Lista los días de asistencia cuyo bucket cambia entre la regla legada y la de zona del sitio'

  static options: CommandOptions = {
    startApp: true,
  }

  @flags.number({ description: 'business_unit_id a reconciliar', required: true })
  declare businessUnit: number

  @flags.string({ description: 'Día civil inicial (yyyy-MM-dd)', required: true })
  declare from: string

  @flags.string({ description: 'Día civil final (yyyy-MM-dd)', required: true })
  declare to: string

  @flags.number({ description: 'Acota a un employee_id' })
  declare employee: number

  @flags.string({ description: 'Ruta del CSV de salida; sin ella, tabla en consola' })
  declare output: string

  async run() {
    const tolerances = await this.loadTolerances()
    const employees = await this.loadEmployees()
    if (employees.length === 0) {
      this.logger.info('Sin colaboradores en el alcance dado')
      return
    }

    const zones = await new SiteTimeZoneService().forEmployees(employees.map((e) => e.employeeId))
    const sync = new SyncAssistsService()
    const differences: EmployeeDifference[] = []
    let evaluatedDays = 0

    for (const employee of employees) {
      const zone = zones.get(employee.employeeId)?.zone ?? 'UTC'
      const calendar = await this.loadCalendar(sync, employee.employeeId)
      for (const day of calendar) {
        const shift = day.assist.dateShift
        if (!shift?.shiftTimeStart || !day.assist.checkIn) continue
        evaluatedDays += 1
        const dayDifferences = diffAttendanceDay(
          {
            day: day.day,
            shiftTimeStart: String(shift.shiftTimeStart),
            shiftActiveHours: Number(shift.shiftActiveHours ?? 0),
            checkInUtc: this.punchIso(day.assist.checkIn.assistPunchTimeUtc),
            checkOutUtc: day.assist.checkOut
              ? this.punchIso(day.assist.checkOut.assistPunchTimeUtc)
              : null,
          },
          zone,
          tolerances
        )
        for (const difference of dayDifferences) {
          differences.push({ ...difference, ...employee })
        }
      }
    }

    this.summarize(differences, employees.length, evaluatedDays)

    if (this.output) {
      await writeFile(this.output, this.toCsv(differences), 'utf8')
      this.logger.success(`CSV escrito en ${this.output}`)
      return
    }
    this.renderTable(differences)
  }

  /** Tolerancias vigentes, mismo criterio que attendance-stats. */
  private async loadTolerances(): Promise<AttendanceTolerances> {
    const rows: Array<{ tolerance_name: string; tolerance_minutes: number | string }> = await db
      .from('tolerances')
      .innerJoin('system_settings', 'system_settings.system_setting_id', 'tolerances.system_setting_id')
      .where('system_settings.system_setting_active', 1)
      .whereNull('tolerances.tolerance_deleted_at')
      .whereNull('system_settings.system_setting_deleted_at')
      .whereIn('tolerances.tolerance_name', ['Delay', 'Fault'])
      .select('tolerances.tolerance_name', 'tolerances.tolerance_minutes')
    const minutes = (name: string, fallback: number): number => {
      const row = rows.find((r) => r.tolerance_name === name)
      return row ? Number(row.tolerance_minutes) : fallback
    }
    return {
      delayMinutes: minutes('Delay', DEFAULT_TOLERANCE_DELAY_MINUTES),
      faultMinutes: minutes('Fault', DEFAULT_TOLERANCE_FAULT_MINUTES),
    }
  }

  private async loadEmployees(): Promise<EmployeeInScope[]> {
    const query = db
      .from('employees')
      .where('business_unit_id', this.businessUnit)
      .whereNull('employee_deleted_at')
      .whereRaw('COALESCE(employee_assist_discriminator, 0) <> 1')
    if (this.employee !== undefined) query.where('employee_id', this.employee)
    const rows: Array<{
      employee_id: number | string
      employee_code: string | null
      employee_first_name: string | null
      employee_last_name: string | null
    }> = await query
      .select('employee_id', 'employee_code', 'employee_first_name', 'employee_last_name')
      .orderBy('employee_id', 'asc')
    return rows.map((row) => ({
      employeeId: Number(row.employee_id),
      employeeCode: String(row.employee_code ?? ''),
      fullName: [row.employee_first_name, row.employee_last_name].filter(Boolean).join(' '),
    }))
  }

  private async loadCalendar(
    sync: SyncAssistsService,
    employeeId: number
  ): Promise<AssistDayInterface[]> {
    const result = await sync.index({ date: this.from, dateEnd: this.to, employeeID: employeeId })
    if (result.status !== 200 || !result.data) return []
    const data = result.data as { employeeCalendar?: AssistDayInterface[] }
    return data.employeeCalendar ?? []
  }

  private punchIso(value: unknown): string | null {
    if (value === null || value === undefined) return null
    const instant = toInstant(value as string | Date)
    return instant.isValid ? instant.toISO() : null
  }

  private summarize(differences: EmployeeDifference[], employees: number, evaluatedDays: number): void {
    const byTransition = new Map<string, number>()
    for (const difference of differences) {
      const key = `${difference.kind}: ${difference.previous} -> ${difference.current}`
      byTransition.set(key, (byTransition.get(key) ?? 0) + 1)
    }
    this.logger.info(
      `Colaboradores: ${employees} · días con checada evaluados: ${evaluatedDays} · cambios: ${differences.length}`
    )
    for (const [transition, count] of [...byTransition.entries()].sort()) {
      this.logger.info(`  ${transition}: ${count}`)
    }
  }

  private renderTable(differences: EmployeeDifference[]): void {
    if (differences.length === 0) {
      this.logger.success('Ningún día cambia de bucket en el alcance dado')
      return
    }
    const table = this.ui.table()
    table.head(['Empleado', 'Código', 'Día', 'Marca', 'Checada (UTC)', 'Anterior', 'Vigente'])
    for (const d of differences) {
      table.row([d.fullName, d.employeeCode, d.day, d.kind, d.punchUtc ?? '', d.previous, d.current])
    }
    table.render()
  }

  private toCsv(differences: EmployeeDifference[]): string {
    const escape = (value: string | number | null): string => `"${String(value ?? '').replace(/"/g, '""')}"`
    const lines = [
      ['employee_id', 'employee_code', 'employee', 'day', 'kind', 'punch_utc', 'previous', 'current']
        .map(escape)
        .join(','),
    ]
    for (const d of differences) {
      lines.push(
        [d.employeeId, d.employeeCode, d.fullName, d.day, d.kind, d.punchUtc, d.previous, d.current]
          .map(escape)
          .join(',')
      )
    }
    return `${lines.join('\n')}\n`
  }
}
