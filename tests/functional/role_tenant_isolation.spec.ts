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
 * Cubre también los dos bordes del modelo: un rol SIN empresa dueña no lo
 * alcanza nadie (fail-closed), y el rol global de la plataforma tampoco es
 * alcanzable desde un tenant.
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
      roleManagementDays: 10,
    })

    // Rol sin empresa dueña: el estado que ya no alcanza ningún tenant.
    legacyRole = await Role.create({
      roleName: uniqueTestName('Rol sin dueño'),
      roleSlug: `role-isolation-orphan-${Date.now()}`,
      roleDescription: 'Fixture sin business_unit_id: no es de nadie',
      roleActive: 1,
      businessUnitId: null,
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
    const orphan = required(legacyRole, 'el rol sin dueño')

    const response = await client
      .get('/api/roles')
      .qs({ page: 1, limit: 200 })
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))

    response.assertStatus(200)
    const ids: number[] = response
      .body()
      .data.roles.data.map((row: { roleId: number }) => row.roleId)
    assert.include(ids, tenant.role.roleId, 'el rol propio de A sí aparece')
    assert.notInclude(ids, target.roleId, 'el rol de B no aparece en el listado de A')
    assert.notInclude(ids, orphan.roleId, 'un rol sin dueño no aparece en el listado de nadie')
  })

  test('un rol sin empresa dueña no lo alcanza ninguna empresa', async ({ client }) => {
    // Antes este caso afirmaba lo contrario: un rol sin dueño se resolvía por el
    // CSV `role_business_access` y la empresa nombrada ahí sí lo veía. Retirado
    // el CSV, un rol sin dueño no es de nadie, y eso vale para las dos empresas.
    const tenantA = required(actorA, 'el actor A')
    const tenantB = required(actorB, 'el actor B')
    const orphan = required(legacyRole, 'el rol sin dueño')

    for (const tenant of [tenantA, tenantB]) {
      const response = await client
        .get(`/api/roles/${orphan.roleId}`)
        .loginAs(tenant.user)
        .headers(businessUnitHeaders(tenant))
      response.assertStatus(404)
    }
  })

  test('el rol global de la plataforma no es alcanzable desde un tenant', async ({
    client,
    assert,
  }) => {
    // Antes `owner` y `empleado` eran filas globales que toda empresa veía y
    // podía asignar. Ya no existen así: cada empresa estrena las suyas, y lo
    // único global es `root`, que es de la plataforma y ningún tenant alcanza.
    const tenant = required(actorA, 'el actor A')
    const platformRole = await Role.query()
      .whereNull('role_deleted_at')
      .whereNull('business_unit_id')
      .where('role_slug', 'root')
      .first()
    if (!platformRole) {
      assert.fail('Se requiere el rol root: corre "migration:fresh --seed".')
      return
    }

    const response = await client
      .get(`/api/roles/${platformRole.roleId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
    response.assertStatus(404)
  })
})
