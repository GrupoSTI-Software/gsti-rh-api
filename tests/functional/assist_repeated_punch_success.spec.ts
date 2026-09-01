import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import Assist from '#models/assist'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import User from '#models/user'
import { ASSIST_ERROR_CODES } from '#constants/assist_error_codes'
import { ASSIST_ORIGIN } from '#constants/assist_origin'
import { TenantContext } from '#utils/tenant_context'

/**
 * USRH1788135907801 — la checada repetida responde éxito y el canal entra en su
 * identidad. Base de datos real.
 */

const createdAssistIds = new Set<number>()

interface Fixture {
  businessUnitId: number
  publicId: string
  employeeId: number
}

async function resolveFixture(): Promise<Fixture> {
  const employees = await TenantContext.runUnscoped(async () => {
    return Employee.query()
      .whereNull('employee_deleted_at')
      .whereNotNull('business_unit_id')
      .select('employee_id', 'business_unit_id')
  }, 'empleados para fixtures de checada repetida')

  for (const employee of employees) {
    if (!employee.businessUnitId) continue
    const pivot = await BusinessUnitUser.query()
      .where('businessUnitId', employee.businessUnitId)
      .first()
    const businessUnit = await BusinessUnit.query()
      .where('businessUnitId', employee.businessUnitId)
      .first()
    if (!pivot || !businessUnit) continue

    return {
      businessUnitId: employee.businessUnitId,
      publicId: String(businessUnit.businessUnitPublicId),
      employeeId: employee.employeeId,
    }
  }

  throw new Error('Se requiere una unidad con empleado activo y usuario en pivote.')
}

async function getUserForBusinessUnit(businessUnitId: number): Promise<User> {
  const pivot = await BusinessUnitUser.query().where('businessUnitId', businessUnitId).firstOrFail()
  return User.query().whereNull('user_deleted_at').where('user_id', pivot.userId).firstOrFail()
}

function uniquePunchTime(offsetSeconds: number): string {
  const seed = Math.floor(Date.now() / 1000) % 86_400
  return DateTime.fromISO('2026-02-11T08:00:00', { zone: 'utc' })
    .plus({ seconds: seed + offsetSeconds })
    .toFormat('yyyy-MM-dd HH:mm:ss')
}

test.group('Assists — la checada repetida responde éxito (USRH1788135907801)', (group) => {
  let fixture: Fixture

  group.setup(async () => {
    fixture = await resolveFixture()
  })

  group.teardown(async () => {
    if (createdAssistIds.size === 0) return
    await TenantContext.runUnscoped(async () => {
      await Assist.query()
        .withTrashed()
        .whereIn('assist_id', [...createdAssistIds])
        .delete()
    }, 'limpieza de fixtures de checada repetida')
  })

  test('CA-1 a CA-3 · el reenvío nunca responde error y dice que ya estaba registrada', async ({
    client,
    assert,
  }) => {
    const user = await getUserForBusinessUnit(fixture.businessUnitId)
    const payload = {
      employeeId: fixture.employeeId,
      assistType: 'check',
      assistLatitude: 0,
      assistLongitude: 0,
      assistPrecision: 0,
      assistPunchTime: uniquePunchTime(0),
      assistChannel: 'backoffice',
    }

    const send = () =>
      client
        .post('/api/v1/assists')
        .json(payload)
        .loginAs(user)
        .header('X-Business-Unit-Id', fixture.publicId)

    const first = await send()
    first.assertStatus(201)
    createdAssistIds.add(first.body().data.assist.assistId)

    const second = await send()
    // Lo que se retiró: el 400 que reportaba como fallo una checada ya registrada.
    second.assertStatus(201)
    createdAssistIds.add(second.body().data.assist.assistId)

    assert.equal(second.body().data.assist.assistId, first.body().data.assist.assistId)
    assert.equal(second.body().data.outcome, 'preexisting')
    assert.include(second.body().message.toLowerCase(), 'ya estaba registrada')
    assert.equal(
      Math.floor(DateTime.fromISO(second.body().data.assist.assistCreatedAt).toSeconds()),
      Math.floor(DateTime.fromISO(first.body().data.assist.assistCreatedAt).toSeconds())
    )
  })

  test('CA-6 · un canal fuera del vocabulario se rechaza con AST.VAL.009', async ({
    client,
    assert,
  }) => {
    const user = await getUserForBusinessUnit(fixture.businessUnitId)

    const response = await client
      .post('/api/v1/assists')
      .json({
        employeeId: fixture.employeeId,
        assistType: 'check',
        assistPunchTime: uniquePunchTime(60),
        assistChannel: 'tablet',
      })
      .loginAs(user)
      .header('X-Business-Unit-Id', fixture.publicId)

    response.assertStatus(400)
    assert.equal(response.body().code, ASSIST_ERROR_CODES.VAL_CHANNEL_UNKNOWN)
    assert.equal(response.body().key, 'canal-de-checada-no-reconocido')
  })

  test('CA-4 · app y kiosco del mismo segundo conviven como dos checadas', async ({
    client,
    assert,
  }) => {
    const user = await getUserForBusinessUnit(fixture.businessUnitId)
    const punchTime = uniquePunchTime(120)

    const send = (assistChannel: string) =>
      client
        .post('/api/v1/assists')
        .json({
          employeeId: fixture.employeeId,
          assistType: 'check',
          assistPunchTime: punchTime,
          assistChannel,
        })
        .loginAs(user)
        .header('X-Business-Unit-Id', fixture.publicId)

    const fromKiosk = await send('kiosk')
    fromKiosk.assertStatus(201)
    createdAssistIds.add(fromKiosk.body().data.assist.assistId)

    const fromBackoffice = await send('backoffice')
    fromBackoffice.assertStatus(201)
    createdAssistIds.add(fromBackoffice.body().data.assist.assistId)

    assert.equal(fromKiosk.body().data.outcome, 'inserted')
    assert.equal(fromBackoffice.body().data.outcome, 'inserted')
    assert.notEqual(
      fromBackoffice.body().data.assist.assistId,
      fromKiosk.body().data.assist.assistId
    )
    assert.equal(fromKiosk.body().data.assist.assistOrigin, ASSIST_ORIGIN.DEVICE)
    assert.equal(fromBackoffice.body().data.assist.assistOrigin, ASSIST_ORIGIN.ADMIN_CAPTURE)
  })

  test('CA-7 · un cliente que no declara canal sigue funcionando como hoy', async ({
    client,
    assert,
  }) => {
    const user = await getUserForBusinessUnit(fixture.businessUnitId)

    const response = await client
      .post('/api/v1/assists')
      .json({
        employeeId: fixture.employeeId,
        assistType: 'check',
        assistPunchTime: uniquePunchTime(180),
      })
      .loginAs(user)
      .header('X-Business-Unit-Id', fixture.publicId)

    response.assertStatus(201)
    createdAssistIds.add(response.body().data.assist.assistId)

    assert.oneOf(response.body().data.assist.assistOrigin, [
      ASSIST_ORIGIN.SELF_SERVICE,
      ASSIST_ORIGIN.ADMIN_CAPTURE,
    ])
  })

  test('CA-11 · un instante no parseable se sigue rechazando', async ({ client, assert }) => {
    const user = await getUserForBusinessUnit(fixture.businessUnitId)

    const response = await client
      .post('/api/v1/assists')
      .json({
        employeeId: fixture.employeeId,
        assistType: 'check',
        assistPunchTime: 'no-es-una-fecha',
      })
      .loginAs(user)
      .header('X-Business-Unit-Id', fixture.publicId)

    assert.oneOf(response.status(), [400, 422])
  })
})
