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
import { ensureRole } from '#tests/helpers/ensure_role'
import { assertModuleEnforced } from '#tests/helpers/tenant_actor'
import { PERMISSION_GATE_ERROR_CODES } from '#constants/permission_gate_error_codes'

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
  let legacyActor: TenantActor | null = null
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

    ownerRole = await ensureRole('owner')

    standardActor = await createTenantActor('session-permission-tree', standardRole, true)
    ownerActor = await createTenantActor('session-permission-tree-owner', ownerRole)
    // Sesión cuyo rol ES `legacyAccessRole`: has-access solo responde la matriz
    // del rol de la sesión a quien no tiene roles-and-permissions:read.
    legacyActor = await createTenantActor('session-permission-tree-legacy', legacyAccessRole)

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
    await cleanupActor(legacyActor)
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

  test('marca como no otorgables las acciones exentas y otorgables al resto', async ({
    client,
    assert,
  }) => {
    const response = await client.get('/api/auth/session/permissions').loginAs(standardActor!.user)
    response.assertStatus(200)

    const body = response.body() as { data: SessionPermissionTree }
    const employeesNode = body.data.modules.find((moduleNode) => moduleNode.slug === 'employees')!
    const collaboratorSection = employeesNode.sections.find(
      (section) => section.slug === 'app-colaborador'
    )!

    assert.isAbove(collaboratorSection.actions.length, 0)
    assert.isTrue(collaboratorSection.actions.every((action) => action.grantable === false))

    const grantableActions = employeesNode.sections
      .flatMap((section) => section.actions)
      .filter((action) => action.grantable)
    assert.isAbove(grantableActions.length, 0)
    assert.isTrue(findEmployeeAction(body.data, 'read').grantable)
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

    // Reasigna otra cuenta: nadie cambia los permisos del rol de su propia
    // sesión salvo root u owner (`isOwnRoleLockedForUser`).
    const assignResponse = await client
      .post(`/api/roles/assign/${standardRole.roleId}`)
      .loginAs(ownerActor!.user)
      .header('X-Business-Unit-Id', ownerActor!.businessUnit.businessUnitPublicId)
      .json({ roleManagementDays: 10, permissions: [updatePermission.systemPermissionId] })
    assignResponse.assertStatus(201)

    const afterResponse = await client
      .get('/api/auth/session/permissions/version')
      .loginAs(standardActor!.user)
    afterResponse.assertStatus(200)

    assert.notEqual(afterResponse.body().data.version, beforeResponse.body().data.version)
  })

  test('mantiene intacto el contrato legado de has-access para el rol de la sesión', async ({
    client,
  }) => {
    const response = await client
      .get(`/api/roles/has-access/${legacyAccessRole.roleId}/employees/read`)
      .loginAs(legacyActor!.user)
      .header('X-Business-Unit-Id', legacyActor!.businessUnit.businessUnitPublicId)

    response.assertStatus(200)
    response.assertBodyContains({ data: { roleHasAccess: true } })
  })

  test('has-access sobre un rol ajeno pide roles-and-permissions:read; owner lo cruza sin concesiones', async ({
    client,
    assert,
  }) => {
    await assertModuleEnforced('roles-and-permissions')

    const denied = await client
      .get(`/api/roles/has-access/${legacyAccessRole.roleId}/employees/read`)
      .loginAs(standardActor!.user)
      .header('X-Business-Unit-Id', standardActor!.businessUnit.businessUnitPublicId)
    denied.assertStatus(403)
    assert.equal(denied.body().key, PERMISSION_GATE_ERROR_CODES.DENIED)

    const allowed = await client
      .get(`/api/roles/has-access/${legacyAccessRole.roleId}/employees/read`)
      .loginAs(ownerActor!.user)
      .header('X-Business-Unit-Id', ownerActor!.businessUnit.businessUnitPublicId)
    allowed.assertStatus(200)
    allowed.assertBodyContains({ data: { roleHasAccess: true } })
  })
})

/**
 * Contrato de `permissionEnforcementActive` en el árbol de sesión: el BO lo
 * pinta como "Vigilancia activa / Solo declarada". Antes lo cubría el spec del
 * interruptor HTTP de exigencia, retirado porque la bandera la gobierna la
 * constante de módulos.
 *
 * Va en un grupo propio a propósito: el caso mueve la bandera de exigencia de
 * `employees` en los dos sentidos y el grupo de arriba la fija encendida para
 * todos sus casos. Separarlos aísla ese cambio y deja que cada grupo reponga el
 * valor previo en su teardown. Aquí el rol es del test.
 */
test.group('GET /api/auth/session/permissions — bandera de exigencia por módulo', (group) => {
  let actor: TenantActor | null = null
  let employeesModule: SystemModule
  let previousEmployeesEnforcement: boolean

  group.setup(async () => {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    previousEmployeesEnforcement = employeesModule.systemModulePermissionEnforcementActive

    const role = await Role.create({
      roleName: `Session Permission Tree Enforcement Role ${stamp}`,
      roleSlug: `session-permission-tree-enforcement-role-${stamp}`,
      roleDescription: 'Fixture de test',
      roleActive: 1,
      roleBusinessAccess: '',
      roleManagementDays: 10,
    })
    actor = await createTenantActor('session-permission-tree-enforcement', role, true)
  })

  group.teardown(async () => {
    await cleanupActor(actor)
    // Repone el valor previo y no un `false` fijo, para no dejar la BD al revés de la constante.
    if (employeesModule) {
      employeesModule.systemModulePermissionEnforcementActive = previousEmployeesEnforcement
      await employeesModule.save()
    }
  })

  test('refleja en cada módulo la bandera de exigencia guardada en system_modules', async ({
    client,
    assert,
  }) => {
    // Se prueban ambos valores para descartar un campo fijo o copiado de `active`.
    for (const expected of [true, false]) {
      employeesModule.systemModulePermissionEnforcementActive = expected
      await employeesModule.save()

      const response = await client.get('/api/auth/session/permissions').loginAs(actor!.user)
      response.assertStatus(200)

      const body = response.body() as { data: SessionPermissionTree }
      const employeesNode = body.data.modules.find((moduleNode) => moduleNode.slug === 'employees')
      assert.exists(employeesNode)
      assert.strictEqual(employeesNode!.permissionEnforcementActive, expected)
    }
  })
})
