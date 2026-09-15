import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import type { ApiClient } from '@japa/api-client'
import Role from '#models/role'
import RoleSystemPermission from '#models/role_system_permission'
import RolePresetService from '#services/role_preset_service'
import { PERMISSION_GATE_ERROR_CODES } from '#constants/permission_gate_error_codes'
import {
  assertModuleEnforced,
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
 * Roles y permisos con la exigencia encendida. Cubre:
 *  - cada operación declarada con su permiso (y el `update` extra del alta con
 *    plantilla);
 *  - la plomería de sesión abierta (listado, has-access, get-access y
 *    get-access-by-module) acotada al rol de la sesión;
 *  - el bloqueo del rol propio: con permiso de edición nadie modifica, borra ni
 *    se concede permisos sobre el rol con el que inició sesión;
 *  - los nombres de rol que derivan un slug de identidad reservado.
 */

const MODULE = 'roles-and-permissions'
const OWN_ROLE_LOCKED_KEY = 'rol-propio-bloqueado'
const RESERVED_NAME_KEY = 'rol-nombre-reservado'

interface ApiCall {
  label: string
  method: 'get' | 'post' | 'put' | 'delete'
  url: string
  body?: Record<string, unknown>
}

type OperationName =
  | 'show'
  | 'store'
  | 'update'
  | 'destroy'
  | 'assign'
  | 'assignBatch'
  | 'hasAccessDepartment'
  | 'indexPresets'
  | 'preview'
  | 'apply'

/** Id que no existe: has-access-department responde `false` sin tocar datos. */
const MISSING_ID = 2_147_483_647

const readOnlyPresetVersion = () => {
  const preset = new RolePresetService().list().find((item) => item.slug === 'read-only')
  if (!preset) throw new Error('La plantilla read-only debe existir para este spec.')
  return preset.version
}

/** Rol que pertenece a la empresa del actor, igual que uno creado desde su pantalla. */
async function createTenantRole(actor: TenantActor, prefix: string): Promise<Role> {
  const name = uniqueTestName(`Rol ${prefix}`)
  return Role.create({
    roleName: name,
    roleSlug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    roleDescription: 'Rol de spec del gate de roles',
    roleActive: 1,
    roleBusinessAccess: actor.businessUnit.businessUnitSlug,
    roleManagementDays: 10,
  })
}

/** Borra los roles de la empresa del actor (fixtures y altas del caso), menos el suyo. */
async function cleanupTenantRoles(actor: TenantActor | null): Promise<void> {
  if (!actor) return
  const roles = await Role.query()
    .where('role_business_access', actor.businessUnit.businessUnitSlug)
    .whereNot('role_id', actor.role.roleId)
  const roleIds = roles.map((role) => role.roleId)
  if (roleIds.length === 0) return
  await RoleSystemPermission.query().whereIn('role_id', roleIds).delete()
  await Role.query().whereIn('role_id', roleIds).delete()
}

const findAliveRole = (roleId: number) =>
  Role.query().where('role_id', roleId).whereNull('role_deleted_at').first()

const grantsOf = (roleId: number) =>
  RoleSystemPermission.query()
    .whereNull('role_system_permission_deleted_at')
    .where('role_id', roleId)

function operationCalls(roleId: number): Record<OperationName, ApiCall> {
  return {
    show: { label: 'detalle de rol', method: 'get', url: `/api/roles/${roleId}` },
    store: {
      label: 'alta de rol',
      method: 'post',
      url: '/api/roles',
      body: { roleName: uniqueTestName('Alta'), roleDescription: 'Alta de spec', roleActive: true },
    },
    update: {
      label: 'edición de rol',
      method: 'put',
      url: `/api/roles/${roleId}`,
      body: { roleName: uniqueTestName('Edición'), roleDescription: 'Edición de spec', roleActive: true },
    },
    destroy: { label: 'baja de rol', method: 'delete', url: `/api/roles/${roleId}` },
    assign: {
      label: 'asignación de permisos',
      method: 'post',
      url: `/api/roles/assign/${roleId}`,
      body: { roleManagementDays: 10, permissions: [] },
    },
    assignBatch: {
      label: 'asignación en lote',
      method: 'post',
      url: '/api/roles/assign-batch',
      body: { roles: [{ roleId, permissions: [], roleManagementDays: 10 }] },
    },
    hasAccessDepartment: {
      label: 'has-access-department',
      method: 'get',
      url: `/api/roles/has-access-department/${roleId}/${MISSING_ID}`,
    },
    indexPresets: { label: 'catálogo de plantillas', method: 'get', url: '/api/role-presets' },
    preview: {
      label: 'vista previa de plantilla',
      method: 'post',
      url: `/api/roles/${roleId}/role-presets/preview`,
      body: { presetSlug: 'read-only', mode: 'merge' },
    },
    apply: {
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
  }
}

/** Lecturas de la matriz de permisos de un rol: plomería de sesión sin gate. */
function accessCalls(roleId: number): ApiCall[] {
  return [
    { label: 'has-access', method: 'get', url: `/api/roles/has-access/${roleId}/employees/read` },
    { label: 'get-access', method: 'get', url: `/api/roles/get-access/${roleId}` },
    { label: 'get-access-by-module', method: 'get', url: `/api/roles/get-access-by-module/${roleId}/employees` },
  ]
}

function send(client: ApiClient, actor: TenantActor, call: ApiCall) {
  const request = client[call.method](call.url)
    .loginAs(actor.user)
    .headers(businessUnitHeaders(actor))
  return call.body ? request.json(call.body) : request
}

async function assertRejectedAll(
  assert: Assert,
  client: ApiClient,
  actor: TenantActor,
  calls: readonly ApiCall[],
  key: string
): Promise<void> {
  for (const call of calls) {
    const response = await send(client, actor, call)
    assert.equal(response.status(), 403, `${call.label}: debe responder 403`)
    assert.equal(response.body()?.key, key, `${call.label}: clave de la negativa`)
  }
}

const assertDeniedAll = (
  assert: Assert,
  client: ApiClient,
  actor: TenantActor,
  calls: readonly ApiCall[]
) => assertRejectedAll(assert, client, actor, calls, PERMISSION_GATE_ERROR_CODES.DENIED)

async function assertStatus(
  assert: Assert,
  client: ApiClient,
  actor: TenantActor,
  call: ApiCall,
  status: number
) {
  const response = await send(client, actor, call)
  assert.equal(response.status(), status, `${call.label}: ${JSON.stringify(response.body())}`)
  return response
}

test.group('Roles y permisos — permissionGate con exigencia encendida', (group) => {
  let actor: TenantActor | null = null
  let target: Role | null = null
  let owner: TenantActor | null = null

  group.setup(async () => {
    await assertModuleEnforced(MODULE)
    owner = await createBypassActor('owner', 'roles-owner')
  })

  group.teardown(async () => {
    await cleanupTenantRoles(owner)
    await cleanupTenantActor(owner)
  })

  group.each.setup(async () => {
    actor = await createTenantActor('roles-gate')
    target = await createTenantRole(actor, 'objetivo')
  })

  group.each.teardown(async () => {
    await cleanupTenantRoles(actor)
    await cleanupTenantActor(actor)
    actor = null
    target = null
  })

  test('sin concesiones: toda operación declarada responde PERM.DENIED y no escribe', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const role = required(target, 'el rol objetivo')
    await grantModulePermissions(tenant, MODULE, [])
    const calls = operationCalls(role.roleId)

    await assertDeniedAll(assert, client, tenant, Object.values(calls))

    const reloaded = await findAliveRole(role.roleId)
    assert.equal(reloaded?.roleName, role.roleName)
    assert.lengthOf(await grantsOf(role.roleId), 0)
    assert.isNull(await Role.query().where('role_name', String(calls.store.body?.roleName)).first())
  })

  test('sin concesiones: el listado y la matriz del rol propio siguen abiertos', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, [])

    await assertStatus(assert, client, tenant, { label: 'listado de roles', method: 'get', url: '/api/roles' }, 200)
    for (const call of accessCalls(tenant.role.roleId)) {
      await assertStatus(assert, client, tenant, call, 200)
    }
  })

  test('la matriz de otro rol pide read: sin concesión PERM.DENIED, con read 200', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const role = required(target, 'el rol objetivo')

    await grantModulePermissions(tenant, MODULE, [])
    await assertDeniedAll(assert, client, tenant, accessCalls(role.roleId))

    await grantModulePermissions(tenant, MODULE, ['read'])
    for (const call of accessCalls(role.roleId)) {
      await assertStatus(assert, client, tenant, call, 200)
    }
  })

  test('read abre detalle, catálogo de plantillas y has-access-department, nada más', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const role = required(target, 'el rol objetivo')
    await grantModulePermissions(tenant, MODULE, ['read'])
    const calls = operationCalls(role.roleId)

    const show = await assertStatus(assert, client, tenant, calls.show, 200)
    assert.equal(show.body().data.role.roleId, role.roleId)
    await assertStatus(assert, client, tenant, calls.indexPresets, 200)
    await assertStatus(assert, client, tenant, calls.hasAccessDepartment, 200)

    await assertDeniedAll(assert, client, tenant, [
      calls.store,
      calls.update,
      calls.destroy,
      calls.assign,
      calls.assignBatch,
      calls.preview,
      calls.apply,
    ])
  })

  test('create abre el alta sin plantilla; con plantilla pide además update', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const role = required(target, 'el rol objetivo')
    await grantModulePermissions(tenant, MODULE, ['create'])
    const calls = operationCalls(role.roleId)

    const created = await assertStatus(assert, client, tenant, calls.store, 201)
    assert.equal(created.body().data.role.roleBusinessAccess, tenant.businessUnit.businessUnitSlug)

    const presetName = uniqueTestName('Alta con plantilla')
    const withPreset: ApiCall = {
      label: 'alta con plantilla',
      method: 'post',
      url: '/api/roles',
      body: { roleName: presetName, roleDescription: 'Plantilla', roleActive: true, rolePresetSlug: 'read-only' },
    }
    await assertDeniedAll(assert, client, tenant, [withPreset])
    assert.isNull(await Role.query().where('role_name', presetName).first())

    await grantModulePermissions(tenant, MODULE, ['create', 'update'])
    const createdWithPreset = await assertStatus(assert, client, tenant, withPreset, 201)
    assert.equal(createdWithPreset.body().data.appliedPreset.slug, 'read-only')
    assert.isNotEmpty(await grantsOf(createdWithPreset.body().data.role.roleId))

    await grantModulePermissions(tenant, MODULE, ['create'])
    await assertDeniedAll(assert, client, tenant, [calls.show])
  })

  test('update abre edición, asignación y plantillas sobre otro rol, y la baja mientras el BO la condiciona a canUpdate', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const role = required(target, 'el rol objetivo')
    const disposable = await createTenantRole(tenant, 'desechable')
    await grantModulePermissions(tenant, MODULE, ['update'])
    const calls = operationCalls(role.roleId)

    await assertStatus(assert, client, tenant, calls.update, 201)
    await assertStatus(assert, client, tenant, calls.assign, 201)
    await assertStatus(assert, client, tenant, calls.assignBatch, 201)
    await assertStatus(assert, client, tenant, calls.preview, 200)
    await assertStatus(assert, client, tenant, calls.apply, 201)
    assert.isNotEmpty(await grantsOf(role.roleId))

    await assertStatus(assert, client, tenant, operationCalls(disposable.roleId).destroy, 200)
    assert.isNull(await findAliveRole(disposable.roleId))

    await assertDeniedAll(assert, client, tenant, [calls.store, calls.show])
  })

  test('delete abre solo la baja', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')
    const role = required(target, 'el rol objetivo')
    await grantModulePermissions(tenant, MODULE, ['delete'])
    const calls = operationCalls(role.roleId)

    await assertDeniedAll(assert, client, tenant, [calls.show, calls.update, calls.assign])

    await assertStatus(assert, client, tenant, calls.destroy, 200)
    assert.isNull(await findAliveRole(role.roleId))
  })

  test('con update y delete nadie edita, borra ni se concede permisos sobre el rol de su sesión', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const role = required(target, 'el rol objetivo')
    await grantModulePermissions(tenant, MODULE, ['update', 'delete'])
    // Las plantillas resuelven el rol acotado a la empresa: el del actor tiene
    // que pertenecer a la suya para que el caso llegue al bloqueo.
    tenant.role.roleBusinessAccess = tenant.businessUnit.businessUnitSlug
    await tenant.role.save()
    const ownCalls = operationCalls(tenant.role.roleId)

    await assertRejectedAll(
      assert,
      client,
      tenant,
      [ownCalls.update, ownCalls.destroy, ownCalls.assign, ownCalls.assignBatch, ownCalls.apply],
      OWN_ROLE_LOCKED_KEY
    )

    const mixedBatch = await send(client, tenant, {
      label: 'lote con el rol propio',
      method: 'post',
      url: '/api/roles/assign-batch',
      body: {
        roles: [
          { roleId: role.roleId, permissions: [], roleManagementDays: 77 },
          { roleId: tenant.role.roleId, permissions: [], roleManagementDays: 1 },
        ],
      },
    })
    mixedBatch.assertStatus(403)
    assert.equal(mixedBatch.body().key, OWN_ROLE_LOCKED_KEY)
    assert.equal(mixedBatch.body().data.roleId, tenant.role.roleId)

    const reloadedTarget = await findAliveRole(role.roleId)
    assert.equal(reloadedTarget?.roleManagementDays, 10)
    const ownRole = await findAliveRole(tenant.role.roleId)
    assert.equal(ownRole?.roleName, tenant.role.roleName)
    assert.lengthOf(await grantsOf(tenant.role.roleId), 2)
  })

  test('owner cruza el gate por el bypass standard sin concesiones', async ({ client, assert }) => {
    const account = required(owner, 'el owner')
    const ownerTenantRole = await createTenantRole(account, 'owner-objetivo')
    const calls = operationCalls(ownerTenantRole.roleId)

    await assertStatus(assert, client, account, calls.indexPresets, 200)
    await assertStatus(assert, client, account, calls.store, 201)
    await assertStatus(assert, client, account, calls.assign, 201)
    for (const call of accessCalls(ownerTenantRole.roleId)) {
      await assertStatus(assert, client, account, call, 200)
    }
  })
})

test.group('Roles y permisos — nombres con slug de identidad reservado', (group) => {
  let owner: TenantActor | null = null

  group.setup(async () => {
    await assertModuleEnforced(MODULE)
    owner = await createBypassActor('owner', 'roles-reservados')
  })

  group.teardown(async () => {
    await cleanupTenantRoles(owner)
    await cleanupTenantActor(owner)
  })

  test('el alta rechaza root, owner, super-administrador y empleado y no crea el rol', async ({
    client,
    assert,
  }) => {
    const account = required(owner, 'el owner')

    for (const roleName of ['Super Administrador', 'Root', 'Owner', 'Empleado']) {
      const response = await send(client, account, {
        label: `alta "${roleName}"`,
        method: 'post',
        url: '/api/roles',
        body: { roleName, roleDescription: 'Intento de escalamiento', roleActive: true },
      })
      assert.equal(response.status(), 400, `"${roleName}" debe rechazarse`)
      assert.equal(response.body()?.key, RESERVED_NAME_KEY, `"${roleName}": clave`)
      assert.isNull(
        await Role.query()
          .where('role_name', roleName)
          .where('role_business_access', account.businessUnit.businessUnitSlug)
          .first(),
        `"${roleName}" no debe crearse en la empresa`
      )
    }
  })

  test('renombrar un rol del tenant hacia super-administrador se rechaza y conserva su slug', async ({
    client,
    assert,
  }) => {
    const account = required(owner, 'el owner')
    const role = await createTenantRole(account, 'renombre')

    const response = await send(client, account, {
      label: 'renombre a Super Administrador',
      method: 'put',
      url: `/api/roles/${role.roleId}`,
      body: { roleName: 'Super Administrador', roleDescription: 'Intento', roleActive: true },
    })
    response.assertStatus(400)
    assert.equal(response.body().key, RESERVED_NAME_KEY)

    const reloaded = await findAliveRole(role.roleId)
    assert.equal(reloaded?.roleSlug, role.roleSlug)
  })
})
