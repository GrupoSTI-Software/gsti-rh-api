import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import type { ApiClient, ApiResponse } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import Supplie from '#models/supplie'
import SupplyType from '#models/supply_type'
import { PERMISSION_GATE_ERROR_CODES } from '#constants/permission_gate_error_codes'
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
 * Activos e insumos con la exigencia encendida: tipos, activos,
 * características, valores e historial de valor piden su permiso de
 * `supplies`. El detalle del activo queda abierto porque lo consume la Matriz
 * de vencimientos.
 *
 * El catálogo ya está acotado por empresa (`business_unit_id` + businessScope),
 * así que toda petición viaja con el encabezado de la empresa del actor y los
 * fixtures nacen con la suya. Se identifican además por un prefijo de slug
 * propio de la corrida, para limpiarlos sin tocar datos de otros specs.
 */

const MODULE = 'supplies'
const RUN_SLUG = `gate-activos-${Date.now()}-${Math.floor(Math.random() * 100_000)}`

type HttpMethod = 'get' | 'post' | 'put' | 'delete'

interface GateRequest {
  method: HttpMethod
  url: string
  body?: Record<string, unknown>
}

let slugCounter = 0
const nextSlug = (label: string) => `${RUN_SLUG}-${label}-${++slugCounter}`

/**
 * Los fixtures corren fuera de una request, donde no hay TenantContext: la
 * empresa va explícita porque el hook del modelo no tendría de dónde
 * resolverla y el alta fallaría.
 */
async function createSupplyTypeFixture(label: string, tenant: TenantActor): Promise<SupplyType> {
  return SupplyType.create({
    businessUnitId: tenant.businessUnit.businessUnitId,
    supplyTypeName: uniqueTestName(`Tipo ${label}`),
    supplyTypeSlug: nextSlug(label),
  })
}

/** El activo hereda la empresa de su tipo, igual que lo hace el hook del modelo. */
async function createSupplyFixture(supplyType: SupplyType, label: string): Promise<Supplie> {
  return Supplie.create({
    businessUnitId: supplyType.businessUnitId,
    supplyFileNumber: Number(`${Date.now()}${Math.floor(Math.random() * 100)}`.slice(-9)),
    supplyName: uniqueTestName(`Activo ${label}`),
    supplyTypeId: supplyType.supplyTypeId,
    supplyStatus: 'active',
  })
}

/** Borrado físico de todo lo que la corrida creó, por el prefijo de slug. */
async function cleanupRunSupplies(): Promise<void> {
  const types: { supply_type_id: number }[] = await db
    .from('supply_types')
    .where('supply_type_slug', 'like', `${RUN_SLUG}%`)
    .select('supply_type_id')
  const typeIds = types.map((row) => row.supply_type_id)
  if (typeIds.length === 0) return

  await db.from('supplies').whereIn('supply_type_id', typeIds).delete()
  await db.from('supply_types').whereIn('supply_type_id', typeIds).delete()
}

function send(client: ApiClient, actor: TenantActor, request: GateRequest) {
  const pending = client[request.method](request.url)
    .loginAs(actor.user)
    .headers(businessUnitHeaders(actor))
  return request.body ? pending.json(request.body) : pending
}

/** Negativa del gate con el método y la URL en el mensaje, para ubicar la ruta que falló. */
function assertDeniedFor(assert: Assert, response: ApiResponse, request: GateRequest): void {
  const label = `${request.method.toUpperCase()} ${request.url}`
  assert.equal(response.status(), 403, label)
  assert.equal(response.body()?.key, PERMISSION_GATE_ERROR_CODES.DENIED, label)
}

test.group('Activos e insumos — permissionGate con exigencia encendida', (group) => {
  let actor: TenantActor | null = null
  let owner: TenantActor | null = null
  let superAdmin: TenantActor | null = null

  group.setup(async () => {
    await assertModuleEnforced(MODULE)
    actor = await createTenantActor('activos-gate')
    owner = await createBypassActor('owner', 'activos-owner')
    superAdmin = await createBypassActor('super-administrador', 'activos-superadmin')
  })

  group.teardown(async () => {
    await cleanupRunSupplies()
    for (const current of [actor, owner, superAdmin]) {
      await cleanupTenantActor(current)
    }
  })

  test('sin concesiones: tipos, activos, características, valores e historial responden PERM.DENIED y no escriben', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, [])
    const supplyType = await createSupplyTypeFixture('sin-permiso', tenant)
    const supply = await createSupplyFixture(supplyType, 'sin-permiso')
    const deniedSlug = nextSlug('alta-negada')

    const requests: GateRequest[] = [
      {
        method: 'post',
        url: '/api/supply-types',
        body: { supplyTypeName: 'Alta negada', supplyTypeSlug: deniedSlug },
      },
      { method: 'get', url: '/api/supply-types' },
      { method: 'get', url: `/api/supply-types/${supplyType.supplyTypeId}` },
      {
        method: 'put',
        url: `/api/supply-types/${supplyType.supplyTypeId}`,
        body: { supplyTypeName: 'Edición negada' },
      },
      { method: 'delete', url: `/api/supply-types/${supplyType.supplyTypeId}` },
      { method: 'get', url: `/api/supply-types/${supplyType.supplyTypeId}/characteristics` },
      { method: 'post', url: '/api/supplies', body: {} },
      { method: 'get', url: '/api/supplies' },
      {
        method: 'put',
        url: `/api/supplies/${supply.supplyId}`,
        body: { supplyName: 'Edición negada' },
      },
      { method: 'delete', url: `/api/supplies/${supply.supplyId}` },
      { method: 'post', url: `/api/supplies/${supply.supplyId}/deactivate`, body: {} },
      { method: 'get', url: `/api/supplies/${supply.supplyId}/with-type` },
      { method: 'get', url: `/api/supplies/by-type/${supplyType.supplyTypeId}` },
      { method: 'post', url: '/api/supplie-characteristics', body: {} },
      { method: 'get', url: '/api/supplie-characteristics' },
      { method: 'post', url: '/api/supplie-characteristic-values', body: {} },
      { method: 'get', url: `/api/supplie-characteristic-values/by-supply/${supply.supplyId}` },
      { method: 'get', url: '/api/supply-value-histories' },
      { method: 'post', url: '/api/supply-value-histories', body: {} },
      { method: 'get', url: `/api/supplies/${supply.supplyId}/value-histories` },
      { method: 'get', url: `/api/supplies/${supply.supplyId}/value-histories/latest` },
    ]

    for (const request of requests) {
      assertDeniedFor(assert, await send(client, tenant, request), request)
    }

    assert.isNull(await SupplyType.query().where('supplyTypeSlug', deniedSlug).first())
    const typeAfter = await SupplyType.query()
      .where('supplyTypeId', supplyType.supplyTypeId)
      .first()
    assert.equal(typeAfter?.supplyTypeName, supplyType.supplyTypeName)
    const supplyAfter = await Supplie.query().where('supplyId', supply.supplyId).first()
    assert.equal(supplyAfter?.supplyName, supply.supplyName)
    assert.equal(supplyAfter?.supplyStatus, 'active')
  })

  test('sin concesiones: el detalle del activo sigue abierto porque lo consume la Matriz de vencimientos', async ({
    client,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, [])
    const supply = await createSupplyFixture(
      await createSupplyTypeFixture('detalle', tenant),
      'detalle'
    )

    const response = await client
      .get(`/api/supplies/${supply.supplyId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))

    response.assertStatus(200)
  })

  test('cada permiso abre solo su operación en tipos de activo: create 201, read 200, update 200, delete 200', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const slug = nextSlug('crud')

    await grantModulePermissions(tenant, MODULE, ['create'])
    const store = await client
      .post('/api/supply-types')
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
      .json({ supplyTypeName: uniqueTestName('Tipo con permiso'), supplyTypeSlug: slug })
    store.assertStatus(201)
    const created = required(
      await SupplyType.query().where('supplyTypeSlug', slug).first(),
      'el tipo creado'
    )
    const listWithCreateOnly = await client
      .get('/api/supply-types')
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
    assertPermissionDenied(assert, listWithCreateOnly)

    await grantModulePermissions(tenant, MODULE, ['read'])
    const show = await client
      .get(`/api/supply-types/${created.supplyTypeId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
    show.assertStatus(200)
    const updateWithReadOnly = await client
      .put(`/api/supply-types/${created.supplyTypeId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
      .json({ supplyTypeName: uniqueTestName('Edición solo lectura') })
    assertPermissionDenied(assert, updateWithReadOnly)

    await grantModulePermissions(tenant, MODULE, ['update'])
    const renamed = uniqueTestName('Tipo editado')
    const update = await client
      .put(`/api/supply-types/${created.supplyTypeId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
      .json({ supplyTypeName: renamed })
    update.assertStatus(200)
    const updated = await SupplyType.query().where('supplyTypeId', created.supplyTypeId).first()
    assert.equal(updated?.supplyTypeName, renamed)
    const destroyWithUpdateOnly = await client
      .delete(`/api/supply-types/${created.supplyTypeId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
    assertPermissionDenied(assert, destroyWithUpdateOnly)

    await grantModulePermissions(tenant, MODULE, ['delete'])
    const destroy = await client
      .delete(`/api/supply-types/${created.supplyTypeId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
    destroy.assertStatus(200)
    assert.isNull(await SupplyType.query().where('supplyTypeId', created.supplyTypeId).first())
  })

  test('valores de característica e historial aceptan create o update; la baja lógica del activo pide update', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const supply = await createSupplyFixture(
      await createSupplyTypeFixture('guardado', tenant),
      'guardado'
    )
    const savedWithSupply: GateRequest[] = [
      { method: 'post', url: '/api/supplie-characteristic-values', body: {} },
      { method: 'post', url: '/api/supply-value-histories', body: {} },
    ]

    // Cuerpo vacío a propósito: basta con ver que la petición cruza el gate
    // (el validador responde 400) sin escribir nada que haya que limpiar.
    await grantModulePermissions(tenant, MODULE, ['read'])
    for (const request of savedWithSupply) {
      assertDeniedFor(assert, await send(client, tenant, request), request)
    }
    for (const action of ['create', 'update']) {
      await grantModulePermissions(tenant, MODULE, [action])
      for (const request of savedWithSupply) {
        assertPassesGate(assert, await send(client, tenant, request))
      }
    }

    const deactivate: GateRequest = {
      method: 'post',
      url: `/api/supplies/${supply.supplyId}/deactivate`,
      body: {},
    }
    await grantModulePermissions(tenant, MODULE, ['delete'])
    assertDeniedFor(assert, await send(client, tenant, deactivate), deactivate)
    await grantModulePermissions(tenant, MODULE, ['update'])
    assertPassesGate(assert, await send(client, tenant, deactivate))
  })

  test('owner cruza el gate por el bypass standard; super-administrador no', async ({
    client,
    assert,
  }) => {
    const ownerAccount = required(owner, 'el owner')
    const superAdminAccount = required(superAdmin, 'el super-administrador')

    const ownerStore = await client
      .post('/api/supply-types')
      .loginAs(ownerAccount.user)
      .headers(businessUnitHeaders(ownerAccount))
      .json({ supplyTypeName: uniqueTestName('Tipo owner'), supplyTypeSlug: nextSlug('owner') })
    ownerStore.assertStatus(201)

    const superAdminList = await client
      .get('/api/supply-types')
      .loginAs(superAdminAccount.user)
      .headers(businessUnitHeaders(superAdminAccount))
    assertPermissionDenied(assert, superAdminList)
  })
})
