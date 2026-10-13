import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import Role from '#models/role'
import RoleService, { buildRoleHumanCapitalTrace } from '#services/role_service'
import { getRolePreset } from '#constants/role_presets'
import { isHumanCapitalIneligibleRole } from '#helpers/system_role_lock'
import {
  addRoleModulePermissions,
  businessUnitHeaders,
  cleanupTenantActor,
  createTenantActor,
  grantModulePermissions,
  uniqueTestName,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

test.group('Marca Recursos Humanos del rol', (group) => {
  let actor: TenantActor

  group.setup(async () => {
    actor = await createTenantActor('marca-rh')
    await grantModulePermissions(actor, 'roles-and-permissions', ['create', 'update', 'read'])
  })

  group.teardown(async () => {
    await cleanupTenantActor(actor)
  })

  test('CA1 y CA2 el alta con la marca la devuelve en true y sin el campo nace en false', async ({
    client,
    assert,
  }) => {
    const marked = await client
      .post('/api/roles')
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json({
        roleName: uniqueTestName('Talento'),
        roleDescription: 'Equipo de personas',
        roleActive: true,
        roleHumanCapital: true,
      })
    marked.assertStatus(201)
    assert.equal(marked.body().data.role.roleHumanCapital, true)

    const roleId = marked.body().data.role.roleId as number
    const detail = await client
      .get(`/api/roles/${roleId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
    detail.assertStatus(200)
    assert.equal(detail.body().data.role.roleHumanCapital, true)

    const list = await client
      .get('/api/roles')
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
    list.assertStatus(200)
    const listed = findRole(list.body(), roleId)
    assert.equal(listed?.roleHumanCapital, true)

    const plain = await client
      .post('/api/roles')
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json({
        roleName: uniqueTestName('Operacion'),
        roleDescription: 'Sin marca',
        roleActive: true,
      })
    plain.assertStatus(201)
    assert.equal(plain.body().data.role.roleHumanCapital, false)
  })

  test('CA3 la plantilla de administrador de RH no enciende la marca', async ({ client, assert }) => {
    await addRoleModulePermissions(actor.role, 'employees', getRolePreset('hr-admin').permissionSlugs)

    const blank = await client
      .post('/api/roles')
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json({
        roleName: uniqueTestName('Plantilla apagada'),
        roleDescription: 'Plantilla',
        roleActive: true,
        rolePresetSlug: 'hr-admin',
      })
    blank.assertStatus(201)
    assert.equal(blank.body().data.role.roleHumanCapital, false)

    const marked = await client
      .post('/api/roles')
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json({
        roleName: uniqueTestName('Plantilla encendida'),
        roleDescription: 'Plantilla',
        roleActive: true,
        rolePresetSlug: 'hr-admin',
        roleHumanCapital: true,
      })
    marked.assertStatus(201)
    assert.equal(marked.body().data.role.roleHumanCapital, true)
  })

  test('CA4 y CA5 editar la marca la cambia y omitirla la conserva', async ({ client, assert }) => {
    const created = await createRole(client, actor, uniqueTestName('Editable'), false)
    const roleId = created.roleId

    const on = await client
      .put(`/api/roles/${roleId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json({ roleName: created.roleName, roleDescription: 'Edicion', roleActive: true, roleHumanCapital: true })
    on.assertStatus(201)
    assert.equal(on.body().data.role.roleHumanCapital, true)

    const off = await client
      .put(`/api/roles/${roleId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json({ roleName: created.roleName, roleDescription: 'Edicion', roleActive: true, roleHumanCapital: false })
    off.assertStatus(201)
    assert.equal(off.body().data.role.roleHumanCapital, false)

    await client
      .put(`/api/roles/${roleId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json({ roleName: created.roleName, roleDescription: 'Edicion', roleActive: true, roleHumanCapital: true })

    const kept = await client
      .put(`/api/roles/${roleId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json({ roleName: `${created.roleName} bis`, roleDescription: 'Solo nombre', roleActive: true })
    kept.assertStatus(201)
    assert.equal(kept.body().data.role.roleHumanCapital, true)
  })

  test('CA6 un valor que no es booleano responde 422 y no cambia la marca', async ({
    client,
    assert,
  }) => {
    const created = await createRole(client, actor, uniqueTestName('Estricto'), false)
    const rejected = await client
      .put(`/api/roles/${created.roleId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json({
        roleName: created.roleName,
        roleDescription: 'Tipo',
        roleActive: true,
        roleHumanCapital: 'sí',
      })
    assert.equal(rejected.status(), 422)
    const stored = await Role.findOrFail(created.roleId)
    assert.equal(stored.roleHumanCapital, false)

    const rejectedCreate = await client
      .post('/api/roles')
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json({
        roleName: uniqueTestName('Tipo invalido'),
        roleDescription: 'Tipo',
        roleActive: true,
        roleHumanCapital: 'sí',
      })
    assert.equal(rejectedCreate.status(), 422)
  })

  test('CA7 la marca no concede el permiso de editar roles', async ({ client, assert }) => {
    const limited = await createTenantActor('sin-update')
    await grantModulePermissions(limited, 'roles-and-permissions', ['create'])
    limited.role.roleHumanCapital = true
    await limited.role.save()
    const target = await Role.create({
      roleName: uniqueTestName('Ajeno'),
      roleSlug: `ajeno-${Date.now()}`,
      roleDescription: 'Otro rol',
      roleActive: 1,
      businessUnitId: limited.businessUnit.businessUnitId,
      roleHumanCapital: false,
    })

    try {
      const response = await client
        .put(`/api/roles/${target.roleId}`)
        .loginAs(limited.user)
        .headers(businessUnitHeaders(limited))
        .json({
          roleName: target.roleName,
          roleDescription: 'Intento',
          roleActive: true,
          roleHumanCapital: true,
        })
      assert.equal(response.status(), 403)
      const stored = await Role.findOrFail(target.roleId)
      assert.equal(stored.roleHumanCapital, false)
    } finally {
      await cleanupTenantActor(limited)
    }
  })

  test('CA8 un rol de otra empresa responde 404', async ({ client, assert }) => {
    const other = await createTenantActor('empresa-b')
    const foreign = await Role.create({
      roleName: uniqueTestName('De B'),
      roleSlug: `de-b-${Date.now()}`,
      roleDescription: 'Rol de B',
      roleActive: 1,
      businessUnitId: other.businessUnit.businessUnitId,
      roleHumanCapital: false,
    })

    try {
      const response = await client
        .put(`/api/roles/${foreign.roleId}`)
        .loginAs(actor.user)
        .headers(businessUnitHeaders(actor))
        .json({
          roleName: foreign.roleName,
          roleDescription: 'Cruce',
          roleActive: true,
          roleHumanCapital: true,
        })
      assert.equal(response.status(), 404)
      const stored = await Role.findOrFail(foreign.roleId)
      assert.equal(stored.roleHumanCapital, false)
    } finally {
      await cleanupTenantActor(other)
    }
  })

  test('CA9 nadie enciende la marca en su propio rol', async ({ client, assert }) => {
    const response = await client
      .put(`/api/roles/${actor.role.roleId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json({
        roleName: actor.role.roleName,
        roleDescription: actor.role.roleDescription,
        roleActive: true,
        roleHumanCapital: true,
      })
    assert.equal(response.status(), 403)
    assert.equal(response.body().key, 'rol-propio-bloqueado')
    const stored = await Role.findOrFail(actor.role.roleId)
    assert.equal(stored.roleHumanCapital, false)
  })

  test('CA10 el dueño y el colaborador no aceptan la marca', async ({ client, assert }) => {
    const owner = await Role.create({
      roleName: 'Dueño de prueba',
      roleSlug: 'owner',
      roleDescription: 'Dueño',
      roleActive: 1,
      businessUnitId: actor.businessUnit.businessUnitId,
      roleHumanCapital: false,
    })
    const employee = await Role.create({
      roleName: 'Colaborador de prueba',
      roleSlug: 'empleado',
      roleDescription: 'Colaborador',
      roleActive: 1,
      businessUnitId: actor.businessUnit.businessUnitId,
      roleHumanCapital: false,
    })

    for (const role of [owner, employee]) {
      const response = await client
        .put(`/api/roles/${role.roleId}`)
        .loginAs(actor.user)
        .headers(businessUnitHeaders(actor))
        .json({
          roleName: role.roleName,
          roleDescription: role.roleDescription,
          roleActive: true,
          roleHumanCapital: true,
        })
      assert.equal(response.status(), 403)
      assert.equal(response.body().key, 'rol-tenant-no-administrable')
      const stored = await Role.findOrFail(role.roleId)
      assert.equal(stored.roleHumanCapital, false)
    }
  })

  test('CA11 el servicio no persiste la marca en root, owner ni empleado', async ({ assert }) => {
    assert.isTrue(isHumanCapitalIneligibleRole({ roleSlug: 'root' }))
    assert.isTrue(isHumanCapitalIneligibleRole({ roleSlug: 'owner' }))
    assert.isTrue(isHumanCapitalIneligibleRole({ roleSlug: 'empleado' }))
    assert.isFalse(isHumanCapitalIneligibleRole({ roleSlug: 'talento' }))

    await Role.query()
      .where('business_unit_id', actor.businessUnit.businessUnitId)
      .where('role_slug', 'empleado')
      .delete()

    const service = new RoleService()
    const draft = new Role()
    draft.roleName = uniqueTestName('Colaborador marcado')
    draft.roleSlug = 'empleado'
    draft.roleDescription = 'No elegible'
    draft.roleActive = 1
    draft.businessUnitId = actor.businessUnit.businessUnitId
    draft.roleHumanCapital = true
    const created = await service.create(draft)
    assert.equal(created.roleHumanCapital, false)
  })

  test('CA12 la traza solo sale cuando la marca cambia', ({ assert }) => {
    const same = buildRoleHumanCapitalTrace({
      actorUserId: 1,
      roleId: 2,
      businessUnitId: 3,
      previous: false,
      next: false,
    })
    assert.isNull(same)

    const changed = buildRoleHumanCapitalTrace({
      actorUserId: 8,
      roleId: 9,
      businessUnitId: null,
      previous: false,
      next: true,
    })
    assert.deepEqual(changed, {
      event: 'role.human_capital.changed',
      actorUserId: 8,
      roleId: 9,
      businessUnitId: null,
      previous: false,
      next: true,
    })
    assert.equal(Object.keys(changed ?? {}).length, 6)
  })
})

async function createRole(client: ApiClient, actor: TenantActor, roleName: string, roleHumanCapital: boolean) {
  const response = await client
    .post('/api/roles')
    .loginAs(actor.user)
    .headers(businessUnitHeaders(actor))
    .json({
      roleName,
      roleDescription: 'Rol de prueba',
      roleActive: true,
      roleHumanCapital,
    })
  response.assertStatus(201)
  return response.body().data.role as { roleId: number; roleName: string }
}

function findRole(body: unknown, roleId: number): { roleHumanCapital?: boolean } | null {
  if (!body || typeof body !== 'object') return null
  if (Array.isArray(body)) {
    for (const item of body) {
      const found = findRole(item, roleId)
      if (found) return found
    }
    return null
  }
  const record = body as Record<string, unknown>
  if (record.roleId === roleId) return record as { roleHumanCapital?: boolean }
  for (const value of Object.values(record)) {
    const found = findRole(value, roleId)
    if (found) return found
  }
  return null
}
