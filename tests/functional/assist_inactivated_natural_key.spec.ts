import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import User from '#models/user'
import Employee from '#models/employee'
import Assist from '#models/assist'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import { TenantContext } from '#utils/tenant_context'
import { computeAssistNaturalKey } from '#utils/assist_natural_key'

/**
 * USRH1786566437097 — entregable 16 / CA-23 / regla 16 / spec A9.
 * Flujo Backoffice: PUT inactivate → reenvío con mismos cuatro datos → no reinserta.
 */

function isDuplicateKeyError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const err = error as { code?: string; message?: string }
  return err.code === 'ER_DUP_ENTRY' || (err.message?.includes('Duplicate entry') ?? false)
}

async function resolveTenantWithUser(): Promise<{
  businessUnitId: number
  publicId: string
  employeeId: number
}> {
  const employees = await TenantContext.runUnscoped(async () => {
    return Employee.query()
      .whereNull('employee_deleted_at')
      .whereNotNull('business_unit_id')
      .select('employee_id', 'business_unit_id')
  }, 'empleados para CA-23')

  for (const row of employees) {
    if (!row.businessUnitId) continue
    const pivot = await BusinessUnitUser.query()
      .where('businessUnitId', row.businessUnitId)
      .first()
    const bu = await BusinessUnit.query().where('businessUnitId', row.businessUnitId).first()
    if (pivot && bu) {
      return {
        businessUnitId: row.businessUnitId,
        publicId: String(bu.businessUnitPublicId),
        employeeId: row.employeeId,
      }
    }
  }

  throw new Error('Se requiere una unidad con empleado activo y usuario en pivote.')
}

async function getUserForBusinessUnit(businessUnitId: number): Promise<User> {
  const pivot = await BusinessUnitUser.query()
    .where('businessUnitId', businessUnitId)
    .firstOrFail()
  return User.query().whereNull('user_deleted_at').where('user_id', pivot.userId).firstOrFail()
}

async function nextAssistSyncId(): Promise<number> {
  const maxSyncRow = await TenantContext.runUnscoped(async () => {
    return Assist.query().max('assist_sync_id as maxSyncId').first()
  }, 'max sync id CA-23')
  return Number(maxSyncRow?.$extras.maxSyncId ?? 0) + 1
}

test.group('Assists — inactivada no libera slot de llave natural (CA-23)', (group) => {
  let fixtureAssistId: number
  let naturalKey: string
  let businessUnitId: number
  let publicId: string
  let employeeId: number
  let punchTime: DateTime
  let terminalSn: string
  let empCode: string

  group.setup(async () => {
    const tenant = await resolveTenantWithUser()
    businessUnitId = tenant.businessUnitId
    publicId = tenant.publicId
    employeeId = tenant.employeeId

    const employee = await TenantContext.runUnscoped(async () => {
      return Employee.query().where('employee_id', employeeId).firstOrFail()
    }, 'empleado fixture CA-23')

    punchTime = DateTime.fromISO('2026-06-15T14:30:00', { zone: 'utc' })
    terminalSn = `CA23-SN-${Date.now()}`
    empCode = String(employee.employeeCode ?? `CA23-${employeeId}`)
    const syncId = await nextAssistSyncId()

    const assist = await TenantContext.runUnscoped(async () => {
      const row = new Assist()
      row.businessUnitId = businessUnitId
      row.assistEmpCode = empCode
      row.assistTerminalSn = terminalSn
      row.assistTerminalAlias = 'CA-23-FIXTURE'
      row.assistAreaAlias = 'TEST'
      row.assistLongitude = 0
      row.assistLatitude = 0
      row.assistPrecision = 0
      row.assistUploadTime = punchTime
      row.assistEmpId = employeeId
      row.assistTerminalId = null
      row.assistSyncId = syncId
      row.assistActive = 1
      row.assistType = 'check'
      row.assistPunchTime = punchTime
      row.assistPunchTimeUtc = punchTime
      row.assistPunchTimeOrigin = punchTime
      await row.save()
      return row
    }, 'crear checada activa CA-23')

    fixtureAssistId = assist.assistId
    naturalKey =
      assist.assistNaturalKey ??
      computeAssistNaturalKey({
        businessUnitId,
        assistEmpCode: empCode,
        assistPunchTimeUtc: punchTime,
        assistTerminalSn: terminalSn,
      })
  })

  group.teardown(async () => {
    if (!fixtureAssistId) return
    await TenantContext.runUnscoped(async () => {
      await Assist.query().where('assist_id', fixtureAssistId).delete()
    }, 'limpieza fixture CA-23')
  })

  test('A9 · PUT inactivate (Backoffice) deja assist_active=0 y conserva la llave', async ({
    client,
    assert,
  }) => {
    const user = await getUserForBusinessUnit(businessUnitId)

    const response = await client
      .put(`/api/v1/assists/${fixtureAssistId}/inactivate`)
      .loginAs(user)
      .header('X-Business-Unit-Id', publicId)

    response.assertStatus(200)

    const row = await TenantContext.runUnscoped(async () => {
      return Assist.query().where('assist_id', fixtureAssistId).firstOrFail()
    }, 'post-inactivate CA-23')

    assert.equal(row.assistActive, 0)
    assert.equal(row.assistNaturalKey, naturalKey)
    assert.isNull(row.deletedAt)
  })

  test('CA-23 · reenvío con los cuatro datos idénticos no crea segunda fila (UNIQUE)', async ({
    assert,
  }) => {
    const syncId = await nextAssistSyncId()
    let caught: unknown

    try {
      await TenantContext.runUnscoped(async () => {
        const duplicate = new Assist()
        duplicate.businessUnitId = businessUnitId
        duplicate.assistEmpCode = empCode
        duplicate.assistTerminalSn = terminalSn
        duplicate.assistTerminalAlias = 'CA-23-DUP'
        duplicate.assistAreaAlias = 'TEST'
        duplicate.assistLongitude = 0
        duplicate.assistLatitude = 0
        duplicate.assistPrecision = 0
        duplicate.assistUploadTime = punchTime
        duplicate.assistEmpId = employeeId
        duplicate.assistTerminalId = null
        duplicate.assistSyncId = syncId
        duplicate.assistActive = 1
        duplicate.assistType = 'check'
        duplicate.assistPunchTime = punchTime
        duplicate.assistPunchTimeUtc = punchTime
        duplicate.assistPunchTimeOrigin = punchTime
        await duplicate.save()
      }, 'reinsert CA-23')
    } catch (error) {
      caught = error
    }

    assert.isTrue(isDuplicateKeyError(caught), 'debió rechazarse por llave natural duplicada')

    const rows = await TenantContext.runUnscoped(async () => {
      return Assist.query().where('assist_natural_key', naturalKey)
    }, 'conteo por llave CA-23')

    assert.lengthOf(rows, 1)
    assert.equal(rows[0].assistId, fixtureAssistId)
    assert.equal(rows[0].assistActive, 0)
  })

  test('CA-23 · POST HTTP en el mismo segundo no toca la fila del checador', async ({
    client,
    assert,
  }) => {
    // Tras USRH1788135907801 el único criterio es la llave natural, y la serie real
    // del checador entra en ella tal cual mientras que la checada de la app entra con
    // su centinela de canal: son dos hechos distintos del mismo segundo y conviven.
    // La fila del fixture no se altera; ésa es la garantía que este caso protege.
    const user = await getUserForBusinessUnit(businessUnitId)

    const response = await client
      .post('/api/v1/assists')
      .json({
        employeeId,
        assistType: 'check',
        assistLongitude: 0,
        assistLatitude: 0,
        assistPrecision: 0,
        assistPunchTime: punchTime.setZone('UTC-6').toFormat('yyyy-MM-dd HH:mm:ss'),
      })
      .loginAs(user)
      .header('X-Business-Unit-Id', publicId)

    assert.oneOf(response.status(), [201, 403])

    if (response.status() === 201) {
      const createdId = response.body().data.assist.assistId
      assert.notEqual(createdId, fixtureAssistId)
      await TenantContext.runUnscoped(async () => {
        await Assist.query().withTrashed().where('assist_id', createdId).delete()
      }, 'limpieza de la checada de app creada en CA-23')
    }

    const rows = await TenantContext.runUnscoped(async () => {
      return Assist.query().where('assist_natural_key', naturalKey)
    }, 'conteo post HTTP CA-23')

    assert.lengthOf(rows, 1)
    assert.equal(rows[0].assistId, fixtureAssistId)
    assert.equal(rows[0].assistActive, 0)
  })
})
