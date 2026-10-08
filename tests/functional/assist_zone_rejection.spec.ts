import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import limiter from '@adonisjs/limiter/services/main'
import { DateTime } from 'luxon'
import type { ApiClient } from '@japa/api-client'
import SystemSetting from '#models/system_setting'
import type User from '#models/user'
import { ASSIST_ERROR_CODES } from '#constants/assist_error_codes'
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
 * VLRH-H1790812613754 — la checada con ubicación se compara contra las zonas
 * autorizadas del empleado. Base de datos real, por las dos rutas: unitaria
 * (`POST /api/v1/assists`) y lote (`POST /api/v1/assists/batch`).
 *
 * El empleado de cada empresa es la persona del usuario actor: la checada es
 * propia, como la de la app, y no necesita el permiso de captura ajena.
 */

interface Tenant {
  actor: TenantActor
  fixture: EmployeeFixture
  employeeId: number
  zoneIds: number[]
}

let punchOffset = 0

/** Hora de captura reciente e irrepetible: cada checada de la corrida es otra identidad. */
function nextPunchTime(): string {
  punchOffset += 7
  return DateTime.utc()
    .startOf('second')
    .minus({ hours: 2 })
    .plus({ seconds: punchOffset })
    .toISO() as string
}

async function createTenant(prefix: string, toleranceMeters: number): Promise<Tenant> {
  const actor = await createTenantActor(prefix)
  const businessUnitId = actor.businessUnit.businessUnitId
  const fixture = await createEmployeeFixture(businessUnitId, prefix)
  // La checada es propia: el empleado es la persona del usuario.
  await db
    .from('employees')
    .where('employee_id', fixture.employee.employeeId)
    .update({ person_id: actor.person.personId, employee_authorize_any_zones: 0 })
  await SystemSetting.create({
    businessUnitId,
    systemSettingTradeName: `Geo ${prefix} ${Date.now()}`,
    systemSettingSidebarColor: '#111111',
    systemSettingActive: 1,
    systemSettingMonthlyConversionFactor: 30.4,
    systemSettingZoneToleranceMeters: toleranceMeters,
  })
  return { actor, fixture, employeeId: fixture.employee.employeeId, zoneIds: [] }
}

async function cleanupTenant(tenant: Tenant | null) {
  if (!tenant) return
  const businessUnitId = tenant.actor.businessUnit.businessUnitId
  await db.from('assists').where('assist_emp_id', tenant.employeeId).delete()
  await db.from('employee_assist_calendars').where('employee_id', tenant.employeeId).delete()
  await db.from('assist_calendar_recalc_jobs').where('employee_id', tenant.employeeId).delete()
  await cleanupAssistGeo(tenant.employeeId, tenant.zoneIds)
  await db.from('system_settings').where('business_unit_id', businessUnitId).delete()
  // El empleado vuelve a su persona propia antes de borrarlo con su fixture.
  await db
    .from('employees')
    .where('employee_id', tenant.employeeId)
    .update({ person_id: tenant.fixture.person.personId })
  await cleanupEmployeeFixture(tenant.fixture)
  await cleanupTenantActor(tenant.actor)
}

/** Deja al empleado con exactamente estas zonas, creadas para él. */
async function resetZones(tenant: Tenant, zones: { businessUnitId: number | null; polygon: string; deleted?: boolean }[]) {
  await cleanupAssistGeo(tenant.employeeId, tenant.zoneIds)
  tenant.zoneIds = []
  for (const zone of zones) {
    const zoneId = await createAssistGeoZone(zone.businessUnitId, zone.polygon, zone.deleted ?? false)
    tenant.zoneIds.push(zoneId)
    await assignAssistGeoZone(tenant.employeeId, tenant.actor.businessUnit.businessUnitId, zoneId)
  }
}

function storeOne(
  client: ApiClient,
  tenant: Tenant,
  point: GeoPoint | null,
  precision: number | null = null,
  extra: Record<string, unknown> = {}
) {
  return client
    .post('/api/v1/assists')
    .json({
      employeeId: tenant.employeeId,
      assistType: 'check',
      assistPunchTime: nextPunchTime(),
      assistChannel: 'app',
      ...(point ? assistGeoBody(point, precision) : {}),
      ...extra,
    })
    .loginAs(tenant.actor.user as User)
    .header('X-Business-Unit-Id', tenant.actor.businessUnit.businessUnitPublicId)
}

/** Manda la checada y afirma el estado HTTP. */
async function expectStore(
  status: number,
  client: ApiClient,
  tenant: Tenant,
  point: GeoPoint | null,
  precision: number | null = null,
  extra: Record<string, unknown> = {}
) {
  const response = await storeOne(client, tenant, point, precision, extra)
  response.assertStatus(status)
  return response
}

async function assistCount(employeeId: number): Promise<number> {
  const row = await db.from('assists').where('assist_emp_id', employeeId).count('* as total').first()
  return Number((row as { total: number } | null)?.total ?? 0)
}

test.group('Checadas fuera de zona (VLRH-H1790812613754)', (group) => {
  let a: Tenant | null = null
  let b: Tenant | null = null

  group.setup(async () => {
    a = await createTenant('geo-a', 50)
    b = await createTenant('geo-b', 100)
  })

  group.teardown(async () => {
    await cleanupTenant(a)
    await cleanupTenant(b)
  })

  group.each.setup(async () => {
    // El alta tiene cuota por usuario (20 cada 5 minutos): cada caso empieza limpio.
    await limiter.clear()
    await resetZones(a!, [{ businessUnitId: a!.actor.businessUnit.businessUnitId, polygon: ASSIST_GEO_ZONES.Z1_POLYGON }])
    await setAssistGeoTolerance(a!.actor.businessUnit.businessUnitId, 50)
    await setAssistGeoAnyZone(a!.employeeId, false)
  })

  test('CA-01: dentro de la zona responde 201 y guarda la checada', async ({ client, assert }) => {
    const before = await assistCount(a!.employeeId)
    const response = await storeOne(client, a!, ASSIST_GEO_POINTS.CENTER)
    response.assertStatus(201)
    assert.equal(response.body().data.outcome, 'inserted')
    assert.equal(await assistCount(a!.employeeId), before + 1)
  })

  test('CA-02: fuera de la zona responde 422 AST.GEO.001 y no guarda nada', async ({
    client,
    assert,
  }) => {
    const before = await assistCount(a!.employeeId)
    const response = await storeOne(client, a!, ASSIST_GEO_POINTS.HOME)
    response.assertStatus(422)
    const body = response.body()
    assert.equal(body.type, 'warning')
    assert.equal(body.key, 'checada-fuera-de-zona')
    assert.equal(body.code, ASSIST_ERROR_CODES.GEO_OUTSIDE_ZONE)
    assert.isString(body.title)
    assert.isString(body.detail)
    assert.equal(await assistCount(a!.employeeId), before)
  })

  test('CA-03: la holgura es la mayor entre margen y precisión topada; margen 0 la anula', async ({
    client,
  }) => {
    const { NORTH_80, NORTH_120, NORTH_30, NORTH_45 } = ASSIST_GEO_POINTS
    await expectStore(422, client, a!, NORTH_80, 70)
    await expectStore(201, client, a!, NORTH_80, 90)
    await expectStore(201, client, a!, NORTH_80, 400)
    await expectStore(422, client, a!, NORTH_80, null)
    await expectStore(422, client, a!, NORTH_120, 400)
    await expectStore(201, client, a!, NORTH_30, 5)
    await expectStore(201, client, a!, NORTH_45, -500)

    await setAssistGeoTolerance(a!.actor.businessUnit.businessUnitId, 0)
    await expectStore(422, client, a!, NORTH_30, 90)
  })

  test('CA-04: cada empleado se evalúa con el margen de su empresa', async ({ client }) => {
    await resetZones(b!, [{ businessUnitId: b!.actor.businessUnit.businessUnitId, polygon: ASSIST_GEO_ZONES.Z1_POLYGON }])
    await expectStore(422, client, a!, ASSIST_GEO_POINTS.NORTH_80)
    await expectStore(201, client, b!, ASSIST_GEO_POINTS.NORTH_80)
  })

  test('CA-06: sin ubicación se guarda como hoy', async ({ client }) => {
    await resetZones(a!, [])
    await expectStore(201, client, a!, null)
  })

  test('CA-07: "cualquier zona" acepta fuera de zona y sin asignaciones', async ({ client }) => {
    await resetZones(a!, [])
    await setAssistGeoAnyZone(a!.employeeId, true)
    await expectStore(201, client, a!, ASSIST_GEO_POINTS.HOME)
  })

  test('CA-08: coordenadas imposibles responden 400 AST.VAL.013 sin fila', async ({
    client,
    assert,
  }) => {
    const before = await assistCount(a!.employeeId)
    const cases: Record<string, unknown>[] = [
      { assistLatitude: 91, assistLongitude: -103.354 },
      { assistLatitude: 20.674, assistLongitude: -181 },
      { assistLatitude: 20.674, assistLongitude: null },
    ]
    for (const coordinates of cases) {
      const response = await storeOne(client, a!, null, null, coordinates)
      response.assertStatus(400)
      assert.equal(response.body().code, ASSIST_ERROR_CODES.VAL_COORDINATES_INVALID)
      assert.equal(response.body().key, 'coordenadas-invalidas')
    }
    const notNumeric = await storeOne(client, a!, null, null, {
      assistLatitude: 'norte',
      assistLongitude: -103.354,
    })
    notNumeric.assertStatus(400)
    assert.equal(notNumeric.body().code, ASSIST_ERROR_CODES.VAL_EMPLOYEE_ID)
    assert.equal(await assistCount(a!.employeeId), before)
  })

  test('CA-09: sin zonas asignadas responde 422 AST.GEO.002', async ({ client, assert }) => {
    await resetZones(a!, [])
    const response = await storeOne(client, a!, ASSIST_GEO_POINTS.CENTER)
    response.assertStatus(422)
    assert.equal(response.body().code, ASSIST_ERROR_CODES.GEO_NO_AUTHORIZED_ZONE)
    assert.equal(response.body().key, 'empleado-sin-zona-autorizada')
  })

  test('CA-10: zona sin empresa, ajena, corrupta, vacía o borrada responde AST.GEO.003', async ({
    client,
    assert,
  }) => {
    const ownBusinessUnitId = a!.actor.businessUnit.businessUnitId
    const variants = [
      { businessUnitId: null, polygon: ASSIST_GEO_ZONES.Z1_POLYGON },
      { businessUnitId: b!.actor.businessUnit.businessUnitId, polygon: ASSIST_GEO_ZONES.Z1_POLYGON },
      { businessUnitId: ownBusinessUnitId, polygon: ASSIST_GEO_ZONES.Z_CORRUPT },
      { businessUnitId: ownBusinessUnitId, polygon: ASSIST_GEO_ZONES.Z_EMPTY },
      { businessUnitId: ownBusinessUnitId, polygon: ASSIST_GEO_ZONES.Z1_POLYGON, deleted: true },
    ]
    for (const variant of variants) {
      await resetZones(a!, [variant])
      const response = await storeOne(client, a!, ASSIST_GEO_POINTS.CENTER)
      response.assertStatus(422)
      assert.equal(
        response.body().code,
        ASSIST_ERROR_CODES.GEO_ZONE_NOT_EVALUABLE,
        JSON.stringify({ ...variant, polygon: variant.polygon.slice(0, 20) })
      )
      assert.equal(response.body().key, 'zona-no-evaluable')
    }
  })

  test('CA-11: polilínea abierta, marcador suelto y figuras mezcladas', async ({ client }) => {
    const own = a!.actor.businessUnit.businessUnitId
    await resetZones(a!, [{ businessUnitId: own, polygon: ASSIST_GEO_ZONES.Z1_OPEN_LINESTRING }])
    await expectStore(201, client, a!, ASSIST_GEO_POINTS.WEST_IN)
    await expectStore(201, client, a!, ASSIST_GEO_POINTS.WEST_30)

    await resetZones(a!, [{ businessUnitId: own, polygon: ASSIST_GEO_ZONES.Z_POINT }])
    await expectStore(201, client, a!, ASSIST_GEO_POINTS.POINT_40)
    await expectStore(422, client, a!, ASSIST_GEO_POINTS.POINT_60)

    await resetZones(a!, [{ businessUnitId: own, polygon: ASSIST_GEO_ZONES.Z_MIXED }])
    await expectStore(201, client, a!, ASSIST_GEO_POINTS.CENTER)
  })

  test('CA-12 y CA-13: en el lote cada elemento se decide solo y los rechazados no se guardan', async ({
    client,
    assert,
  }) => {
    const before = await assistCount(a!.employeeId)
    const homePunch = nextPunchTime()
    const item = (point: GeoPoint, punch: string) => ({
      employeeId: a!.employeeId,
      assistType: 'check',
      assistPunchTime: punch,
      assistChannel: 'app',
      ...assistGeoBody(point),
    })

    const response = await client
      .post('/api/v1/assists/batch')
      .json({
        assists: [
          item(ASSIST_GEO_POINTS.CENTER, nextPunchTime()),
          item(ASSIST_GEO_POINTS.HOME, homePunch),
          item(ASSIST_GEO_POINTS.HOME, homePunch),
        ],
      })
      .loginAs(a!.actor.user as User)
      .header('X-Business-Unit-Id', a!.actor.businessUnit.businessUnitPublicId)

    response.assertStatus(200)
    const { results, summary } = response.body().data
    assert.equal(results[0].outcome, 'inserted')
    assert.equal(results[1].outcome, 'rejected')
    assert.equal(results[1].error.code, ASSIST_ERROR_CODES.GEO_OUTSIDE_ZONE)
    // El gemelo exacto se evalúa por sí mismo: no sale como duplicado del lote.
    assert.equal(results[2].outcome, 'rejected')
    assert.equal(results[2].error.code, ASSIST_ERROR_CODES.GEO_OUTSIDE_ZONE)
    assert.equal(summary.rejected, 2)
    assert.equal(await assistCount(a!.employeeId), before + 1)

    const single = await storeOne(client, a!, ASSIST_GEO_POINTS.HOME)
    assert.equal(single.body().code, results[1].error.code)
  })

  test('CA-14: el canal kiosco no exime y el rechazo no revela geografía', async ({
    client,
    assert,
  }) => {
    const response = await storeOne(client, a!, ASSIST_GEO_POINTS.HOME, 15, {
      assistChannel: 'kiosk',
    })
    response.assertStatus(422)
    assert.equal(response.body().code, ASSIST_ERROR_CODES.GEO_OUTSIDE_ZONE)
    const text = JSON.stringify(response.body())
    for (const fragment of ['20.68', '103.36', '761', 'zoneId', 'zonePolygon', 'Zona prueba', '"50"']) {
      assert.notInclude(text, fragment)
    }
  })

  test('CA-16: la misma checada dos veces sale inserted y luego preexisting', async ({
    client,
    assert,
  }) => {
    const punch = nextPunchTime()
    const extra = { assistPunchTime: punch }
    const first = await storeOne(client, a!, ASSIST_GEO_POINTS.CENTER, null, extra)
    const second = await storeOne(client, a!, ASSIST_GEO_POINTS.CENTER, null, extra)
    first.assertStatus(201)
    second.assertStatus(201)
    assert.equal(first.body().data.outcome, 'inserted')
    assert.equal(second.body().data.outcome, 'preexisting')
  })
})
