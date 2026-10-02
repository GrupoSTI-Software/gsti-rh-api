import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import ExceptionRequest from '#models/exception_request'
import ExceptionRequestDecisionContextService from '#services/exception_request_decision_context_service'
import { reportI18n } from '#helpers/report_locale'
import type { TenantActor } from '#tests/helpers/tenant_actor'
import { cleanupTenantActor, createBypassActor } from '#tests/helpers/tenant_actor'
import type { EmployeeFixture } from '#tests/helpers/employee_fixture'
import { cleanupEmployeeFixture, createEmployeeFixture } from '#tests/helpers/employee_fixture'

/**
 * Señal "historial de asistencia" del contexto con que se decide una
 * solicitud. Consultaba una tabla que no existe (`employee_assist_calendar`)
 * y el error se descartaba: la señal nunca aparecía. Además solo deben
 * contar los días ya cerrados que exigían asistencia.
 */

let actor: TenantActor | null = null
let fixture: EmployeeFixture | null = null

function daysAgo(days: number): string {
  return DateTime.now().minus({ days }).toISODate() as string
}

test.group('Contexto de decisión — historial de asistencia', (group) => {
  group.setup(async () => {
    actor = await createBypassActor('owner', 'ctxasist')
    fixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'ctxasist')
    const base = {
      employee_id: fixture.employee.employeeId,
      business_unit_id: fixture.businessUnitId,
      check_in_status: '',
      is_future_day: 0,
      is_rest_day: 0,
      is_holiday: 0,
      is_vacation_date: 0,
      is_work_disability_date: 0,
      employee_assist_calendar_created_at: new Date(),
      employee_assist_calendar_updated_at: new Date(),
    }
    await db.table('employee_assist_calendars').multiInsert([
      { ...base, day: daysAgo(3), check_in_status: 'delay' },
      { ...base, day: daysAgo(4), check_in_status: 'delay' },
      { ...base, day: daysAgo(5), check_in_status: 'fault' },
      // No cuentan: día por transcurrir y descanso, guardados como falta.
      { ...base, day: daysAgo(-2), check_in_status: 'fault', is_future_day: 1 },
      { ...base, day: daysAgo(6), check_in_status: 'fault', is_rest_day: 1 },
    ])

    return async () => {
      await db
        .from('employee_assist_calendars')
        .where('employee_id', fixture!.employee.employeeId)
        .delete()
      await cleanupEmployeeFixture(fixture)
      await cleanupTenantActor(actor)
    }
  })

  test('cuenta retardos y faltas de los días cerrados que exigían asistencia', async ({
    assert,
  }) => {
    const request = new ExceptionRequest()
    request.employeeId = fixture!.employee.employeeId
    request.exceptionTypeId = 0

    const context = await new ExceptionRequestDecisionContextService(reportI18n()).build(
      request,
      fixture!.businessUnitId
    )
    const signal = context.signals.find((item) => item.key === 'attendance_record')

    assert.exists(signal)
    assert.equal(signal!.value, 3)
    assert.equal(signal!.tone, 'warning')
  })
})
