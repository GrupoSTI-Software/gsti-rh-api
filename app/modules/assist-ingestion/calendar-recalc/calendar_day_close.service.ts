import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { TenantContext } from '#utils/tenant_context'

/** Días hacia atrás que revisa la corrida diaria. */
export const CALENDAR_DAY_CLOSE_LOOKBACK_DAYS = 3

/**
 * Horas después del inicio del día siguiente (UTC) a partir de las cuales un
 * recálculo ya ve el día cerrado. Cubre la zona más al oeste del país y los
 * turnos que terminan la mañana siguiente.
 */
export const CALENDAR_DAY_CLOSE_SETTLED_HOURS = 42

export interface CalendarDayCloseResult {
  /** Colaboradores con días por cerrar que se mandaron a la cola. */
  employees: number
}

/**
 * Cierre de día del calendario de asistencia guardado
 * (`employee_assist_calendars`).
 *
 * La tabla solo se recalcula cuando algo la toca: una checada, una excepción,
 * un turno o un festivo. Un día que se guardó cuando todavía era futuro, o a
 * media jornada, se quedaba así para siempre si nadie volvía a tocarlo: días
 * pasados con `is_future_day = 1` y estados a medias.
 *
 * Cada noche se buscan los días cuya última escritura fue antes de que el día
 * terminara y se mandan a la cola de recálculo que ya consume
 * `adms:recalc-calendars`, con sus reintentos y su reclamo de trabajos.
 */
export default class CalendarDayCloseService {
  async enqueue(
    now: DateTime = DateTime.utc(),
    lookbackDays: number = CALENDAR_DAY_CLOSE_LOOKBACK_DAYS
  ): Promise<CalendarDayCloseResult> {
    const today = now.toUTC().startOf('day')
    const since = today.minus({ days: lookbackDays }).toISODate() as string
    const until = today.toISODate() as string

    return TenantContext.runUnscoped(async () => {
      const pendingDays = await db
        .from('employee_assist_calendars as calendar')
        .join('employees as employee', 'employee.employee_id', 'calendar.employee_id')
        .whereNull('calendar.employee_assist_calendar_deleted_at')
        .whereNull('employee.employee_deleted_at')
        .where('calendar.day', '>=', since)
        .where('calendar.day', '<', until)
        .whereRaw(
          'calendar.employee_assist_calendar_updated_at < DATE_ADD(calendar.day, INTERVAL ? HOUR)',
          [CALENDAR_DAY_CLOSE_SETTLED_HOURS]
        )
        .groupBy('calendar.business_unit_id', 'calendar.employee_id')
        .select(
          'calendar.business_unit_id as businessUnitId',
          'calendar.employee_id as employeeId',
          db.raw('MIN(calendar.day) as fromDay'),
          db.raw('MAX(calendar.day) as toDay')
        )

      if (pendingDays.length === 0) return { employees: 0 }

      const stamp = now.toFormat('yyyy-MM-dd HH:mm:ss')
      await db.table('assist_calendar_recalc_jobs').multiInsert(
        pendingDays.map((row) => ({
          business_unit_id: row.businessUnitId,
          employee_id: row.employeeId,
          assist_calendar_recalc_job_from: toIsoDate(row.fromDay),
          assist_calendar_recalc_job_to: toIsoDate(row.toDay),
          assist_calendar_recalc_job_status: 'pending',
          assist_calendar_recalc_job_attempts: 0,
          assist_calendar_recalc_job_created_at: stamp,
          assist_calendar_recalc_job_updated_at: stamp,
        }))
      )

      return { employees: pendingDays.length }
    }, TENANT_UNSCOPED_REASON.ASSIST_CALENDAR_DAY_CLOSE)
  }
}

/** El driver entrega la columna `date` como `Date` o como texto. */
function toIsoDate(value: Date | string): string {
  return value instanceof Date
    ? (DateTime.fromJSDate(value, { zone: 'utc' }).toISODate() as string)
    : String(value).slice(0, 10)
}
