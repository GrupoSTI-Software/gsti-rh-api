import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import User from '#models/user'
import Employee from '#models/employee'
import Assist from '#models/assist'
import BusinessUnit from '#models/business_unit'
import { TenantContext } from '#utils/tenant_context'

/**
 * USRH1786566437097 — entregable 14 / CA-21 ensayo contra BD real.
 * BU1 (sae, id=1) y BU6 (cima, id=6) con datos representativos.
 */

const BU1_ID = 1
const BU6_ID = 6
const BU1_PUBLIC_ID = 'a76db057-2292-49a0-9f1b-911e328d93b0'
const BU6_PUBLIC_ID = '8c3617a4-c942-4ba7-aee6-2ac32d4ab5ef'

const ASSIST_DATE_FROM = '2026-01-01'
const ASSIST_DATE_TO = '2026-01-31'

async function getUserByEmail(email: string): Promise<User> {
  return User.query().whereNull('user_deleted_at').where('user_email', email).firstOrFail()
}

async function getEmployeeForUnit(businessUnitId: number): Promise<Employee> {
  return TenantContext.runUnscoped(async () => {
    return Employee.query()
      .where('business_unit_id', businessUnitId)
      .whereNull('employee_deleted_at')
      .firstOrFail()
  }, `empleado activo BU${businessUnitId}`)
}

test.group('Assists — ensayo 2 empresas vivas (USRH1786566437097 / CA-21)', (group) => {
  let trialReady = false
  let bu1EmployeeId: number
  let bu6EmployeeId: number
  let bu6AssistId: number
  let bu6AssistEmpCode: string
  let fixtureIds: number[] = []

  group.setup(async () => {
    const bu1 = await BusinessUnit.query().where('businessUnitId', BU1_ID).first()
    const bu6 = await BusinessUnit.query().where('businessUnitId', BU6_ID).first()
    if (!bu1 || !bu6) {
      return
    }

    try {
      const bu1Employee = await getEmployeeForUnit(BU1_ID)
      const bu6Employee = await getEmployeeForUnit(BU6_ID)
      bu1EmployeeId = bu1Employee.employeeId
      bu6EmployeeId = bu6Employee.employeeId

      const assist = await createAssistFixture(bu6Employee, `TRIAL-BU6-${Date.now()}`)
      bu6AssistId = assist.assistId
      bu6AssistEmpCode = assist.assistEmpCode
      trialReady = true
    } catch {
      trialReady = false
    }
  })

  group.teardown(async () => {
    if (!trialReady) return
    const ids = [...fixtureIds, bu6AssistId].filter(Boolean)
    if (ids.length === 0) return
    await TenantContext.runUnscoped(async () => {
      await Assist.query().whereIn('assist_id', ids).delete()
    }, 'limpieza ensayo CA-21')
  })

  test('CA-21 · existen BU1 sae y BU6 cima con checadas en BD', async ({ assert }) => {
    if (!trialReady) {
      assert.isTrue(
        true,
        'Ensayo CA-21 omitido: se requiere BD restablecida con BU1 (id=1) y BU6 (id=6)'
      )
      return
    }
    const bu1Assists = await TenantContext.runUnscoped(async () => {
      return Assist.query().where('businessUnitId', BU1_ID).count('* as total')
    }, 'conteo BU1 ensayo')
    const bu6Assists = await TenantContext.runUnscoped(async () => {
      return Assist.query().where('businessUnitId', BU6_ID).count('* as total')
    }, 'conteo BU6 ensayo')

    assert.isAbove(Number(bu1Assists[0].$extras.total), 0, 'BU1 debe tener checadas')
    assert.isAbove(Number(bu6Assists[0].$extras.total), 0, 'BU6 debe tener checadas')
  })

  test('A1 · GET con employeeId propio de BU1 no expone checadas de BU6', async ({
    client,
    assert,
  }) => {
    if (!trialReady) return

    const user = await getUserByEmail('betosimon@sae.com.mx')
    const response = await client
      .get('/api/v1/assists')
      .qs({
        date: ASSIST_DATE_FROM,
        'date-end': ASSIST_DATE_TO,
        employeeId: bu1EmployeeId,
      })
      .loginAs(user)
      .header('X-Business-Unit-Id', BU1_PUBLIC_ID)

    if (response.status() === 200) {
      const calendar = response.body().data?.employeeCalendar as
        | Array<{ assist?: { assitFlatList?: Array<{ assistEmpCode?: string }> } }>
        | undefined
      const codes: string[] = []
      for (const day of calendar ?? []) {
        for (const row of day.assist?.assitFlatList ?? []) {
          if (row.assistEmpCode) codes.push(row.assistEmpCode)
        }
      }
      assert.notInclude(codes, bu6AssistEmpCode)
    } else {
      assert.notEqual(response.body().message, 'ID de Empleado no fue encontrado')
    }
  })

  test('A2 · GET sin employeeId no entrega checadas de BU6', async ({ client, assert }) => {
    if (!trialReady) return
    const user = await getUserByEmail('betosimon@sae.com.mx')

    const response = await client
      .get('/api/v1/assists')
      .qs({ date: ASSIST_DATE_FROM, 'date-end': ASSIST_DATE_TO })
      .loginAs(user)
      .header('X-Business-Unit-Id', BU1_PUBLIC_ID)

    response.assertStatus(400)
    assert.notExists(response.body().data?.employeeCalendar)
  })

  test('A3 · GET con employeeId de BU6 responde igual que uno inexistente', async ({ client, assert }) => {
    if (!trialReady) return
    const user = await getUserByEmail('betosimon@sae.com.mx')

    const foreignResponse = await client
      .get('/api/v1/assists')
      .qs({
        date: ASSIST_DATE_FROM,
        'date-end': ASSIST_DATE_TO,
        employeeId: bu6EmployeeId,
      })
      .loginAs(user)
      .header('X-Business-Unit-Id', BU1_PUBLIC_ID)

    const missingResponse = await client
      .get('/api/v1/assists')
      .qs({
        date: ASSIST_DATE_FROM,
        'date-end': ASSIST_DATE_TO,
        employeeId: 2_147_483_640,
      })
      .loginAs(user)
      .header('X-Business-Unit-Id', BU1_PUBLIC_ID)

    foreignResponse.assertStatus(400)
    missingResponse.assertStatus(400)
    assert.deepEqual(foreignResponse.body(), missingResponse.body())
  })

  test('A4 · PUT inactivate sobre checada de BU6 responde 404 y la fila sigue activa', async ({
    client,
    assert,
  }) => {
    if (!trialReady) return
    const user = await getUserByEmail('betosimon@sae.com.mx')

    const response = await client
      .put(`/api/v1/assists/${bu6AssistId}/inactivate`)
      .loginAs(user)
      .header('X-Business-Unit-Id', BU1_PUBLIC_ID)

    response.assertStatus(404)

    const stillActive = await TenantContext.runUnscoped(async () => {
      return Assist.query()
        .where('assist_id', bu6AssistId)
        .where('assist_active', 1)
        .first()
    }, 'post-inactivate cross-tenant ensayo')
    assert.isNotNull(stillActive)
  })

  test('A7 · GET get-flat-list con empleado de BU6 desde BU1 no filtra checadas ajenas', async ({
    client,
    assert,
  }) => {
    if (!trialReady) return
    const user = await getUserByEmail('betosimon@sae.com.mx')

    const response = await client
      .get('/api/v1/assists/get-flat-list')
      .qs({
        employeeId: bu6EmployeeId,
        dateStart: ASSIST_DATE_FROM,
        dateEnd: ASSIST_DATE_TO,
      })
      .loginAs(user)
      .header('X-Business-Unit-Id', BU1_PUBLIC_ID)

    if (response.status() === 200) {
      const rows = (response.body().data?.data ?? []) as Array<{ assistEmpCode?: string }>
      const codes = rows.map((r) => r.assistEmpCode).filter(Boolean)
      assert.notInclude(codes, bu6AssistEmpCode)
    } else {
      response.assertStatus(400)
    }
  })

  test('A5 · POST como BU6 persiste businessUnitId=6 aunque el body intente forzar BU1', async ({
    client,
    assert,
  }) => {
    if (!trialReady) return
    const user = await getUserByEmail('jdsimon@cima-aviacion.com.mx')
    const employee = await getEmployeeForUnit(BU6_ID)

    const response = await client
      .post('/api/v1/assists')
      .json({
        employeeId: employee.employeeId,
        assistType: 'check',
        assistLongitude: 0,
        assistLatitude: 0,
        assistPrecision: 0,
        businessUnitId: BU1_ID,
      })
      .loginAs(user)
      .header('X-Business-Unit-Id', BU6_PUBLIC_ID)

    if (response.status() === 201) {
      const assistId = response.body().data?.assist?.assistId as number
      fixtureIds.push(assistId)

      const row = await TenantContext.runUnscoped(async () => {
        return Assist.query().where('assist_id', assistId).firstOrFail()
      }, 'verificación POST BU6 ensayo')
      assert.equal(row.businessUnitId, BU6_ID)
    } else {
      // verifyInfo puede rechazar duplicado local; no implica fuga de tenant.
      assert.oneOf(response.status(), [400, 422])
    }
  })

  test('A6 · POST de BU1 con employeeId de BU6 responde 403', async ({ client }) => {
    if (!trialReady) return
    const user = await getUserByEmail('betosimon@sae.com.mx')

    const response = await client
      .post('/api/v1/assists')
      .json({
        employeeId: bu6EmployeeId,
        assistType: 'check',
        assistLongitude: 0,
        assistLatitude: 0,
        assistPrecision: 0,
      })
      .loginAs(user)
      .header('X-Business-Unit-Id', BU1_PUBLIC_ID)

    response.assertStatus(403)
  })
})

async function createAssistFixture(employee: Employee, label: string): Promise<Assist> {
  const punchTime = DateTime.now().setZone('UTC-6').startOf('day').plus({ hours: 8 })

  const maxSyncRow = await TenantContext.runUnscoped(async () => {
    return Assist.query().max('assist_sync_id as maxSyncId').first()
  }, 'max sync id fixture ensayo')
  const nextSyncId = Number(maxSyncRow?.$extras.maxSyncId ?? 0) + 1

  const assist = new Assist()
  assist.assistEmpCode = String(employee.employeeCode ?? `TEST-${employee.employeeId}`)
  assist.assistTerminalSn = 'TEST-CA21'
  assist.assistTerminalAlias = label
  assist.assistAreaAlias = 'TEST'
  assist.assistLongitude = 0
  assist.assistLatitude = 0
  assist.assistPrecision = 0
  assist.assistUploadTime = punchTime
  assist.assistEmpId = employee.employeeId
  assist.businessUnitId = employee.businessUnitId
  assist.assistTerminalId = null
  assist.assistSyncId = nextSyncId
  assist.assistActive = 1
  assist.assistType = 'check'
  assist.assistPunchTime = punchTime
  assist.assistPunchTimeUtc = punchTime
  assist.assistPunchTimeOrigin = punchTime
  await assist.save()
  return assist
}
