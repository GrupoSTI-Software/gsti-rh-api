import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import type { TenantActor } from '#tests/helpers/tenant_actor'
import { cleanupTenantActor, createBypassActor } from '#tests/helpers/tenant_actor'
import type { EmployeeFixture } from '#tests/helpers/employee_fixture'
import { cleanupEmployeeFixture, createEmployeeFixture } from '#tests/helpers/employee_fixture'

/**
 * Dias de vacaciones de un periodo en la ficha del empleado: las cuatro
 * situaciones (pendiente, autorizada, rechazada, cancelada) en una sola lista,
 * y la cancelacion con motivo.
 *
 * Ingreso el 26 de noviembre de 2020: el periodo 2025 corre del 26 de
 * noviembre de 2025 al 25 de noviembre de 2026.
 */
const HIRE_DATE = '2020-11-26'
const PERIOD_YEAR = 2025

let actor: TenantActor | null = null
let fixture: EmployeeFixture | null = null
let vacationTypeId = 0
let vacationSettingId = 0
const createdDayIds: number[] = []
const createdRequestIds: number[] = []

async function insertDay(date: string, extra: Record<string, unknown> = {}): Promise<number> {
  const [id] = await db.table('shift_exceptions').insert({
    employee_id: fixture!.employee.employeeId,
    business_unit_id: fixture!.businessUnitId,
    exception_type_id: vacationTypeId,
    vacation_setting_id: vacationSettingId,
    shift_exceptions_date: date,
    shift_exceptions_description: 'Vacaciones',
    shift_exceptions_created_at: new Date(),
    shift_exceptions_updated_at: new Date(),
    ...extra,
  })
  createdDayIds.push(Number(id))
  return Number(id)
}

async function insertRequest(date: string, status: 'pending' | 'refused'): Promise<number> {
  const [id] = await db.table('exception_requests').insert({
    employee_id: fixture!.employee.employeeId,
    business_unit_id: fixture!.businessUnitId,
    exception_type_id: vacationTypeId,
    user_id: actor!.user.userId,
    exception_request_status: status,
    exception_request_description: 'Solicitud de prueba',
    exception_request_resolution_note: status === 'refused' ? 'Cierre de mes' : null,
    resolved_by_user_id: status === 'refused' ? actor!.user.userId : null,
    exception_request_resolved_at: status === 'refused' ? new Date() : null,
    requested_date: `${date} 06:00:00`,
    exception_request_created_at: new Date(),
    exception_request_updated_at: new Date(),
  })
  createdRequestIds.push(Number(id))
  return Number(id)
}

test.group('Dias de vacaciones del periodo', (group) => {
  group.setup(async () => {
    actor = await createBypassActor('owner', 'vacdias')
    fixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'vacdias')
    await db
      .from('employees')
      .where('employee_id', fixture.employee.employeeId)
      .update({ employee_hire_date: HIRE_DATE })

    const type = await db
      .from('exception_types')
      .where('exception_type_slug', 'vacation')
      .whereNull('exception_type_deleted_at')
      .first()
    vacationTypeId = Number(type.exception_type_id)
    const setting = await db
      .from('vacation_settings')
      .whereNull('vacation_setting_deleted_at')
      .where('vacation_setting_years_of_service', 5)
      .first()
    vacationSettingId = Number(setting.vacation_setting_id)

    return async () => {
      if (createdDayIds.length) {
        await db.from('shift_exceptions').whereIn('shift_exception_id', createdDayIds).delete()
      }
      if (createdRequestIds.length) {
        await db.from('exception_requests').whereIn('exception_request_id', createdRequestIds).delete()
      }
      // Cancelar recalcula la asistencia y deja filas del calendario del colaborador.
      await db
        .from('employee_assist_calendars')
        .where('employee_id', fixture!.employee.employeeId)
        .delete()
      await cleanupEmployeeFixture(fixture)
      await cleanupTenantActor(actor)
    }
  })

  test('junta pendientes, rechazadas, autorizadas y canceladas con su rastro', async ({
    client,
    assert,
  }) => {
    await insertDay('2026-08-17', {
      shift_exception_authorized_by_user_id: actor!.user.userId,
      shift_exception_authorized_at: new Date(),
    })
    await insertDay('2026-08-10', {
      shift_exceptions_deleted_at: new Date(),
      shift_exception_cancelled_at: new Date(),
      shift_exception_cancelled_by_user_id: actor!.user.userId,
      shift_exception_cancel_reason: 'Se pospuso el viaje',
    })
    // Baja sin rastro (anterior a este cambio): no se sabe si fue cancelacion.
    await insertDay('2026-08-03', { shift_exceptions_deleted_at: new Date() })
    await insertRequest('2026-08-24', 'pending')
    await insertRequest('2026-11-25', 'refused')
    // Fuera del periodo: no aparece.
    await insertRequest('2026-11-26', 'pending')

    const response = await client
      .get(`/api/v1/employees/${fixture!.employee.employeeId}/vacation-days`)
      .qs({ vacationSettingId, periodYear: PERIOD_YEAR })
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)

    response.assertStatus(200)
    const days = response.body().data.vacationDays as Array<Record<string, unknown>>
    assert.deepEqual(
      days.map((day) => [day.date, day.status]),
      [
        ['2026-11-25', 'refused'],
        ['2026-08-24', 'pending'],
        ['2026-08-17', 'authorized'],
        ['2026-08-10', 'cancelled'],
      ]
    )
    const authorized = days.find((day) => day.status === 'authorized')!
    assert.isString(authorized.resolvedByName)
    const cancelled = days.find((day) => day.status === 'cancelled')!
    assert.equal(cancelled.cancelReason, 'Se pospuso el viaje')
    const refused = days.find((day) => day.status === 'refused')!
    assert.equal(refused.resolutionNote, 'Cierre de mes')
  })

  test('cancelar exige motivo y deja el dia como cancelado', async ({ client, assert }) => {
    const dayId = await insertDay('2026-09-14')

    const withoutReason = await client
      .post(`/api/v1/employees/${fixture!.employee.employeeId}/vacation-days/${dayId}/cancel`)
      .json({})
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
    withoutReason.assertStatus(422)

    const response = await client
      .post(`/api/v1/employees/${fixture!.employee.employeeId}/vacation-days/${dayId}/cancel`)
      .json({ reason: 'El colaborador regreso antes' })
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
    response.assertStatus(200)

    const row = await db.from('shift_exceptions').where('shift_exception_id', dayId).first()
    assert.isNotNull(row.shift_exceptions_deleted_at)
    assert.equal(row.shift_exception_cancel_reason, 'El colaborador regreso antes')
    assert.equal(row.shift_exception_cancelled_by_user_id, actor!.user.userId)

    const again = await client
      .post(`/api/v1/employees/${fixture!.employee.employeeId}/vacation-days/${dayId}/cancel`)
      .json({ reason: 'Otra vez' })
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
    again.assertStatus(404)
  })
})
