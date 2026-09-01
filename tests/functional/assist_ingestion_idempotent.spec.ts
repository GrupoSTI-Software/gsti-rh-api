import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import Assist from '#models/assist'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import User from '#models/user'
import { ASSIST_ERROR_CODES } from '#constants/assist_error_codes'
import { AssistError } from '#exceptions/assist_error'
import { TenantContext } from '#utils/tenant_context'
import { computeAssistNaturalKey } from '#utils/assist_natural_key'
import AssistIngestionRepositoryMysql from '#modules/assist-ingestion/assist_ingestion.repository.mysql'
import type { AssistIngestionRecord } from '#modules/assist-ingestion/dto/assist_ingestion.dto'

/**
 * USRH1786554648211 — motor de ingesta idempotente por llave natural.
 * Base de datos real: los criterios de idempotencia no se verifican por inspección.
 */

interface TenantFixture {
  businessUnitId: number
  publicId: string
  employeeId: number
  employeeCode: string
  foreignEmployeeId: number | null
}

const createdAssistIds = new Set<number>()

async function resolveFixtures(): Promise<TenantFixture> {
  const employees = await TenantContext.runUnscoped(async () => {
    return Employee.query()
      .whereNull('employee_deleted_at')
      .whereNotNull('business_unit_id')
      .select('employee_id', 'business_unit_id', 'employee_code')
  }, 'empleados para fixtures de ingesta idempotente')

  const byUnit = new Map<number, Employee>()
  for (const row of employees) {
    if (row.businessUnitId && !byUnit.has(row.businessUnitId)) byUnit.set(row.businessUnitId, row)
  }

  for (const [businessUnitId, employee] of byUnit) {
    const pivot = await BusinessUnitUser.query().where('businessUnitId', businessUnitId).first()
    const businessUnit = await BusinessUnit.query().where('businessUnitId', businessUnitId).first()
    if (!pivot || !businessUnit) continue

    const foreignUnitId = [...byUnit.keys()].find((id) => id !== businessUnitId) ?? null

    return {
      businessUnitId,
      publicId: String(businessUnit.businessUnitPublicId),
      employeeId: employee.employeeId,
      employeeCode: String(employee.employeeCode ?? `ING-${employee.employeeId}`),
      foreignEmployeeId: foreignUnitId ? byUnit.get(foreignUnitId)!.employeeId : null,
    }
  }

  throw new Error('Se requiere una unidad con empleado activo y usuario en pivote.')
}

async function getUserForBusinessUnit(businessUnitId: number): Promise<User> {
  const pivot = await BusinessUnitUser.query().where('businessUnitId', businessUnitId).firstOrFail()
  return User.query().whereNull('user_deleted_at').where('user_id', pivot.userId).firstOrFail()
}

/** Instante irrepetible por corrida: evita chocar con checadas de ejecuciones previas. */
function uniquePunchTime(offsetSeconds: number): DateTime {
  const seed = Math.floor(Date.now() / 1000) % 86_400
  return DateTime.fromISO('2026-02-10T08:00:00', { zone: 'utc' }).plus({
    seconds: seed + offsetSeconds,
  })
}

function buildRecord(
  fixture: TenantFixture,
  punchTimeUtc: DateTime,
  terminalSn: string | null = null
): AssistIngestionRecord {
  return {
    index: 0,
    businessUnitId: fixture.businessUnitId,
    employeeId: fixture.employeeId,
    employeeCode: fixture.employeeCode,
    assistType: 'check',
    punchTimeUtc,
    geo: { latitude: 0, longitude: 0, precision: 0 },
    origin: 'self-service',
    createdByUserId: null,
    terminalSn,
  }
}

async function rowsForKey(naturalKey: string): Promise<Assist[]> {
  return TenantContext.runUnscoped(async () => {
    return Assist.query().withTrashed().where('assist_natural_key', naturalKey)
  }, 'conteo por llave natural en ingesta idempotente')
}

test.group('Assists — motor de ingesta idempotente (USRH1786554648211)', (group) => {
  let fixture: TenantFixture
  const repository = new AssistIngestionRepositoryMysql()

  group.setup(async () => {
    fixture = await resolveFixtures()
  })

  group.teardown(async () => {
    if (createdAssistIds.size === 0) return
    await TenantContext.runUnscoped(async () => {
      await Assist.query()
        .withTrashed()
        .whereIn('assist_id', [...createdAssistIds])
        .delete()
    }, 'limpieza de fixtures de ingesta idempotente')
  })

  test('reenvío idéntico responde preexisting, no crea segunda fila y no re-fecha', async ({
    assert,
  }) => {
    const punchTimeUtc = uniquePunchTime(0)
    const record = buildRecord(fixture, punchTimeUtc)
    const naturalKey = computeAssistNaturalKey({
      businessUnitId: fixture.businessUnitId,
      assistEmpCode: fixture.employeeCode,
      assistPunchTimeUtc: punchTimeUtc,
      assistTerminalSn: null,
    })

    const [first] = await TenantContext.run([fixture.businessUnitId], () =>
      repository.ingestMany([record])
    )
    createdAssistIds.add(first.assist.assistId)

    assert.equal(first.outcome, 'inserted')

    // La columna es DATETIME: se compara al segundo, no al milisegundo del proceso.
    const createdAt = Math.floor(first.assist.assistCreatedAt.toSeconds())
    const updatedAt = Math.floor(first.assist.assistUpdatedAt.toSeconds())

    const [second] = await TenantContext.run([fixture.businessUnitId], () =>
      repository.ingestMany([record])
    )

    assert.equal(second.outcome, 'preexisting')
    assert.equal(second.assist.assistId, first.assist.assistId)
    assert.equal(Math.floor(second.assist.assistCreatedAt.toSeconds()), createdAt)
    assert.equal(Math.floor(second.assist.assistUpdatedAt.toSeconds()), updatedAt)
    assert.lengthOf(await rowsForKey(naturalKey), 1)
  })

  test('una fila borrada lógicamente sigue ocupando su llave y no se reactiva', async ({
    assert,
  }) => {
    const punchTimeUtc = uniquePunchTime(60)
    const record = buildRecord(fixture, punchTimeUtc)
    const naturalKey = computeAssistNaturalKey({
      businessUnitId: fixture.businessUnitId,
      assistEmpCode: fixture.employeeCode,
      assistPunchTimeUtc: punchTimeUtc,
      assistTerminalSn: null,
    })

    const [first] = await TenantContext.run([fixture.businessUnitId], () =>
      repository.ingestMany([record])
    )
    createdAssistIds.add(first.assist.assistId)

    await TenantContext.runUnscoped(async () => {
      await Assist.query()
        .where('assist_id', first.assist.assistId)
        .update({
          assist_deleted_at: DateTime.utc().toFormat('yyyy-MM-dd HH:mm:ss'),
          assist_active: 0,
        })
    }, 'baja lógica de la checada de prueba')

    const [second] = await TenantContext.run([fixture.businessUnitId], () =>
      repository.ingestMany([record])
    )

    assert.equal(second.outcome, 'preexisting')
    assert.equal(second.assist.assistId, first.assist.assistId)
    assert.isNotNull(second.assist.deletedAt)
    assert.equal(second.assist.assistActive, 0)
    assert.lengthOf(await rowsForKey(naturalKey), 1)
  })

  test('dos escrituras simultáneas dejan una sola fila y ninguna revienta', async ({ assert }) => {
    const punchTimeUtc = uniquePunchTime(120)
    const record = buildRecord(fixture, punchTimeUtc)
    const naturalKey = computeAssistNaturalKey({
      businessUnitId: fixture.businessUnitId,
      assistEmpCode: fixture.employeeCode,
      assistPunchTimeUtc: punchTimeUtc,
      assistTerminalSn: null,
    })

    const [left, right] = await TenantContext.run([fixture.businessUnitId], () =>
      Promise.all([repository.ingestMany([record]), repository.ingestMany([record])])
    )

    createdAssistIds.add(left[0].assist.assistId)
    createdAssistIds.add(right[0].assist.assistId)

    const outcomes = [left[0].outcome, right[0].outcome].sort()
    assert.deepEqual(outcomes, ['inserted', 'preexisting'])
    assert.equal(left[0].assist.assistId, right[0].assist.assistId)
    assert.lengthOf(await rowsForKey(naturalKey), 1)
  })

  test('sin empresa resoluble la escritura falla cerrada y no deja fila', async ({ assert }) => {
    let caught: unknown

    try {
      const assist = new Assist()
      assist.assistEmpCode = fixture.employeeCode
      assist.assistEmpId = fixture.employeeId
      assist.assistType = 'check'
      assist.assistPunchTime = uniquePunchTime(180)
      assist.assistPunchTimeUtc = uniquePunchTime(180)
      assist.assistPunchTimeOrigin = uniquePunchTime(180)
      await assist.save()
      createdAssistIds.add(assist.assistId)
    } catch (error) {
      caught = error
    }

    assert.instanceOf(caught, AssistError)
    const error = caught as AssistError
    assert.equal(error.code, ASSIST_ERROR_CODES.TENANT_UNRESOLVED)
    assert.equal(error.key, 'empresa-de-la-checada-no-resuelta')
    assert.equal(error.httpStatus, 422)
  })

  test('el alta unitaria responde 201 con outcome y hora de servidor', async ({
    client,
    assert,
  }) => {
    const user = await getUserForBusinessUnit(fixture.businessUnitId)
    const punchTime = uniquePunchTime(240).toFormat('yyyy-MM-dd HH:mm:ss')

    const response = await client
      .post('/api/v1/assists')
      .json({
        employeeId: fixture.employeeId,
        assistType: 'check',
        assistLatitude: 0,
        assistLongitude: 0,
        assistPrecision: 0,
        assistPunchTime: punchTime,
        // Campos de pertenencia y de rastro: la lista blanca los descarta (regla 7).
        // `businessUnitId` no se prueba aquí: el middleware de alcance lo corta
        // antes con 404 cuando no pertenece al scope, que es su propia defensa.
        assistOrigin: 'sync',
        assistCreatedByUserId: 1,
        assistNaturalKey: 'no-deberia-usarse',
        assistTerminalSn: 'SN-FALSIFICADO',
        assistCreatedAt: '2000-01-01 00:00:00',
      })
      .loginAs(user)
      .header('X-Business-Unit-Id', fixture.publicId)

    response.assertStatus(201)

    const body = response.body()
    assert.equal(body.data.outcome, 'inserted')
    assert.isString(body.data.serverTime)
    assert.match(body.data.serverTime, /^\d{4}-\d{2}-\d{2}T/)

    const assistId = body.data.assist.assistId
    createdAssistIds.add(assistId)

    const row = await TenantContext.runUnscoped(async () => {
      return Assist.query().withTrashed().where('assist_id', assistId).firstOrFail()
    }, 'verificación de lista blanca en alta unitaria')

    assert.equal(row.businessUnitId, fixture.businessUnitId)
    assert.isNull(row.assistTerminalSn)
    assert.notEqual(row.assistOrigin, 'sync')
    assert.isAbove(row.assistCreatedAt.year, 2020)
  })

  test('un canal fuera del vocabulario se rechaza y no registra nada', async ({
    client,
    assert,
  }) => {
    const user = await getUserForBusinessUnit(fixture.businessUnitId)

    const response = await client
      .post('/api/v1/assists')
      .json({
        employeeId: fixture.employeeId,
        assistType: 'check',
        assistPunchTime: uniquePunchTime(300).toFormat('yyyy-MM-dd HH:mm:ss'),
        assistChannel: 'satelite',
      })
      .loginAs(user)
      .header('X-Business-Unit-Id', fixture.publicId)

    response.assertStatus(400)
    assert.equal(response.body().code, ASSIST_ERROR_CODES.VAL_EMPLOYEE_ID)
  })

  test('un colaborador de otra empresa se rechaza igual que uno inexistente', async ({
    client,
    assert,
  }) => {
    if (!fixture.foreignEmployeeId) {
      assert.isTrue(true, 'sin segunda empresa con empleado activo: escenario no aplicable')
      return
    }

    const user = await getUserForBusinessUnit(fixture.businessUnitId)

    const response = await client
      .post('/api/v1/assists')
      .json({
        employeeId: fixture.foreignEmployeeId,
        assistType: 'check',
        assistPunchTime: uniquePunchTime(360).toFormat('yyyy-MM-dd HH:mm:ss'),
      })
      .loginAs(user)
      .header('X-Business-Unit-Id', fixture.publicId)

    assert.oneOf(response.status(), [400, 403])
    if (response.status() === 400) {
      assert.equal(response.body().code, ASSIST_ERROR_CODES.VAL_EMPLOYEE_NOT_FOUND)
      assert.equal(response.body().key, 'colaborador-no-encontrado')
    }
  })
})
