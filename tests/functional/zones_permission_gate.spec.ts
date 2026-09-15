import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Zone from '#models/zone'
import {
  assertModuleEnforced,
  assertPassesGate,
  assertPermissionDenied,
  businessUnitHeaders,
  cleanupTenantActor,
  createBypassActor,
  createTenantActor,
  grantModulePermissions,
  required,
  uniqueTestName,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * Zonas de asistencia remota con la exigencia encendida: alta, detalle,
 * edición, baja y miniatura piden su permiso de `zones`; el listado queda
 * abierto porque lo consume el select de zonas de Empleados.
 */

const MODULE = 'zones'

/** El controller solo acepta un FeatureCollection con geometría. */
const VALID_POLYGON = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-99.13, 19.43],
            [-99.12, 19.43],
            [-99.12, 19.44],
            [-99.13, 19.43],
          ],
        ],
      },
    },
  ],
})

const zonePayload = (name: string) => ({
  zoneName: name,
  zoneAddress: 'Calle de prueba 1',
  zonePolygon: VALID_POLYGON,
})

const findAliveZone = (zoneId: number) => Zone.query().where('zoneId', zoneId).first()

test.group('Zonas — permissionGate con exigencia encendida', (group) => {
  let actor: TenantActor | null = null
  let owner: TenantActor | null = null
  const zoneNames: string[] = []

  /** Nombre registrado para limpiar también las zonas que crea el API. */
  const trackedName = (prefix: string) => {
    const name = uniqueTestName(prefix)
    zoneNames.push(name)
    return name
  }

  const createZoneFixture = (prefix: string) =>
    Zone.create({ ...zonePayload(trackedName(prefix)), zoneThumbnail: null })

  group.setup(async () => {
    await assertModuleEnforced(MODULE)
    actor = await createTenantActor('zonas-gate')
    owner = await createBypassActor('owner', 'zonas-owner')
  })

  group.teardown(async () => {
    if (zoneNames.length > 0) {
      await db.from('zones').whereIn('zone_name', zoneNames).delete()
    }
    await cleanupTenantActor(actor)
    await cleanupTenantActor(owner)
  })

  test('sin concesiones: alta, detalle, edición, baja y miniatura responden PERM.DENIED y no tocan la zona', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, [])
    const zone = await createZoneFixture('Zona sin permiso')
    const deniedName = trackedName('Alta negada')

    const store = await client
      .post('/api/zones')
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
      .json(zonePayload(deniedName))
    assertPermissionDenied(assert, store)
    assert.isNull(await Zone.query().where('zoneName', deniedName).first())

    const show = await client.get(`/api/zones/${zone.zoneId}`).loginAs(tenant.user)
    assertPermissionDenied(assert, show)

    const update = await client
      .put(`/api/zones/${zone.zoneId}`)
      .loginAs(tenant.user)
      .json(zonePayload(uniqueTestName('Edición negada')))
    assertPermissionDenied(assert, update)

    const thumbnail = await client.put(`/api/zones/${zone.zoneId}/thumbnail`).loginAs(tenant.user)
    assertPermissionDenied(assert, thumbnail)

    const destroy = await client.delete(`/api/zones/${zone.zoneId}`).loginAs(tenant.user)
    assertPermissionDenied(assert, destroy)

    const after = await findAliveZone(zone.zoneId)
    assert.equal(after?.zoneName, zone.zoneName)
  })

  test('sin concesiones: el listado sigue abierto porque lo consume Empleados', async ({
    client,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, [])

    const response = await client.get('/api/zones').loginAs(tenant.user)

    response.assertStatus(200)
  })

  test('cada permiso abre solo su operación: create, read, update y delete', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const name = trackedName('Alta con permiso')

    await grantModulePermissions(tenant, MODULE, ['create'])
    const store = await client.post('/api/zones').loginAs(tenant.user).json(zonePayload(name))
    store.assertStatus(201)
    const created = required(await Zone.query().where('zoneName', name).first(), 'la zona creada')
    const showWithCreateOnly = await client.get(`/api/zones/${created.zoneId}`).loginAs(tenant.user)
    assertPermissionDenied(assert, showWithCreateOnly)

    await grantModulePermissions(tenant, MODULE, ['read'])
    const show = await client.get(`/api/zones/${created.zoneId}`).loginAs(tenant.user)
    show.assertStatus(200)
    const updateWithReadOnly = await client
      .put(`/api/zones/${created.zoneId}`)
      .loginAs(tenant.user)
      .json(zonePayload(name))
    assertPermissionDenied(assert, updateWithReadOnly)

    await grantModulePermissions(tenant, MODULE, ['update'])
    const renamed = trackedName('Edición con permiso')
    const update = await client
      .put(`/api/zones/${created.zoneId}`)
      .loginAs(tenant.user)
      .json(zonePayload(renamed))
    // El controller de zonas responde 201 también al editar y al borrar.
    update.assertStatus(201)
    const updated = await findAliveZone(created.zoneId)
    assert.equal(updated?.zoneName, renamed)
    const destroyWithUpdateOnly = await client.delete(`/api/zones/${created.zoneId}`).loginAs(tenant.user)
    assertPermissionDenied(assert, destroyWithUpdateOnly)

    await grantModulePermissions(tenant, MODULE, ['delete'])
    const destroy = await client.delete(`/api/zones/${created.zoneId}`).loginAs(tenant.user)
    destroy.assertStatus(201)
    assert.isNull(await findAliveZone(created.zoneId))
  })

  test('la miniatura cruza el gate con create o con update, no con read', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const zone = await createZoneFixture('Zona miniatura')

    for (const permissionSlug of ['create', 'update']) {
      await grantModulePermissions(tenant, MODULE, [permissionSlug])
      const response = await client.put(`/api/zones/${zone.zoneId}/thumbnail`).loginAs(tenant.user)
      // Sin archivo el controller responde 400: basta con que el gate lo haya dejado pasar.
      assertPassesGate(assert, response)
      response.assertStatus(400)
    }

    await grantModulePermissions(tenant, MODULE, ['read'])
    const readOnly = await client.put(`/api/zones/${zone.zoneId}/thumbnail`).loginAs(tenant.user)
    assertPermissionDenied(assert, readOnly)
  })

  test('owner cruza el gate por el bypass standard sin concesiones', async ({ client }) => {
    const account = required(owner, 'el owner')

    const response = await client
      .post('/api/zones')
      .loginAs(account.user)
      .json(zonePayload(trackedName('Alta owner')))

    response.assertStatus(201)
  })
})
