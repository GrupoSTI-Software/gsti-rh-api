import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import limiter from '@adonisjs/limiter/services/main'
import { DateTime } from 'luxon'
import type { ApiClient } from '@japa/api-client'
import type { Assert } from '@japa/assert'
import SystemSetting from '#models/system_setting'
import Shift from '#models/shift'
import EmployeeShift from '#models/employee_shift'
import type User from '#models/user'
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
} from '#tests/helpers/assist_geo_fixtures'
import type { GeoPoint } from '#utils/geo_polygon'

/**
 * VLRH-H1790812613756, CA-12 — la marca de ubicación no viaja en ninguna
 * respuesta (regla 6; R6 de VLRH-C0014). Se siembra una checada `simulated` por
 * la ruta real y se recorren las seis rutas que leen o escriben checadas.
 *
 * El actor es un usuario de la empresa que no es owner y cuyo rol no tiene
 * concesiones, así que tampoco tiene `read` de `employees-attendance-monitor`.
 * Las cuatro rutas de lectura no llevan gate de permiso, de modo que este mismo
 * usuario las alcanza como las alcanzaría uno con todos los permisos. Cuando
 * VLRH-H1791056345261 proyecte la marca con ese permiso, este caso debe seguir
 * en verde sin editarse.
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

/** Afirma que el cuerpo no contiene la marca bajo ninguno de sus dos nombres. */
function assertNoFlag(assert: Assert, route: string, responseBody: unknown) {
  const text = JSON.stringify(responseBody)
  assert.notInclude(text, 'assistLocationFlag', route)
  assert.notInclude(text, 'assist_location_flag', route)
}

test.group('La marca de ubicación no se expone (VLRH-H1790812613756)', (group) => {
  let a: Tenant | null = null
  let assistId = 0
  let punchDay = ''

  group.setup(async () => {
    a = await createTenant('marca-oculta')
    await resetZones(a, true)
  })

  group.teardown(async () => {
    await cleanupTenant(a)
  })

  group.each.setup(async () => {
    await limiter.clear()
  })

  test('CA-12: ninguna de las seis rutas devuelve la marca', async ({ client, assert }) => {
    const seeded = body(a!, ASSIST_GEO_POINTS.CENTER, true)
    const store = await storeOne(client, a!, seeded)
    store.assertStatus(201)
    assistId = store.body().data.assist.assistId
    const row = await db.from('assists').where('assist_id', assistId).select('assist_location_flag').first()
    assert.equal((row as { assist_location_flag: string | null }).assist_location_flag, 'simulated')
    assertNoFlag(assert, 'POST /api/v1/assists', store.body())

    const batch = await storeBatch(client, a!, [body(a!, ASSIST_GEO_POINTS.CENTER, true)])
    batch.assertStatus(200)
    assertNoFlag(assert, 'POST /api/v1/assists/batch', batch.body())

    punchDay = DateTime.fromISO(String(seeded.assistPunchTime)).toUTC().toFormat('yyyy-MM-dd')
    const from = DateTime.fromISO(punchDay).minus({ days: 1 }).toFormat('yyyy-MM-dd')
    const to = DateTime.fromISO(punchDay).plus({ days: 1 }).toFormat('yyyy-MM-dd')

    const reads: { route: string; path: string; qs: Record<string, unknown> }[] = [
      {
        route: 'GET /api/v1/assists/get-flat-list',
        path: '/api/v1/assists/get-flat-list',
        qs: { employeeId: a!.employeeId, dateStart: from, dateEnd: to },
      },
      {
        route: 'GET /api/v1/employee-assist-calendars',
        path: '/api/v1/employee-assist-calendars',
        qs: { 'employeeId': a!.employeeId, 'date': from, 'date-end': to },
      },
      {
        route: 'GET /api/v1/assists/:assistId/source',
        path: `/api/v1/assists/${assistId}/source`,
        qs: {},
      },
      {
        route: 'GET /api/v1/assists',
        path: '/api/v1/assists',
        qs: { 'employeeId': a!.employeeId, 'date': from, 'date-end': to },
      },
    ]

    for (const read of reads) {
      const response = await client
        .get(read.path)
        .qs(read.qs)
        .loginAs(a!.actor.user as User)
        .header('X-Business-Unit-Id', a!.actor.businessUnit.businessUnitPublicId)
      // Un error también "no trae la marca": se exige la respuesta real.
      assert.equal(response.status(), 200, `${read.route}: ${JSON.stringify(response.body()).slice(0, 300)}`)
      assertNoFlag(assert, read.route, response.body())
    }
  })
})
