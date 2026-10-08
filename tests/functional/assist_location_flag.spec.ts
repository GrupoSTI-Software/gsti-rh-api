import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import limiter from '@adonisjs/limiter/services/main'
import { DateTime } from 'luxon'
import type { ApiClient } from '@japa/api-client'
import SystemSetting from '#models/system_setting'
import Shift from '#models/shift'
import EmployeeShift from '#models/employee_shift'
import type User from '#models/user'
import { ASSIST_ERROR_CODES } from '#constants/assist_error_codes'
import { ASSIST_ORIGIN } from '#constants/assist_origin'
import AssistIngestionService from '#modules/assist-ingestion/assist_ingestion.service'
import AssistIngestionRepositoryMysql from '#modules/assist-ingestion/assist_ingestion.repository.mysql'
import type {
  CalendarRecalcJob,
  CalendarRecalcRepository,
} from '#modules/assist-ingestion/calendar-recalc/calendar_recalc.repository'
import { TenantContext } from '#utils/tenant_context'
import {
  cleanupTenantActor,
  createTenantActor,
  type TenantActor,
} from '#tests/helpers/tenant_actor'
import {
  cleanupEmployeeFixture,
  createEmployeeFixture,
  type EmployeeFixture,
} from '#tests/helpers/employee_fixture'
import {
  ASSIST_GEO_POINTS,
  ASSIST_GEO_ZONES,
  assignAssistGeoZone,
  assistGeoBody,
  cleanupAssistGeo,
  createAssistGeoZone,
  setAssistGeoAnyZone,
  setAssistGeoTolerance,
} from '#tests/helpers/assist_geo_fixtures'
import type { GeoPoint } from '#utils/geo_polygon'

/**
 * VLRH-H1790812613756 — cada checada aceptada con ubicación guarda su marca
 * (`simulated`, `unverified` o NULL) sin que cambie nada de lo que responde el
 * sistema. Base de datos real, por las dos rutas: unitaria (`POST /api/v1/assists`)
 * y lote (`POST /api/v1/assists/batch`).
 *
 * La marca se lee directo de la tabla: el modelo no la serializa.
 */

interface Tenant {
  actor: TenantActor
  fixture: EmployeeFixture
  employeeId: number
  shiftId: number
  zoneIds: number[]
}

/** Valor del indicador en el cuerpo; `'absent'` omite el campo. */
type Indicator = boolean | null | 'absent'

let punchOffset = 0

/** Hora de captura reciente e irrepetible: cada checada de la corrida es otra identidad. */
function nextPunchTime(): string {
  punchOffset += 7
  return DateTime.utc()
    .startOf('second')
    .minus({ hours: 3 })
    .plus({ seconds: punchOffset })
    .toISO() as string
}

async function createTenant(prefix: string): Promise<Tenant> {
  const actor = await createTenantActor(prefix)
  const businessUnitId = actor.businessUnit.businessUnitId
  const fixture = await createEmployeeFixture(businessUnitId, prefix)
  // La checada es propia, como la de la app: el empleado es la persona del usuario.
  await db
    .from('employees')
    .where('employee_id', fixture.employee.employeeId)
    .update({ person_id: actor.person.personId, employee_authorize_any_zones: 0 })
  await SystemSetting.create({
    businessUnitId,
    systemSettingTradeName: `Marca ${prefix} ${Date.now()}`,
    systemSettingSidebarColor: '#111111',
    systemSettingActive: 1,
    systemSettingMonthlyConversionFactor: 30.4,
    systemSettingZoneToleranceMeters: 50,
  })
  // El listado del monitor responde 400 a un empleado sin turno.
  const shift = await Shift.create({
    shiftName: `Turno marca ${prefix} ${Date.now()}`,
    shiftCalculateFlag: '',
    shiftDayStart: 1,
    shiftTimeStart: '08:00:00',
    shiftActiveHours: 8,
    shiftRestDays: '7',
    shiftAccumulatedFault: 0,
    businessUnitId,
    shiftTemp: 0,
  })
  await EmployeeShift.create({
    employeeId: fixture.employee.employeeId,
    shiftId: shift.shiftId,
    businessUnitId,
    employeShiftsApplySince: '2024-01-01',
  })
  return {
    actor,
    fixture,
    employeeId: fixture.employee.employeeId,
    shiftId: shift.shiftId,
    zoneIds: [],
  }
}

async function cleanupTenant(tenant: Tenant | null) {
  if (!tenant) return
  const businessUnitId = tenant.actor.businessUnit.businessUnitId
  await db.from('assists').where('assist_emp_id', tenant.employeeId).delete()
  await db.from('employee_assist_calendars').where('employee_id', tenant.employeeId).delete()
  await db.from('assist_calendar_recalc_jobs').where('employee_id', tenant.employeeId).delete()
  await cleanupAssistGeo(tenant.employeeId, tenant.zoneIds)
  await db.from('employee_shifts').where('employee_id', tenant.employeeId).delete()
  await db.from('shifts').where('shift_id', tenant.shiftId).delete()
  await db.from('system_settings').where('business_unit_id', businessUnitId).delete()
  await db
    .from('employees')
    .where('employee_id', tenant.employeeId)
    .update({ person_id: tenant.fixture.person.personId })
  await cleanupEmployeeFixture(tenant.fixture)
  await cleanupTenantActor(tenant.actor)
}

/** Deja al empleado con exactamente la zona Z1 de su empresa, o sin zonas. */
async function resetZones(tenant: Tenant, withZone: boolean) {
  await cleanupAssistGeo(tenant.employeeId, tenant.zoneIds)
  tenant.zoneIds = []
  if (!withZone) return
  const businessUnitId = tenant.actor.businessUnit.businessUnitId
  const zoneId = await createAssistGeoZone(businessUnitId, ASSIST_GEO_ZONES.Z1_POLYGON, false)
  tenant.zoneIds.push(zoneId)
  await assignAssistGeoZone(tenant.employeeId, businessUnitId, zoneId)
}

function indicatorField(indicator: Indicator): Record<string, unknown> {
  return indicator === 'absent' ? {} : { assistIsMocked: indicator }
}

/** Cuerpo de una checada propia por el canal app. */
function body(
  tenant: Tenant,
  point: GeoPoint | null,
  indicator: Indicator,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    employeeId: tenant.employeeId,
    assistType: 'check',
    assistPunchTime: nextPunchTime(),
    assistChannel: 'app',
    ...(point ? assistGeoBody(point) : {}),
    ...indicatorField(indicator),
    ...extra,
  }
}

function storeOne(client: ApiClient, tenant: Tenant, payload: Record<string, unknown>) {
  return client
    .post('/api/v1/assists')
    .json(payload)
    .loginAs(tenant.actor.user as User)
    .header('X-Business-Unit-Id', tenant.actor.businessUnit.businessUnitPublicId)
}

function storeBatch(client: ApiClient, tenant: Tenant, assists: Record<string, unknown>[]) {
  return client
    .post('/api/v1/assists/batch')
    .json({ assists })
    .loginAs(tenant.actor.user as User)
    .header('X-Business-Unit-Id', tenant.actor.businessUnit.businessUnitPublicId)
}

/** Marca guardada de una checada, leída de la tabla. */
async function flagOf(assistId: number): Promise<string | null> {
  const row = await db.from('assists').where('assist_id', assistId).select('assist_location_flag').first()
  return (row as { assist_location_flag: string | null }).assist_location_flag
}

async function assistCount(employeeId: number): Promise<number> {
  const row = await db.from('assists').where('assist_emp_id', employeeId).count('* as total').first()
  return Number((row as { total: number } | null)?.total ?? 0)
}

/** Claves ordenadas de un objeto, para comparar la forma de dos respuestas. */
function keysOf(value: object): string[] {
  return Object.keys(value).sort()
}

test.group('Marca de ubicación de la checada (VLRH-H1790812613756)', (group) => {
  let a: Tenant | null = null

  group.setup(async () => {
    a = await createTenant('marca-a')
  })

  group.teardown(async () => {
    await cleanupTenant(a)
  })

  group.each.setup(async () => {
    // El alta tiene cuota por usuario (20 cada 5 minutos): cada caso empieza limpio.
    await limiter.clear()
    await resetZones(a!, true)
    await setAssistGeoTolerance(a!.actor.businessUnit.businessUnitId, 50)
    await setAssistGeoAnyZone(a!.employeeId, false)
  })

  test('CA-01: dentro de la zona con indicador true guarda "simulated"', async ({
    client,
    assert,
  }) => {
    const response = await storeOne(client, a!, body(a!, ASSIST_GEO_POINTS.CENTER, true))
    response.assertStatus(201)
    assert.equal(response.body().data.outcome, 'inserted')
    assert.equal(await flagOf(response.body().data.assist.assistId), 'simulated')
  })

  test('CA-02: false, ausente y null guardan NULL, "unverified" y "unverified"', async ({
    client,
    assert,
  }) => {
    const indicators: Indicator[] = [false, 'absent', null]
    const flags: (string | null)[] = []
    for (const indicator of indicators) {
      const response = await storeOne(client, a!, body(a!, ASSIST_GEO_POINTS.CENTER, indicator))
      response.assertStatus(201)
      assert.equal(response.body().data.outcome, 'inserted')
      flags.push(await flagOf(response.body().data.assist.assistId))
    }
    assert.deepEqual(flags, [null, 'unverified', 'unverified'])
  })

  test('CA-03: el lote marca igual que la unitaria', async ({ client, assert }) => {
    const indicators: Indicator[] = [true, false, 'absent', null]
    const response = await storeBatch(
      client,
      a!,
      indicators.map((indicator) => body(a!, ASSIST_GEO_POINTS.CENTER, indicator))
    )
    response.assertStatus(200)
    const { results } = response.body().data
    const flags: (string | null)[] = []
    for (const result of results) {
      assert.equal(result.outcome, 'inserted')
      flags.push(await flagOf(result.assistId))
    }
    assert.deepEqual(flags, ['simulated', null, 'unverified', 'unverified'])
  })

  test('CA-04: fuera de zona o sin zonas se rechaza aunque venga simulada, sin fila', async ({
    client,
    assert,
  }) => {
    const before = await assistCount(a!.employeeId)

    const outside = await storeOne(client, a!, body(a!, ASSIST_GEO_POINTS.HOME, true))
    outside.assertStatus(422)
    assert.equal(outside.body().key, 'checada-fuera-de-zona')
    assert.equal(outside.body().code, ASSIST_ERROR_CODES.GEO_OUTSIDE_ZONE)

    const batch = await storeBatch(client, a!, [body(a!, ASSIST_GEO_POINTS.HOME, true)])
    batch.assertStatus(200)
    assert.equal(batch.body().data.results[0].outcome, 'rejected')
    assert.equal(batch.body().data.results[0].error.code, ASSIST_ERROR_CODES.GEO_OUTSIDE_ZONE)

    await resetZones(a!, false)
    const noZones = await storeOne(client, a!, body(a!, ASSIST_GEO_POINTS.CENTER, true))
    noZones.assertStatus(422)
    assert.equal(noZones.body().code, ASSIST_ERROR_CODES.GEO_NO_AUTHORIZED_ZONE)

    assert.equal(await assistCount(a!.employeeId), before)
  })

  test('CA-05: "cualquier zona" también se marca', async ({ client, assert }) => {
    await setAssistGeoAnyZone(a!.employeeId, true)
    const response = await storeOne(client, a!, body(a!, ASSIST_GEO_POINTS.HOME, true))
    response.assertStatus(201)
    assert.equal(response.body().data.outcome, 'inserted')
    assert.equal(await flagOf(response.body().data.assist.assistId), 'simulated')
  })

  test('CA-06: sin latitud ni longitud el indicador se ignora', async ({ client, assert }) => {
    const noGeo = await storeOne(client, a!, body(a!, null, true))
    noGeo.assertStatus(201)
    assert.equal(noGeo.body().data.outcome, 'inserted')
    assert.isNull(await flagOf(noGeo.body().data.assist.assistId))

    const onlyPrecision = await storeOne(client, a!, body(a!, null, true, { assistPrecision: 15 }))
    onlyPrecision.assertStatus(201)
    assert.isNull(await flagOf(onlyPrecision.body().data.assist.assistId))
  })

  test('CA-07: el canal kiosco no exime ni cambia la marca', async ({ client, assert }) => {
    const response = await storeOne(
      client,
      a!,
      body(a!, ASSIST_GEO_POINTS.CENTER, true, { assistChannel: 'kiosk' })
    )
    response.assertStatus(201)
    assert.equal(await flagOf(response.body().data.assist.assistId), 'simulated')
  })

  test('CA-08: la checada de ADMS entra sin marca', async ({ assert }) => {
    const businessUnitId = a!.actor.businessUnit.businessUnitId
    const recalc: CalendarRecalcRepository = { async enqueue() {} }
    const service = new AssistIngestionService(new AssistIngestionRepositoryMysql(), recalc)
    const result = await TenantContext.run([businessUnitId], () =>
      service.ingest(
        [
          {
            subject: {
              kind: 'employeeCode',
              employeeCode: String(a!.fixture.employee.employeeCode),
              businessUnitId,
            },
            assistType: null,
            punchTimeUtc: DateTime.fromISO(nextPunchTime(), { zone: 'utc' }),
            // Así lo arma `attlog_ingestion.service.ts`: tres nulos, sin indicador.
            geo: { latitude: null, longitude: null, precision: null },
            origin: ASSIST_ORIGIN.ADMS,
            createdByUserId: null,
            terminalSn: 'TEST-ADMS-MARCA',
            terminalAlias: 'Checador de prueba',
            verifyMethod: 15,
            clientRef: null,
          },
        ],
        { deferCalendarRecalc: true }
      )
    )
    assert.equal(result.results[0].outcome, 'inserted')
    assert.isNull(await flagOf(result.results[0].assist!.assistId))
  })

  test('CA-09: el reenvío conserva la marca de la primera llegada', async ({
    client,
    assert,
  }) => {
    // Unitaria: simulada y luego "no simulada".
    const first = body(a!, ASSIST_GEO_POINTS.CENTER, true)
    const original = await storeOne(client, a!, first)
    original.assertStatus(201)
    assert.equal(original.body().data.outcome, 'inserted')
    const resent = await storeOne(client, a!, { ...first, assistIsMocked: false })
    resent.assertStatus(201)
    assert.equal(resent.body().data.outcome, 'preexisting')
    assert.equal(resent.body().data.assist.assistId, original.body().data.assist.assistId)
    assert.equal(await flagOf(original.body().data.assist.assistId), 'simulated')

    // Unitaria al revés: sin indicador y luego simulada.
    const unverified = body(a!, ASSIST_GEO_POINTS.CENTER, 'absent')
    const second = await storeOne(client, a!, unverified)
    await storeOne(client, a!, { ...unverified, assistIsMocked: true })
    assert.equal(await flagOf(second.body().data.assist.assistId), 'unverified')

    // Lote: misma checada con otro indicador.
    const batchItem = body(a!, ASSIST_GEO_POINTS.CENTER, true)
    const batchFirst = await storeBatch(client, a!, [batchItem])
    const batchSecond = await storeBatch(client, a!, [{ ...batchItem, assistIsMocked: false }])
    assert.equal(batchFirst.body().data.results[0].outcome, 'inserted')
    assert.equal(batchSecond.body().data.results[0].outcome, 'preexisting')
    assert.equal(await flagOf(batchFirst.body().data.results[0].assistId), 'simulated')
  })

  test('CA-10: un indicador no booleano responde 400 AST.VAL.002 sin fila', async ({
    client,
    assert,
  }) => {
    const before = await assistCount(a!.employeeId)
    const response = await storeOne(
      client,
      a!,
      body(a!, ASSIST_GEO_POINTS.CENTER, 'absent', { assistIsMocked: 'abc' })
    )
    response.assertStatus(400)
    assert.equal(response.body().key, 'datos-de-checada-invalidos')
    assert.equal(response.body().code, ASSIST_ERROR_CODES.VAL_EMPLOYEE_ID)
    assert.equal(await assistCount(a!.employeeId), before)

    const batch = await storeBatch(client, a!, [
      body(a!, ASSIST_GEO_POINTS.CENTER, 'absent', { assistIsMocked: 'abc' }),
      body(a!, ASSIST_GEO_POINTS.CENTER, true),
    ])
    batch.assertStatus(200)
    const { results } = batch.body().data
    assert.equal(results[0].outcome, 'rejected')
    assert.equal(results[0].error.code, ASSIST_ERROR_CODES.VAL_EMPLOYEE_ID)
    assert.equal(results[0].error.key, 'datos-de-checada-invalidos')
    assert.equal(results[1].outcome, 'inserted')
    assert.equal(await assistCount(a!.employeeId), before + 1)
  })

  test('CA-11: la respuesta es idéntica con cualquier indicador y no trae la marca', async ({
    client,
    assert,
  }) => {
    const indicators: Indicator[] = [true, false, 'absent']
    const shapes: { status: number; outcome: string; body: string[]; assist: string[] }[] = []
    for (const indicator of indicators) {
      const response = await storeOne(client, a!, body(a!, ASSIST_GEO_POINTS.CENTER, indicator))
      const responseBody = response.body()
      const text = JSON.stringify(responseBody)
      assert.notInclude(text, 'assistLocationFlag')
      assert.notInclude(text, 'assist_location_flag')
      shapes.push({
        status: response.status(),
        outcome: responseBody.data.outcome,
        body: keysOf(responseBody),
        assist: keysOf(responseBody.data.assist),
      })
    }
    assert.deepEqual(shapes[1], shapes[0])
    assert.deepEqual(shapes[2], shapes[0])

    const batch = await storeBatch(
      client,
      a!,
      indicators.map((indicator) => body(a!, ASSIST_GEO_POINTS.CENTER, indicator))
    )
    const text = JSON.stringify(batch.body())
    assert.notInclude(text, 'assistLocationFlag')
    assert.notInclude(text, 'assist_location_flag')
    const results = batch.body().data.results as Record<string, unknown>[]
    const resultShapes = results.map((result) => ({
      outcome: result.outcome,
      result: keysOf(result),
    }))
    assert.deepEqual(resultShapes[1], resultShapes[0])
    assert.deepEqual(resultShapes[2], resultShapes[0])
  })

  test('CA-13: la checada marcada cuenta para el día como cualquier otra', async ({
    client,
    assert,
  }) => {
    const businessUnitId = a!.actor.businessUnit.businessUnitId
    const enqueued: CalendarRecalcJob[] = []
    const recalc: CalendarRecalcRepository = {
      async enqueue(jobs) {
        enqueued.push(...jobs)
      },
    }
    const service = new AssistIngestionService(new AssistIngestionRepositoryMysql(), recalc)
    const result = await TenantContext.run([businessUnitId], () =>
      service.ingest(
        [
          {
            subject: { kind: 'employeeId', employeeId: a!.employeeId },
            assistType: 'check',
            punchTimeUtc: DateTime.fromISO(nextPunchTime(), { zone: 'utc' }),
            geo: {
              latitude: ASSIST_GEO_POINTS.CENTER.lat,
              longitude: ASSIST_GEO_POINTS.CENTER.lng,
              precision: null,
              isMocked: true,
            },
            origin: ASSIST_ORIGIN.SELF_SERVICE,
            createdByUserId: null,
            terminalSn: null,
            clientRef: null,
          },
        ],
        { deferCalendarRecalc: true }
      )
    )
    assert.equal(result.results[0].outcome, 'inserted')
    const assistId = result.results[0].assist!.assistId
    assert.equal(await flagOf(assistId), 'simulated')
    // El recálculo la recibe igual que a una sin marca.
    assert.lengthOf(enqueued, 1)
    assert.equal(enqueued[0].employeeId, a!.employeeId)

    // Y el listado del monitor la muestra como a cualquier otra.
    const punch = result.results[0].assist!.assistPunchTimeUtc
    const list = await client
      .get('/api/v1/assists')
      .qs({
        'employeeId': a!.employeeId,
        'date': punch.minus({ days: 1 }).toFormat('yyyy-MM-dd'),
        'date-end': punch.plus({ days: 1 }).toFormat('yyyy-MM-dd'),
      })
      .loginAs(a!.actor.user as User)
      .header('X-Business-Unit-Id', a!.actor.businessUnit.businessUnitPublicId)
    list.assertStatus(200)
    assert.include(JSON.stringify(list.body()), `"assistId":${assistId}`)
  })
})
