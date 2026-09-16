import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import Role from '#models/role'
import RoleSystemPermission from '#models/role_system_permission'
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
 * Identidad de un rol = (empresa, slug).
 *
 * El slug se deriva del nombre y el candado único era global: el segundo
 * cliente que creaba "Recursos Humanos" chocaba contra el índice de un rol que
 * no era suyo y recibía un 500. Ahora cada empresa tiene su propio cajón, el
 * duplicado dentro de la empresa se detecta ANTES de insertar y el nombre
 * vacío responde con contrato de error en lugar de reventar al derivar el slug.
 */

const MODULE = 'roles-and-permissions'

test.group('Roles — unicidad de nombre por empresa', (group) => {
  let actorA: TenantActor | null = null
  let actorB: TenantActor | null = null
  const createdRoleIds: number[] = []

  group.setup(async () => {
    actorA = await createTenantActor('role-uniqueness-a')
    actorB = await createTenantActor('role-uniqueness-b')
    await grantModulePermissions(actorA, MODULE, ['read', 'create', 'update'])
    await grantModulePermissions(actorB, MODULE, ['read', 'create', 'update'])
  })

  group.teardown(async () => {
    for (const roleId of createdRoleIds) {
      await RoleSystemPermission.query().where('role_id', roleId).delete()
      await Role.query().where('role_id', roleId).delete()
    }
    await cleanupTenantActor(actorA)
    await cleanupTenantActor(actorB)
  })

  async function postRole(
    client: ApiClient,
    actor: TenantActor,
    body: Record<string, unknown>
  ) {
    return client
      .post('/api/roles')
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json(body)
  }

  test('dos empresas pueden tener un rol con el mismo nombre', async ({ client, assert }) => {
    const tenantA = required(actorA, 'el actor A')
    const tenantB = required(actorB, 'el actor B')
    const roleName = uniqueTestName('Recursos Humanos')

    const inA = await postRole(client, tenantA, {
      roleName,
      roleDescription: 'Alta en la empresa A',
      roleActive: true,
    })
    inA.assertStatus(201)
    const roleInA = inA.body().data.role
    createdRoleIds.push(roleInA.roleId)

    const inB = await postRole(client, tenantB, {
      roleName,
      roleDescription: 'Alta en la empresa B',
      roleActive: true,
    })
    inB.assertStatus(201)
    const roleInB = inB.body().data.role
    createdRoleIds.push(roleInB.roleId)

    assert.notEqual(roleInA.roleId, roleInB.roleId)
    assert.equal(roleInA.roleSlug, roleInB.roleSlug, 'el slug se deriva igual en las dos empresas')
    assert.equal(roleInA.businessUnitId, tenantA.businessUnit.businessUnitId)
    assert.equal(roleInB.businessUnitId, tenantB.businessUnit.businessUnitId)
  })

  test('repetir el nombre dentro de la misma empresa responde 409 y no crea nada', async ({
    client,
    assert,
  }) => {
    const tenant = required(actorA, 'el actor A')
    const roleName = uniqueTestName('Nómina')

    const first = await postRole(client, tenant, {
      roleName,
      roleDescription: 'Primera alta',
      roleActive: true,
    })
    first.assertStatus(201)
    const created = first.body().data.role
    createdRoleIds.push(created.roleId)

    const second = await postRole(client, tenant, {
      roleName,
      roleDescription: 'Alta repetida',
      roleActive: true,
    })
    assert.equal(second.status(), 409, JSON.stringify(second.body()))
    assert.equal(second.body().key, 'rol-slug-duplicado')
    assert.isString(second.body().title)
    assert.isString(second.body().detail)

    const live = await Role.query()
      .whereNull('role_deleted_at')
      .where('role_slug', created.roleSlug)
      .where('business_unit_id', tenant.businessUnit.businessUnitId)
    assert.lengthOf(live, 1, 'el 409 no debe dejar una segunda fila viva')
  })

  test('el nombre vacío o de puros símbolos responde 409, no 500', async ({ client, assert }) => {
    const tenant = required(actorA, 'el actor A')

    for (const body of [
      { roleDescription: 'Sin nombre', roleActive: true },
      { roleName: '   ', roleDescription: 'Espacios', roleActive: true },
      { roleName: '!!!', roleDescription: 'Solo símbolos', roleActive: true },
    ]) {
      const response = await postRole(client, tenant, body)
      assert.equal(response.status(), 409, JSON.stringify(response.body()))
      assert.equal(response.body().key, 'rol-nombre-requerido')
      assert.isString(response.body().title)
      assert.isString(response.body().detail)
    }
  })

  test('renombrar un rol no mueve su slug', async ({ client, assert }) => {
    const tenant = required(actorA, 'el actor A')
    const original = await postRole(client, tenant, {
      roleName: uniqueTestName('Supervisión'),
      roleDescription: 'Alta para renombrar',
      roleActive: true,
    })
    original.assertStatus(201)
    const created = original.body().data.role
    createdRoleIds.push(created.roleId)

    const renamed = uniqueTestName('Coordinación')
    const response = await client
      .put(`/api/roles/${created.roleId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
      .json({ roleName: renamed, roleDescription: 'Renombrado', roleActive: true })
    assert.equal(response.status(), 201, JSON.stringify(response.body()))

    const reloaded = await Role.query().where('role_id', created.roleId).firstOrFail()
    assert.equal(reloaded.roleName, renamed)
    assert.equal(reloaded.roleSlug, created.roleSlug, 'el slug es la identidad: no cambia')
    assert.equal(reloaded.businessUnitId, tenant.businessUnit.businessUnitId)
  })

  test('el alta cuelga el rol de la empresa activa y solo esa lo lista', async ({
    client,
    assert,
  }) => {
    const tenantA = required(actorA, 'el actor A')
    const tenantB = required(actorB, 'el actor B')

    const created = await postRole(client, tenantA, {
      roleName: uniqueTestName('Capacitación'),
      roleDescription: 'Alta de la empresa A',
      roleActive: true,
    })
    created.assertStatus(201)
    const role = created.body().data.role
    createdRoleIds.push(role.roleId)

    const listForA = await client
      .get('/api/roles')
      .qs({ page: 1, limit: 200 })
      .loginAs(tenantA.user)
      .headers(businessUnitHeaders(tenantA))
    listForA.assertStatus(200)
    const idsForA: number[] = listForA
      .body()
      .data.roles.data.map((row: { roleId: number }) => row.roleId)
    assert.include(idsForA, role.roleId)

    const listForB = await client
      .get('/api/roles')
      .qs({ page: 1, limit: 200 })
      .loginAs(tenantB.user)
      .headers(businessUnitHeaders(tenantB))
    listForB.assertStatus(200)
    const idsForB: number[] = listForB
      .body()
      .data.roles.data.map((row: { roleId: number }) => row.roleId)
    assert.notInclude(idsForB, role.roleId)
  })
})
