import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { AssistZoneContextLoader } from '#modules/assist-ingestion/geo/assist_zone_context.loader'
import { decideZone } from '#modules/assist-ingestion/geo/assist_zone_decision'
import SystemSetting from '#models/system_setting'
import { TenantContext } from '#utils/tenant_context'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
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
  cleanupAssistGeo,
  createAssistGeoZone,
} from '#tests/helpers/assist_geo_fixtures'

/**
 * VLRH-H1790812613754, SEC-754-2 — el cargador lee zonas y margen de la empresa
 * del registro, nunca de la petición. Una zona sin empresa o de otra empresa no
 * aporta geometría, con o sin contexto, e incluso con el contexto de otra empresa.
 */
test.group('AssistZoneContextLoader — aislamiento por empresa', (group) => {
  let actorA: TenantActor | null = null
  let actorB: TenantActor | null = null
  let employeeA: EmployeeFixture | null = null
  const zoneIds: number[] = []

  group.setup(async () => {
    actorA = await createTenantActor('geo-iso-a')
    actorB = await createTenantActor('geo-iso-b')
    employeeA = await createEmployeeFixture(actorA.businessUnit.businessUnitId, 'geo-iso')
    for (const [actor, meters] of [
      [actorA, 50],
      [actorB, 150],
    ] as const) {
      await SystemSetting.create({
        businessUnitId: actor.businessUnit.businessUnitId,
        systemSettingTradeName: `Geo iso ${actor.businessUnit.businessUnitId}`,
        systemSettingSidebarColor: '#111111',
        systemSettingActive: 1,
        systemSettingMonthlyConversionFactor: 30.4,
        systemSettingZoneToleranceMeters: meters,
      })
    }
  })

  group.teardown(async () => {
    if (employeeA) await cleanupAssistGeo(employeeA.employee.employeeId, zoneIds)
    for (const actor of [actorA, actorB]) {
      if (actor) {
        await db.from('system_settings').where('business_unit_id', actor.businessUnit.businessUnitId).delete()
      }
    }
    await cleanupEmployeeFixture(employeeA)
    await cleanupTenantActor(actorA)
    await cleanupTenantActor(actorB)
  })

  group.each.setup(async () => {
    await cleanupAssistGeo(employeeA!.employee.employeeId, zoneIds.splice(0))
  })

  async function assign(businessUnitId: number | null) {
    const zoneId = await createAssistGeoZone(businessUnitId, ASSIST_GEO_ZONES.Z1_POLYGON)
    zoneIds.push(zoneId)
    await assignAssistGeoZone(
      employeeA!.employee.employeeId,
      actorA!.businessUnit.businessUnitId,
      zoneId
    )
  }

  const load = () => {
    const loader = new AssistZoneContextLoader()
    return loader.load(
      employeeA!.employee.employeeId,
      actorA!.businessUnit.businessUnitId,
      loader.createCache()
    )
  }

  /** Las tres formas de llegar al cargador: sin contexto, sin filtro y con la empresa ajena. */
  const contexts = () => [
    { name: 'sin contexto', run: load },
    {
      name: 'sin filtro',
      run: () => TenantContext.runUnscoped(load, TENANT_UNSCOPED_REASON.TEST_FIXTURE),
    },
    {
      name: 'con contexto de B',
      run: () => TenantContext.run([actorB!.businessUnit.businessUnitId], load),
    },
  ]

  test('la zona propia aporta geometría y el margen es el de la empresa del registro', async ({
    assert,
  }) => {
    await assign(actorA!.businessUnit.businessUnitId)
    for (const { name, run } of contexts()) {
      const context = await run()
      assert.equal(context.assignmentCount, 1, name)
      assert.lengthOf(context.geometries, 1, name)
      assert.equal(context.toleranceMeters, 50, `${name}: margen de A, no el 150 de B`)
      assert.equal(decideZone(ASSIST_GEO_POINTS.CENTER, null, context), 'inside', name)
    }
  })

  test('una zona sin empresa cuenta como asignación pero nunca acepta', async ({ assert }) => {
    await assign(null)
    for (const { name, run } of contexts()) {
      const context = await run()
      assert.equal(context.assignmentCount, 1, name)
      assert.lengthOf(context.geometries, 0, name)
      assert.equal(decideZone(ASSIST_GEO_POINTS.CENTER, null, context), 'not-evaluable', name)
    }
  })

  test('una zona de otra empresa cuenta como asignación pero nunca acepta', async ({ assert }) => {
    await assign(actorB!.businessUnit.businessUnitId)
    for (const { name, run } of contexts()) {
      const context = await run()
      assert.lengthOf(context.geometries, 0, name)
      assert.equal(decideZone(ASSIST_GEO_POINTS.CENTER, null, context), 'not-evaluable', name)
    }
  })
})
