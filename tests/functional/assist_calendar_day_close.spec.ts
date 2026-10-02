import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import CalendarDayCloseService from '#modules/assist-ingestion/calendar-recalc/calendar_day_close.service'
import type { TenantActor } from '#tests/helpers/tenant_actor'
import { cleanupTenantActor, createBypassActor } from '#tests/helpers/tenant_actor'
import type { EmployeeFixture } from '#tests/helpers/employee_fixture'
import { cleanupEmployeeFixture, createEmployeeFixture } from '#tests/helpers/employee_fixture'

/**
 * Cierre nocturno del calendario de asistencia guardado: manda a recalcular
 * los días cuya última escritura fue antes de que terminaran.
 */

const NOW = DateTime.fromISO('2026-10-02T09:00:00.000Z', { zone: 'utc' })

let actor: TenantActor | null = null
let otherActor: TenantActor | null = null
let stale: EmployeeFixture | null = null
let settled: EmployeeFixture | null = null

function row(employee: EmployeeFixture, day: string, updatedAt: string) {
  return {
    employee_id: employee.employee.employeeId,
    business_unit_id: employee.businessUnitId,
    day,
    check_in_status: '',
    is_future_day: 1,
    employee_assist_calendar_created_at: updatedAt,
    employee_assist_calendar_updated_at: updatedAt,
  }
}

async function jobsOf(employee: EmployeeFixture) {
  return db
    .from('assist_calendar_recalc_jobs')
    .where('employee_id', employee.employee.employeeId)
    .where('assist_calendar_recalc_job_status', 'pending')
}

test.group('Cierre de días del calendario de asistencia', (group) => {
  group.setup(async () => {
    actor = await createBypassActor('owner', 'cierredia')
    stale = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'cierredia-a')
    // Cada fixture en su empresa: la limpieza de una borra los puestos de toda la empresa.
    otherActor = await createBypassActor('owner', 'cierredia-b')
    settled = await createEmployeeFixture(otherActor.businessUnit.businessUnitId, 'cierredia-b')
    await db.table('employee_assist_calendars').multiInsert([
      // Guardados cuando todavía eran futuros o estaban a media jornada.
      row(stale, '2026-09-30', '2026-09-23 21:24:11'),
      row(stale, '2026-10-01', '2026-10-01 18:02:00'),
      // Ya recalculado con el día cerrado: no se vuelve a tocar.
      row(settled, '2026-09-30', '2026-10-01 20:00:00'),
      // Hoy todavía no se cierra.
      row(settled, '2026-10-02', '2026-09-23 21:24:11'),
    ])

    return async () => {
      for (const fixture of [stale, settled]) {
        await db
          .from('assist_calendar_recalc_jobs')
          .where('employee_id', fixture!.employee.employeeId)
          .delete()
        await db
          .from('employee_assist_calendars')
          .where('employee_id', fixture!.employee.employeeId)
          .delete()
        await cleanupEmployeeFixture(fixture)
      }
      await cleanupTenantActor(actor)
      await cleanupTenantActor(otherActor)
    }
  })

  test('encola el rango de días sin cerrar de cada colaborador', async ({ assert }) => {
    await new CalendarDayCloseService().enqueue(NOW)

    const jobs = await jobsOf(stale!)
    assert.lengthOf(jobs, 1)
    assert.equal(
      DateTime.fromJSDate(jobs[0].assist_calendar_recalc_job_from).toISODate(),
      '2026-09-30'
    )
    assert.equal(
      DateTime.fromJSDate(jobs[0].assist_calendar_recalc_job_to).toISODate(),
      '2026-10-01'
    )
  })

  test('no encola días ya recalculados con el día cerrado ni el día en curso', async ({
    assert,
  }) => {
    assert.lengthOf(await jobsOf(settled!), 0)
  })
})
