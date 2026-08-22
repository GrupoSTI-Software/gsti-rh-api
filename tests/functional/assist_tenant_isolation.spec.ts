import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import User from '#models/user'
import Employee from '#models/employee'
import Assist from '#models/assist'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import { TenantContext } from '#utils/tenant_context'

/**
 * USRH1786569916882 — cierre de fuga de lectura e IDOR de anulación de checadas
 * entre empresas (BD real). BU1 (sae) vs BU6 (cima).
 */

const ASSIST_DATE_FROM = '2026-01-01'
const ASSIST_DATE_TO = '2026-01-31'

const NON_EXISTENT_EMPLOYEE_ID = 2_147_483_640
const NON_EXISTENT_ASSIST_ID = 2_147_483_639

/** Tenants resueltos en setup desde BD (pueden variar entre restauraciones). */
let actorBusinessUnitId: number
let bu1EmployeeId: number
let bu6EmployeeId: number

async function resolveCrossTenantFixtures(): Promise<{
  actorBusinessUnitId: number
  actorPublicId: string
  actorEmployeeId: number
  foreignEmployeeId: number
}> {
  const employees = await TenantContext.runUnscoped(async () => {
    return Employee.query()
      .whereNull('employee_deleted_at')
      .select('employee_id', 'business_unit_id')
  }, 'resolución de empleados para fixtures cross-tenant')

  const byUnit = new Map<number, number>()
  for (const row of employees) {
    if (row.businessUnitId && !byUnit.has(row.businessUnitId)) {
      byUnit.set(row.businessUnitId, row.employeeId)
    }
  }

  const unitIds = [...byUnit.keys()]
  if (unitIds.length < 2) {
    throw new Error(
      'Se requieren empleados activos en al menos dos unidades de negocio para este test.'
    )
  }

  let selectedUnitId: number | null = null
  let selectedEmployeeId: number | null = null
  let selectedPublicId: string | null = null

  for (const unitId of unitIds) {
    const pivot = await BusinessUnitUser.query().where('businessUnitId', unitId).first()
    const businessUnit = await BusinessUnit.query().where('businessUnitId', unitId).first()
    if (!pivot || !businessUnit) continue

    selectedUnitId = unitId
    selectedEmployeeId = byUnit.get(unitId)!
    selectedPublicId = String(businessUnit.businessUnitPublicId)
    break
  }

  if (!selectedUnitId || !selectedEmployeeId || !selectedPublicId) {
    throw new Error(
      'Se requiere al menos una unidad con empleado activo y usuario en pivote para este test.'
    )
  }

  const foreignUnitId = unitIds.find((id) => id !== selectedUnitId)!
  const foreignEmployeeId = byUnit.get(foreignUnitId)!

  return {
    actorBusinessUnitId: selectedUnitId,
    actorPublicId: selectedPublicId,
    actorEmployeeId: selectedEmployeeId,
    foreignEmployeeId,
  }
}

async function getUserForBusinessUnit(businessUnitId: number): Promise<User> {
  const pivot = await BusinessUnitUser.query()
    .where('businessUnitId', businessUnitId)
    .firstOrFail()

  return User.query().whereNull('user_deleted_at').where('user_id', pivot.userId).firstOrFail()
}

async function createAssistFixture(employeeId: number, label: string): Promise<Assist> {
  const employee = await TenantContext.runUnscoped(async () => {
    return Employee.query().where('employee_id', employeeId).firstOrFail()
  }, 'lectura empleado para fixture de checada')

  const punchTime = DateTime.now().setZone('UTC-6').startOf('day').plus({ hours: 8 })

  const maxSyncRow = await TenantContext.runUnscoped(async () => {
    return Assist.query().max('assist_sync_id as maxSyncId').first()
  }, 'lectura max assist_sync_id para fixture')
  const nextSyncId = Number(maxSyncRow?.$extras.maxSyncId ?? 0) + 1

  const assist = new Assist()
  assist.assistEmpCode = String(employee.employeeCode ?? `TEST-${employeeId}`)
  assist.assistTerminalSn = 'TEST-TENANT-ISOLATION'
  assist.assistTerminalAlias = label
  assist.assistAreaAlias = 'TEST'
  assist.assistLongitude = 0
  assist.assistLatitude = 0
  assist.assistPrecision = 0
  assist.assistUploadTime = punchTime
  assist.assistEmpId = employeeId
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

function collectAssistEmpCodes(body: Record<string, unknown>): string[] {
  const calendar = (body.data as { employeeCalendar?: Array<{ assist?: { assitFlatList?: Array<{ assistEmpCode?: string }> } }> })
    ?.employeeCalendar
  const codes: string[] = []
  for (const day of calendar ?? []) {
    for (const row of day.assist?.assitFlatList ?? []) {
      if (row.assistEmpCode) {
        codes.push(row.assistEmpCode)
      }
    }
  }
  return codes
}

test.group('Assists — aislamiento por tenant (BD real)', (group) => {
  let assistBu6Id: number
  let assistBu6EmpCode: string
  let bu1PublicId: string

  group.setup(async () => {
    const fixtures = await resolveCrossTenantFixtures()
    actorBusinessUnitId = fixtures.actorBusinessUnitId
    bu1PublicId = fixtures.actorPublicId
    bu1EmployeeId = fixtures.actorEmployeeId
    bu6EmployeeId = fixtures.foreignEmployeeId

    const assist = await createAssistFixture(
      bu6EmployeeId,
      `TEST-TENANT-ISOLATION-${Date.now()}`
    )
    assistBu6Id = assist.assistId
    assistBu6EmpCode = assist.assistEmpCode
  })

  group.teardown(async () => {
    if (assistBu6Id) {
      await TenantContext.runUnscoped(async () => {
        await Assist.query().where('assist_id', assistBu6Id).delete()
      }, 'limpieza fixture checada ajena')
    }
  })

  test('A8 · GET sin employeeId responde 400 y no entrega calendario', async ({ client, assert }) => {
    const user = await getUserForBusinessUnit(actorBusinessUnitId)

    const response = await client
      .get('/api/v1/assists')
      .qs({ date: ASSIST_DATE_FROM, 'date-end': ASSIST_DATE_TO })
      .loginAs(user)
      .header('X-Business-Unit-Id', bu1PublicId)

    response.assertStatus(400)
    const body = response.body()
    assert.equal(body.type, 'warning')
    assert.equal(body.title, 'Recurso')
    assert.equal(body.message, 'ID de Empleado no fue encontrado')
    assert.property(body.data, 'employeeId')
    assert.notExists(body.data?.employeeCalendar)
  })

  test('A8 · GET con employeeId ajeno responde igual que uno inexistente', async ({ client, assert }) => {
    const user = await getUserForBusinessUnit(actorBusinessUnitId)

    const foreignResponse = await client
      .get('/api/v1/assists')
      .qs({
        date: ASSIST_DATE_FROM,
        'date-end': ASSIST_DATE_TO,
        employeeId: bu6EmployeeId,
      })
      .loginAs(user)
      .header('X-Business-Unit-Id', bu1PublicId)

    const missingResponse = await client
      .get('/api/v1/assists')
      .qs({
        date: ASSIST_DATE_FROM,
        'date-end': ASSIST_DATE_TO,
        employeeId: NON_EXISTENT_EMPLOYEE_ID,
      })
      .loginAs(user)
      .header('X-Business-Unit-Id', bu1PublicId)

    foreignResponse.assertStatus(400)
    missingResponse.assertStatus(400)

    const foreignBody = foreignResponse.body()
    const missingBody = missingResponse.body()

    assert.equal(foreignBody.type, missingBody.type)
    assert.equal(foreignBody.title, missingBody.title)
    assert.equal(foreignBody.message, missingBody.message)
    assert.equal(foreignBody.data, missingBody.data)
  })

  test('A8 · GET con employeeId propio no arrastra checadas del código ajeno del fixture', async ({
    client,
    assert,
  }) => {
    const user = await getUserForBusinessUnit(actorBusinessUnitId)

    const response = await client
      .get('/api/v1/assists')
      .qs({
        date: ASSIST_DATE_FROM,
        'date-end': ASSIST_DATE_TO,
        employeeId: bu1EmployeeId,
      })
      .loginAs(user)
      .header('X-Business-Unit-Id', bu1PublicId)

    if (response.status() === 200) {
      const codes = collectAssistEmpCodes(response.body())
      assert.notInclude(
        codes,
        assistBu6EmpCode,
        'el listado de BU1 no debe incluir checadas del empleado de BU6'
      )
    } else {
      // Sin turnos en el rango el servicio responde 400; no implica fuga cross-tenant.
      response.assertStatus(400)
    }
  })

  test('A7 · PUT inactivate ajeno responde 404 y la fila sigue activa en BD', async ({
    client,
    assert,
  }) => {
    const user = await getUserForBusinessUnit(actorBusinessUnitId)

    const response = await client
      .put(`/api/v1/assists/${assistBu6Id}/inactivate`)
      .loginAs(user)
      .header('X-Business-Unit-Id', bu1PublicId)

    response.assertStatus(404)
    response.assertBodyContains({
      type: 'warning',
      title: 'No se encontró Asistencia',
      message: 'No se encontró Asistencia con el ID ingresado',
    })
    assert.equal(response.body().data.assistId, assistBu6Id)

    const stillActive = await TenantContext.runUnscoped(async () => {
      return Assist.query()
        .where('assist_id', assistBu6Id)
        .whereNull('assist_deleted_at')
        .where('assist_active', 1)
        .first()
    }, 'verificación post-inactivate cruzado')
    assert.isNotNull(stillActive, 'la checada ajena no debió inactivarse')
  })

  test('A7 · PUT inactivate inexistente responde 404 con el mismo cuerpo que el intento ajeno', async ({
    client,
    assert,
  }) => {
    const user = await getUserForBusinessUnit(actorBusinessUnitId)

    const crossTenantResponse = await client
      .put(`/api/v1/assists/${assistBu6Id}/inactivate`)
      .loginAs(user)
      .header('X-Business-Unit-Id', bu1PublicId)

    const missingResponse = await client
      .put(`/api/v1/assists/${NON_EXISTENT_ASSIST_ID}/inactivate`)
      .loginAs(user)
      .header('X-Business-Unit-Id', bu1PublicId)

    crossTenantResponse.assertStatus(404)
    missingResponse.assertStatus(404)

    const crossBody = crossTenantResponse.body()
    const missingBody = missingResponse.body()

    assert.equal(crossBody.type, missingBody.type)
    assert.equal(crossBody.title, missingBody.title)
    assert.equal(crossBody.message, missingBody.message)
    assert.notProperty(crossBody, 'error')
    assert.notProperty(missingBody, 'error')
  })

  test('A9 · GET con employeeId propio conserva el contrato de éxito (BO / PWA / app)', async ({
    client,
    assert,
  }) => {
    const user = await getUserForBusinessUnit(actorBusinessUnitId)

    const response = await client
      .get('/api/v1/assists')
      .qs({
        date: ASSIST_DATE_FROM,
        'date-end': ASSIST_DATE_TO,
        employeeId: bu1EmployeeId,
      })
      .loginAs(user)
      .header('X-Business-Unit-Id', bu1PublicId)

    assert.notEqual(
      response.body().message,
      'ID de Empleado no fue encontrado',
      'employeeId propio no debe disparar la validación nueva'
    )

    if (response.status() === 200) {
      const body = response.body()
      assert.equal(body.type, 'success')
      assert.isArray(body.data?.employeeCalendar)
      assert.isArray(body.data?.temporaryAssignments)
      for (const day of body.data.employeeCalendar) {
        assert.property(day, 'assist')
        assert.property(day.assist, 'assitFlatList')
      }
    } else {
      // Sin turnos en el rango: el servicio ya respondía 400 antes del fix; no es regresión del candado.
      response.assertStatus(400)
      assert.notEqual(response.body().title, 'Recurso')
    }
  })

  test('A9 · PUT inactivate propia responde 200, inactiva la fila y no soft-delete', async ({
    client,
    assert,
  }) => {
    const ownAssist = await createAssistFixture(
      bu1EmployeeId,
      `TEST-OWN-REGRESSION-${Date.now()}`
    )

    try {
      const user = await getUserForBusinessUnit(actorBusinessUnitId)

      const response = await client
        .put(`/api/v1/assists/${ownAssist.assistId}/inactivate`)
        .loginAs(user)
        .header('X-Business-Unit-Id', bu1PublicId)

      response.assertStatus(200)
      response.assertBodyContains({
        type: 'success',
        title: 'Recurso',
        message: 'La asistencia fue desactivada exitosamente',
      })
      assert.equal(response.body().data?.assist?.assistId, ownAssist.assistId)

      const row = await TenantContext.runUnscoped(async () => {
        return Assist.query().where('assist_id', ownAssist.assistId).first()
      }, 'verificación post-inactivate propia')
      assert.isNotNull(row)
      assert.equal(row!.assistActive, 0)
      assert.isNull(row!.deletedAt)
    } finally {
      await TenantContext.runUnscoped(async () => {
        await Assist.query().where('assist_id', ownAssist.assistId).delete()
      }, 'limpieza fixture checada propia')
    }
  })
})
