import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import type { ApiClient } from '@japa/api-client'
import Role from '#models/role'
import RoleSystemPermission from '#models/role_system_permission'
import RolePresetService from '#services/role_preset_service'
import {
  businessUnitHeaders,
  cleanupTenantActor,
  createTenantActor,
  grantModulePermissions,
  required,
  uniqueTestName,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * Aislamiento de roles entre empresas.
 *
 * Toda acción sobre un rol resuelve el id DENTRO de la empresa activa: editar,
 * borrar, asignar permisos, asignarlos en lote, ver el detalle y aplicar una
 * plantilla. Un rol de otra empresa responde 404, como si no existiera, que es
 * el contrato del resto del repo. Antes cargaban el rol por id a secas: con un
 * solo id adivinado, un administrador de A reconfiguraba el rol de B.
 *
 * Cubre también la compatibilidad temporal: los roles heredados todavía no
 * tienen `business_unit_id` y se resuelven por el CSV `role_business_access`.
 */

const MODULE = 'roles-and-permissions'

interface RoleCall {
  label: string
  method: 'get' | 'post' | 'put' | 'delete'
  url: string
  body?: Record<string, unknown>
}

const readOnlyPresetVersion = (): string => {
  const preset = new RolePresetService().list().find((item) => item.slug === 'read-only')
  if (!preset) throw new Error('La plantilla read-only debe existir para este spec.')
  return preset.version
}

/** Las seis rutas que resuelven un rol por id y tienen que acotarlo a la empresa. */
function roleCalls(roleId: number): RoleCall[] {
  return [
    { label: 'detalle', method: 'get', url: `/api/roles/${roleId}` },
    {
      label: 'edición',
      method: 'put',
      url: `/api/roles/${roleId}`,
      body: { roleName: uniqueTestName('Robado'), roleDescription: 'Intento', roleActive: true },
    },
    { label: 'baja', method: 'delete', url: `/api/roles/${roleId}` },
    {
      label: 'asignación',
      method: 'post',
      url: `/api/roles/assign/${roleId}`,
      body: { roleManagementDays: 99, permissions: [] },
    },
    {
      label: 'asignación en lote',
      method: 'post',
      url: '/api/roles/assign-batch',
      body: { roles: [{ roleId, permissions: [], roleManagementDays: 99 }] },
    },
    {
      label: 'aplicación de plantilla',
      method: 'post',
      url: `/api/roles/${roleId}/role-presets/apply`,
      body: {
        presetSlug: 'read-only',
        mode: 'merge',
        expectedPresetVersion: readOnlyPresetVersion(),
        baselinePermissionIds: [],
      },
    },
  ]
}

function send(client: ApiClient, actor: TenantActor, call: RoleCall) {
  const request = client[call.method](call.url)
    .loginAs(actor.user)
    .headers(businessUnitHeaders(actor))
  return call.body ? request.json(call.body) : request
}

async function assertNotFoundAll(
  assert: Assert,
  client: ApiClient,
  actor: TenantActor,
  calls: readonly RoleCall[]
): Promise<void> {
  for (const call of calls) {
    const response = await send(client, actor, call)
    assert.equal(response.status(), 404, `${call.label}: ${JSON.stringify(response.body())}`)
  }
}

test.group('Roles — aislamiento entre empresas', (group) => {
  let actorA: TenantActor | null = null
  let actorB: TenantActor | null = null
  let foreignRole: Role | null = null
  let legacyRole: Role | null = null

  group.setup(async () => {
    actorA = await createTenantActor('role-isolation-a')
    actorB = await createTenantActor('role-isolation-b')
    await grantModulePermissions(actorA, MODULE, ['read', 'create', 'update', 'delete'])
    await grantModulePermissions(actorB, MODULE, ['read', 'create', 'update', 'delete'])

    // Rol de la empresa B con la columna dueña puesta: el destino del rediseño.
    foreignRole = await Role.create({
      roleName: uniqueTestName('Rol de la empresa B'),
      roleSlug: `role-isolation-foreign-${Date.now()}`,
      roleDescription: 'Fixture del spec de aislamiento',
      roleActive: 1,
      businessUnitId: required(actorB, 'el actor B').businessUnit.businessUnitId,
      roleBusinessAccess: required(actorB, 'el actor B').businessUnit.businessUnitSlug,
      roleManagementDays: 10,
    })

    // Rol heredado de la empresa A: sin dueño, solo con el CSV.
    legacyRole = await Role.create({
      roleName: uniqueTestName('Rol heredado de A'),
      roleSlug: `role-isolation-legacy-${Date.now()}`,
      roleDescription: 'Fixture heredado: sin business_unit_id, solo CSV',
      roleActive: 1,
      businessUnitId: null,
      roleBusinessAccess: required(actorA, 'el actor A').businessUnit.businessUnitSlug,
      roleManagementDays: 10,
    })
  })

  group.teardown(async () => {
    for (const role of [foreignRole, legacyRole]) {
      if (!role) continue
      await RoleSystemPermission.query().where('role_id', role.roleId).delete()
      await Role.query().where('role_id', role.roleId).delete()
    }
    await cleanupTenantActor(actorA)
    await cleanupTenantActor(actorB)
  })

  test('toda acción sobre un rol de otra empresa responde 404 y no lo toca', async ({
    client,
    assert,
  }) => {
    const tenant = required(actorA, 'el actor A')
    const target = required(foreignRole, 'el rol de la empresa B')

    await assertNotFoundAll(assert, client, tenant, roleCalls(target.roleId))

    const reloaded = await Role.query().where('role_id', target.roleId).firstOrFail()
    assert.equal(reloaded.roleName, target.roleName)
    assert.equal(reloaded.roleManagementDays, 10)
    assert.isNull(reloaded.deletedAt)
    assert.lengthOf(
      await RoleSystemPermission.query()
        .whereNull('role_system_permission_deleted_at')
        .where('role_id', target.roleId),
      0
    )
  })

  test('el listado trae los roles de la empresa activa y no los de la otra', async ({
    client,
    assert,
  }) => {
    const tenant = required(actorA, 'el actor A')
    const target = required(foreignRole, 'el rol de la empresa B')
    const legacy = required(legacyRole, 'el rol heredado de A')

    const response = await client
      .get('/api/roles')
      .qs({ page: 1, limit: 200 })
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))

    response.assertStatus(200)
    const ids: number[] = response
      .body()
      .data.roles.data.map((row: { roleId: number }) => row.roleId)
    assert.include(ids, legacy.roleId, 'el rol heredado de A resuelve por el CSV')
    assert.notInclude(ids, target.roleId, 'el rol de B no aparece en el listado de A')
  })

  test('compatibilidad temporal: el rol heredado solo lo alcanza la empresa de su CSV', async ({
    client,
    assert,
  }) => {
    const tenantA = required(actorA, 'el actor A')
    const tenantB = required(actorB, 'el actor B')
    const legacy = required(legacyRole, 'el rol heredado de A')

    const ownResponse = await client
      .get(`/api/roles/${legacy.roleId}`)
      .loginAs(tenantA.user)
      .headers(businessUnitHeaders(tenantA))
    ownResponse.assertStatus(200)
    assert.equal(ownResponse.body().data.role.roleId, legacy.roleId)

    const foreignResponse = await client
      .get(`/api/roles/${legacy.roleId}`)
      .loginAs(tenantB.user)
      .headers(businessUnitHeaders(tenantB))
    foreignResponse.assertStatus(404)
  })

  test('los roles de sistema globales siguen alcanzables desde cualquier empresa', async ({
    client,
    assert,
  }) => {
    const tenant = required(actorA, 'el actor A')
    const systemRole = await Role.query()
      .whereNull('role_deleted_at')
      .whereNull('business_unit_id')
      .where('role_slug', 'owner')
      .first()
    if (!systemRole) {
      assert.fail('Se requiere el rol de sistema owner: corre "migration:fresh --seed".')
      return
    }

    // 200 en el detalle; la edición la sigue bloqueando el candado de roles de
    // sistema (403), no el aislamiento por empresa.
    const response = await client
      .get(`/api/roles/${systemRole.roleId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
    response.assertStatus(200)
  })
})
