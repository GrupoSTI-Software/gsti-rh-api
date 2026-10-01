import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import type { TenantActor } from '#tests/helpers/tenant_actor'
import { cleanupTenantActor, createBypassActor } from '#tests/helpers/tenant_actor'
import type { EmployeeFixture } from '#tests/helpers/employee_fixture'
import { cleanupEmployeeFixture, createEmployeeFixture } from '#tests/helpers/employee_fixture'

/**
 * Firma de un día de vacaciones desde la ficha del empleado.
 *
 * Reproduce la petición del backoffice tal cual (multipart con
 * `shiftExceptionIds[]` y `vacationSettingId`) y comprueba que el día vuelve
 * con su firma en la lista del período: es lo que cambia "Firmar" por
 * "Ver firma".
 */
const HIRE_DATE = '2020-11-26'
const PERIOD_YEAR = 2025

/** PNG de 1x1 transparente. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

let actor: TenantActor | null = null
let fixture: EmployeeFixture | null = null
let vacationSettingId = 0
let dayId = 0

test.group('Firma del día de vacaciones', (group) => {
  group.setup(async () => {
    actor = await createBypassActor('owner', 'vacfirma')
    fixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'vacfirma')
    await db
      .from('employees')
      .where('employee_id', fixture.employee.employeeId)
      .update({ employee_hire_date: HIRE_DATE })

    const type = await db
      .from('exception_types')
      .where('exception_type_slug', 'vacation')
      .whereNull('exception_type_deleted_at')
      .first()
    const setting = await db
      .from('vacation_settings')
      .whereNull('vacation_setting_deleted_at')
      .where('vacation_setting_years_of_service', 5)
      .orderBy('vacation_setting_apply_since', 'desc')
      .first()
    vacationSettingId = Number(setting.vacation_setting_id)

    const [id] = await db.table('shift_exceptions').insert({
      employee_id: fixture.employee.employeeId,
      business_unit_id: fixture.businessUnitId,
      exception_type_id: Number(type.exception_type_id),
      vacation_setting_id: vacationSettingId,
      shift_exceptions_date: '2026-08-17',
      shift_exceptions_description: 'Vacaciones',
      shift_exception_authorized_by_user_id: actor.user.userId,
      shift_exception_authorized_at: new Date(),
      shift_exceptions_created_at: new Date(),
      shift_exceptions_updated_at: new Date(),
    })
    dayId = Number(id)

    return async () => {
      await db.from('vacation_authorization_signatures').where('shift_exception_id', dayId).delete()
      await db.from('shift_exceptions').where('shift_exception_id', dayId).delete()
      await cleanupEmployeeFixture(fixture)
      await cleanupTenantActor(actor)
    }
  })

  test('firmar deja el día con su firma en la lista del período', async ({ client, assert }) => {
    const signed = await client
      .post('/api/vacation-authorizations/sign-shift-exceptions')
      .field('vacationSettingId', String(vacationSettingId))
      .field('shiftExceptionIds[]', String(dayId))
      .file('signature', PNG_1X1, { filename: 'signature.png', contentType: 'image/png' })
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)

    assert.equal(signed.status(), 201, JSON.stringify(signed.body()))
    assert.lengthOf(signed.body().data.errors, 0, JSON.stringify(signed.body().data.errors))
    assert.lengthOf(signed.body().data.createdSignatures, 1)

    const feed = await client
      .get(`/api/v1/employees/${fixture!.employee.employeeId}/vacation-days`)
      .qs({ vacationSettingId, periodYear: PERIOD_YEAR })
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)

    feed.assertStatus(200)
    const day = (feed.body().data.vacationDays as Array<Record<string, unknown>>).find(
      (row) => row.shiftExceptionId === dayId
    )
    assert.isString(day?.signatureUrl)
  })
})
