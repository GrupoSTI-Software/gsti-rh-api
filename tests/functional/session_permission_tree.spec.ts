import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import type {
  SessionPermissionActionNode,
  SessionPermissionTree,
} from '#constants/session_permission_tree'

const TEST_PASSWORD = 'SessionPermissionTreeTest123!'

interface TenantActor {
  user: User
  person: Person
  role: Role
  businessUnit: BusinessUnit
  ownsRole: boolean
}

async function createTenantActor(emailPrefix: string, role: Role, ownsRole = false): Promise<TenantActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`

  const person = new Person()
  person.personFirstname = 'SessionPermissionTree'
  person.personLastname = 'Test'
  person.personSecondLastname = emailPrefix
  person.personEmail = email
  await person.save()

  const user = new User()
  user.userEmail = email
  user.userPassword = TEST_PASSWORD
  user.userActive = 1
  user.roleId = role.roleId
  user.personId = person.personId
  user.userEmailType = 'institutional'
  await user.save()

  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `Session Permission Tree ${stamp}`
  businessUnit.businessUnitSlug = `session-permission-tree-${stamp}`
  businessUnit.businessUnitLegalName = `Session Permission Tree Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  businessUnit.businessUnitOrigin = 'platform'
  await businessUnit.save()

  await user.related('businessUnits').attach([businessUnit.businessUnitId])

  return { user, person, role, businessUnit, ownsRole }
}

async function cleanupActor(actor: TenantActor | null) {
  if (!actor) return
  await actor.user.related('businessUnits').detach([actor.businessUnit.businessUnitId])
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await BusinessUnit.query().where('business_unit_id', actor.businessUnit.businessUnitId).delete()
  if (actor.ownsRole) {
    await RoleSystemPermission.query().where('role_id', actor.role.roleId).delete()
    await Role.query().where('role_id', actor.role.roleId).delete()
  }
}

function findEmployeeAction(tree: SessionPermissionTree, actionSlug: string): SessionPermissionActionNode {
  const employeeModule = tree.modules.find((moduleNode) => moduleNode.slug === 'employees')
  if (!employeeModule) {
    throw new Error('El árbol debe incluir el módulo employees.')
  }

  const action = employeeModule.sections
    .flatMap((section) => section.actions)
    .find((candidate) => candidate.slug === actionSlug)

  if (!action) {
    throw new Error(`El árbol debe incluir la acción employees:${actionSlug}.`)
  }

  return action
}

test.group('GET /api/auth/session/permissions — árbol de permisos de sesión', (group) => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  let standardActor: TenantActor | null = null
  let ownerActor: TenantActor | null = null
  let unresolvedActor: TenantActor | null = null
  let standardRole: Role
  let legacyAccessRole: Role
  let ownerRole: Role
  let employeesModule: SystemModule
  let previousEmployeesActive: number
  let previousEmployeesEnforcement: boolean
  let readPermission: SystemPermission
  let updatePermission: SystemPermission

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()

    previousEmployeesActive = employeesModule.systemModuleActive
    previousEmployeesEnforcement = employeesModule.systemModulePermissionEnforcementActive
    employeesModule.systemModuleActive = 1
    employeesModule.systemModulePermissionEnforcementActive = true
    await employeesModule.save()

    readPermission = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('system_module_id', employeesModule.systemModuleId)
      .where('system_permission_slug', 'read')
      .firstOrFail()
    updatePermission = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('system_module_id', employeesModule.systemModuleId)
      .where('system_permission_slug', 'update')
      .firstOrFail()

    standardRole = await Role.create({
      roleName: `Session Permission Tree Role ${stamp}`,
      roleSlug: `session-permission-tree-role-${stamp}`,
      roleDescription: 'Fixture de test',
      roleActive: 1,
      roleBusinessAccess: '',
      roleManagementDays: 10,
    })
    await RoleSystemPermission.create({
      roleId: standardRole.roleId,
      systemPermissionId: readPermission.systemPermissionId,
    })

    legacyAccessRole = await Role.create({
      roleName: `Session Permission Tree Legacy Role ${stamp}`,
      roleSlug: `session-permission-tree-legacy-role-${stamp}`,
      roleDescription: 'Fixture de test',
      roleActive: 1,
      roleBusinessAccess: '',
      roleManagementDays: 10,
    })
    await RoleSystemPermission.create({
      roleId: legacyAccessRole.roleId,
      systemPermissionId: readPermission.systemPermissionId,
    })

    ownerRole = await Role.query().whereNull('role_deleted_at').where('role_slug', 'owner').firstOrFail()

    standardActor = await createTenantActor('session-permission-tree', standardRole, true)
    ownerActor = await createTenantActor('session-permission-tree-owner', ownerRole)

    const unresolvedRole = await Role.create({
      roleName: `Session Permission Tree Unresolved Role ${stamp}`,
      roleSlug: `session-permission-tree-unresolved-role-${stamp}`,
      roleDescription: 'Fixture de test',
      roleActive: 1,
      roleBusinessAccess: '',
      roleManagementDays: 10,
    })
    unresolvedActor = await createTenantActor('session-permission-tree-unresolved', unresolvedRole)
    await unresolvedRole.delete()
  })

  group.teardown(async () => {
    await cleanupActor(standardActor)
    await cleanupActor(ownerActor)
    await cleanupActor(unresolvedActor)
    if (legacyAccessRole) {
      await RoleSystemPermission.query().where('role_id', legacyAccessRole.roleId).delete()
      await Role.query().where('role_id', legacyAccessRole.roleId).delete()
    }

    if (employeesModule) {
      employeesModule.systemModuleActive = previousEmployeesActive
      employeesModule.systemModulePermissionEnforcementActive = previousEmployeesEnforcement
      await employeesModule.save()
    }
  })

  test('rechaza requests sin token en el árbol completo y la versión', async ({ client }) => {
    const treeResponse = await client.get('/api/auth/session/permissions')
    treeResponse.assertStatus(401)

    const versionResponse = await client.get('/api/auth/session/permissions/version')
    versionResponse.assertStatus(401)
  })

  test('rechaza sesiones cuyo rol ya no puede resolverse', async ({ client, assert }) => {
    const treeResponse = await client
      .get('/api/auth/session/permissions')
      .loginAs(unresolvedActor!.user)
    treeResponse.assertStatus(403)
    assert.equal(treeResponse.body().key, 'PERM.TREE.UNRESOLVED')

    const versionResponse = await client
      .get('/api/auth/session/permissions/version')
      .loginAs(unresolvedActor!.user)
    versionResponse.assertStatus(403)
    assert.equal(versionResponse.body().key, 'PERM.TREE.UNRESOLVED')
  })

  test('devuelve el árbol del rol de sesión con asignaciones y negaciones explícitas', async ({
    client,
    assert,
  }) => {
    const response = await client.get('/api/auth/session/permissions').loginAs(standardActor!.user)

    response.assertStatus(200)

    const body = response.body() as { data: SessionPermissionTree }
    assert.equal(body.data.role.slug, standardRole.roleSlug)
    assert.isString(body.data.version)
    assert.isAbove(body.data.version.length, 0)
    assert.isNotNaN(Date.parse(body.data.generatedAt))

    const readAction = findEmployeeAction(body.data, 'read')
    assert.equal(readAction.allowed, true)
    assert.equal(readAction.reason, 'assignment')

    const updateAction = findEmployeeAction(body.data, 'update')
    assert.equal(updateAction.allowed, false)
    assert.equal(updateAction.reason, 'missing-assignment')
  })

  test('devuelve permisos privilegiados para owner aunque no tenga grants', async ({ client, assert }) => {
    const response = await client.get('/api/auth/session/permissions').loginAs(ownerActor!.user)

    response.assertStatus(200)

    const body = response.body() as { data: SessionPermissionTree }
    assert.equal(body.data.role.slug, 'owner')

    const readAction = findEmployeeAction(body.data, 'read')
    assert.equal(readAction.allowed, true)
    assert.equal(readAction.reason, 'privileged-role')
  })

  test('ignora roleId en query y conserva el rol autenticado', async ({ client, assert }) => {
    const response = await client
      .get(`/api/auth/session/permissions?roleId=${ownerRole.roleId}`)
      .loginAs(standardActor!.user)

    response.assertStatus(200)

    const body = response.body() as { data: SessionPermissionTree }
    assert.equal(body.data.role.id, standardRole.roleId)
    assert.equal(body.data.role.slug, standardRole.roleSlug)
  })

  test('devuelve la misma versión en el árbol y en el endpoint liviano', async ({ client, assert }) => {
    const treeResponse = await client.get('/api/auth/session/permissions').loginAs(standardActor!.user)
    treeResponse.assertStatus(200)

    const versionResponse = await client
      .get('/api/auth/session/permissions/version')
      .loginAs(standardActor!.user)
    versionResponse.assertStatus(200)

    assert.equal(versionResponse.body().data.version, treeResponse.body().data.version)
    assert.isNotNaN(Date.parse(versionResponse.body().data.generatedAt))
  })

  test('cambia la versión al reasignar permisos del rol de sesión', async ({ client, assert }) => {
    const beforeResponse = await client
      .get('/api/auth/session/permissions/version')
      .loginAs(standardActor!.user)
    beforeResponse.assertStatus(200)

    const assignResponse = await client
      .post(`/api/roles/assign/${standardRole.roleId}`)
      .loginAs(standardActor!.user)
      .header('X-Business-Unit-Id', standardActor!.businessUnit.businessUnitPublicId)
      .json({ roleManagementDays: 10, permissions: [updatePermission.systemPermissionId] })
    assignResponse.assertStatus(201)

    const afterResponse = await client
      .get('/api/auth/session/permissions/version')
      .loginAs(standardActor!.user)
    afterResponse.assertStatus(200)

    assert.notEqual(afterResponse.body().data.version, beforeResponse.body().data.version)
  })

  test('mantiene intacto el contrato legado de has-access', async ({ client }) => {
    const response = await client
      .get(`/api/roles/has-access/${legacyAccessRole.roleId}/employees/read`)
      .loginAs(standardActor!.user)
      .header('X-Business-Unit-Id', standardActor!.businessUnit.businessUnitPublicId)

    response.assertStatus(200)
    response.assertBodyContains({ data: { roleHasAccess: true } })
  })
})
