import { test } from '@japa/runner'
import Role from '#models/role'
import RoleSystemPermission from '#models/role_system_permission'
import SystemPermission from '#models/system_permission'
import RolePresetService from '#services/role_preset_service'
import {
  addRoleModulePermissions,
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
 * Techo de concesión: nadie reparte permisos que él mismo no tiene.
 *
 * Antes, cualquiera con `roles-and-permissions:update` podía asignar CUALQUIER
 * id del catálogo a un rol y entrar con ese rol. `root` y el dueño de la cuenta
 * quedan fuera de la regla por salvoconducto, igual que en el gate.
 *
 * Revocar no pasa por el techo: quitar un permiso no escala a nadie.
 */

const MODULE = 'roles-and-permissions'
const CEILING_KEY = 'permiso-fuera-de-alcance'
/** Permiso del catálogo que el actor NO tiene salvo que el caso se lo siembre. */
const GRANTED_MODULE = 'employees'
const GRANTED_ACTION = 'read'
const OTHER_ACTION = 'create'

async function permissionId(moduleSlug: string, permissionSlug: string): Promise<number> {
  const permission = await SystemPermission.query()
    .whereNull('system_permission_deleted_at')
    .where('system_permission_slug', permissionSlug)
    .whereHas('systemModule', (query) =>
      query.whereNull('system_module_deleted_at').where('system_module_slug', moduleSlug)
    )
    .first()
  if (!permission) {
    throw new Error(
      `Se requiere el permiso "${moduleSlug}:${permissionSlug}" en BD: corre "migration:fresh --seed".`
    )
  }
  return permission.systemPermissionId
}

const liveGrants = (roleId: number) =>
  RoleSystemPermission.query()
    .whereNull('role_system_permission_deleted_at')
    .where('role_id', roleId)

async function createRoleFor(actor: TenantActor, prefix: string): Promise<Role> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  return Role.create({
    roleName: uniqueTestName(`Rol ${prefix}`),
    roleSlug: `role-ceiling-${prefix}-${stamp}`,
    roleDescription: 'Fixture del spec de techo de concesión',
    roleActive: 1,
    businessUnitId: actor.businessUnit.businessUnitId,
    roleBusinessAccess: actor.businessUnit.businessUnitSlug,
    roleManagementDays: 10,
  })
}

test.group('Roles — techo de concesión', (group) => {
  let actor: TenantActor | null = null
  let owner: TenantActor | null = null
  let target: Role | null = null
  let ownerTarget: Role | null = null
  let grantedPermissionId = 0
  let otherPermissionId = 0

  group.setup(async () => {
    actor = await createTenantActor('role-ceiling-admin')
    owner = await createBypassActor('owner', 'role-ceiling-owner')
    target = await createRoleFor(actor, 'objetivo')
    ownerTarget = await createRoleFor(owner, 'owner-objetivo')
    grantedPermissionId = await permissionId(GRANTED_MODULE, GRANTED_ACTION)
    otherPermissionId = await permissionId(GRANTED_MODULE, OTHER_ACTION)
  })

  group.each.setup(async () => {
    // Estado conocido por caso: el actor solo administra roles —los permisos de
    // Empleados se los siembra el caso que los necesita— y el rol objetivo
    // vuelve a quedar sin concesiones y con sus días de gestión originales.
    await grantModulePermissions(required(actor, 'el actor'), MODULE, ['update'])
    const role = required(target, 'el rol objetivo')
    await liveGrants(role.roleId).delete()
    await Role.query().where('role_id', role.roleId).update({ role_management_days: 10 })
  })

  group.teardown(async () => {
    for (const role of [target, ownerTarget]) {
      if (!role) continue
      await RoleSystemPermission.query().where('role_id', role.roleId).delete()
      await Role.query().where('role_id', role.roleId).delete()
    }
    await cleanupTenantActor(actor)
    await cleanupTenantActor(owner)
  })

  test('asignar un permiso que el actor no tiene responde 403 y no escribe', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const role = required(target, 'el rol objetivo')

    const response = await client
      .post(`/api/roles/assign/${role.roleId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
      .json({ roleManagementDays: 15, permissions: [grantedPermissionId] })

    assert.equal(response.status(), 403, JSON.stringify(response.body()))
    assert.equal(response.body().key, CEILING_KEY)
    assert.isString(response.body().title)
    assert.isString(response.body().detail)
    assert.deepEqual(
      response.body().data.permissions.map((item: { systemPermissionId: number }) => item.systemPermissionId),
      [grantedPermissionId]
    )
    assert.lengthOf(await liveGrants(role.roleId), 0)

    const reloaded = await Role.query().where('role_id', role.roleId).firstOrFail()
    assert.equal(reloaded.roleManagementDays, 10, 'ni los días de gestión se guardan')
  })

  test('con el permiso en su propio rol, el actor sí puede concederlo', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const role = required(target, 'el rol objetivo')
    await addRoleModulePermissions(tenant.role, GRANTED_MODULE, [GRANTED_ACTION])

    const response = await client
      .post(`/api/roles/assign/${role.roleId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
      .json({ roleManagementDays: 15, permissions: [grantedPermissionId] })

    assert.equal(response.status(), 201, JSON.stringify(response.body()))
    const grants = await liveGrants(role.roleId)
    assert.deepEqual(
      grants.map((grant) => grant.systemPermissionId),
      [grantedPermissionId]
    )
  })

  test('revocar un permiso que el actor no tiene sigue permitido', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')
    const role = required(target, 'el rol objetivo')
    await RoleSystemPermission.create({
      roleId: role.roleId,
      systemPermissionId: otherPermissionId,
    })

    const response = await client
      .post(`/api/roles/assign/${role.roleId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
      .json({ roleManagementDays: 15, permissions: [] })

    assert.equal(response.status(), 201, JSON.stringify(response.body()))
    assert.lengthOf(await liveGrants(role.roleId), 0)
  })

  test('conservar un permiso que el rol ya tenía no cuenta como concederlo', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const role = required(target, 'el rol objetivo')
    await RoleSystemPermission.create({
      roleId: role.roleId,
      systemPermissionId: otherPermissionId,
    })

    const response = await client
      .post(`/api/roles/assign/${role.roleId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
      .json({ roleManagementDays: 15, permissions: [otherPermissionId] })

    assert.equal(response.status(), 201, JSON.stringify(response.body()))
    assert.lengthOf(await liveGrants(role.roleId), 1)
  })

  test('el lote se detiene completo si un rol trae permisos fuera de alcance', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const role = required(target, 'el rol objetivo')

    const response = await client
      .post('/api/roles/assign-batch')
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
      .json({
        roles: [{ roleId: role.roleId, permissions: [grantedPermissionId], roleManagementDays: 33 }],
      })

    assert.equal(response.status(), 403, JSON.stringify(response.body()))
    assert.equal(response.body().key, CEILING_KEY)
    assert.equal(response.body().data.roleId, role.roleId)
    assert.lengthOf(await liveGrants(role.roleId), 0)

    const reloaded = await Role.query().where('role_id', role.roleId).firstOrFail()
    assert.equal(reloaded.roleManagementDays, 10)
  })

  test('una plantilla tampoco reparte lo que el actor no tiene', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')
    const role = required(target, 'el rol objetivo')
    const preset = new RolePresetService().list().find((item) => item.slug === 'read-only')
    if (!preset) {
      assert.fail('La plantilla read-only debe existir para este spec.')
      return
    }

    const response = await client
      .post(`/api/roles/${role.roleId}/role-presets/apply`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
      .json({
        presetSlug: preset.slug,
        mode: 'merge',
        expectedPresetVersion: preset.version,
        baselinePermissionIds: [],
      })

    assert.equal(response.status(), 403, JSON.stringify(response.body()))
    assert.equal(response.body().key, CEILING_KEY)
    assert.lengthOf(await liveGrants(role.roleId), 0)
  })

  test('el dueño de la cuenta concede por salvoconducto, sin tener el permiso', async ({
    client,
    assert,
  }) => {
    const account = required(owner, 'el owner')
    const role = required(ownerTarget, 'el rol objetivo del owner')
    await liveGrants(role.roleId).delete()

    const response = await client
      .post(`/api/roles/assign/${role.roleId}`)
      .loginAs(account.user)
      .headers(businessUnitHeaders(account))
      .json({ roleManagementDays: 15, permissions: [grantedPermissionId] })

    assert.equal(response.status(), 201, JSON.stringify(response.body()))
    assert.lengthOf(await liveGrants(role.roleId), 1)
  })
})
