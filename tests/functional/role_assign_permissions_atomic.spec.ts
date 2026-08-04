import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'

const TEST_PASSWORD = 'RoleAssignAtomicTest123!'

interface TenantActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
}

async function createRootActor(emailPrefix: string): Promise<TenantActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').first()
  if (!role) {
    throw new Error('Se requiere el rol root en BD para este test.')
  }

  const person = new Person()
  person.personFirstname = 'RoleAssignAtomic'
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
  businessUnit.businessUnitName = `Role Assign Atomic ${stamp}`
  businessUnit.businessUnitSlug = `role-assign-atomic-${stamp}`
  businessUnit.businessUnitLegalName = `Role Assign Atomic Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  businessUnit.businessUnitOrigin = 'platform'
  await businessUnit.save()

  await user.related('businessUnits').attach([businessUnit.businessUnitId])

  return { user, person, businessUnit }
}

async function cleanupActor(actor: TenantActor | null) {
  if (!actor) return
  await actor.user.related('businessUnits').detach([actor.businessUnit.businessUnitId])
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await BusinessUnit.query().where('business_unit_id', actor.businessUnit.businessUnitId).delete()
}

test.group('POST /api/roles/assign/:roleId — atomicidad (USRH1785766406721)', (group) => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  let actor: TenantActor | null = null
  let targetRole: Role
  let systemModule: SystemModule
  let permission: SystemPermission

  group.setup(async () => {
    actor = await createRootActor('role-assign-atomic')
    targetRole = await Role.create({
      roleName: `Test Assign Atomic Role ${stamp}`,
      roleSlug: `test-assign-atomic-role-${stamp}`,
      roleDescription: 'Fixture de test',
      roleActive: 1,
      roleBusinessAccess: '',
      roleManagementDays: 10,
    })
    systemModule = await SystemModule.create({
      systemModuleName: 'Test Assign Atomic Module',
      systemModuleSlug: `test-assign-atomic-module-${stamp}`,
      systemModuleDescription: 'Fixture de test',
      systemModules: 1,
      systemModulePath: `/test-assign-atomic-${stamp}`,
      systemModuleGroup: 'test',
      systemModuleActive: 1,
      systemModuleIcon: '',
    })
    permission = await SystemPermission.create({
      systemPermissionName: 'Read',
      systemPermissionSlug: 'read',
      systemModuleId: systemModule.systemModuleId,
    })
  })

  group.teardown(async () => {
    await RoleSystemPermission.query().where('role_id', targetRole.roleId).delete()
    await SystemPermission.query().where('system_permission_id', permission.systemPermissionId).delete()
    await SystemModule.query().where('system_module_id', systemModule.systemModuleId).delete()
    await Role.query().where('role_id', targetRole.roleId).delete()
    await cleanupActor(actor)
  })

  test('asignación válida: guarda roleManagementDays y los permisos', async ({ client, assert }) => {
    const response = await client
      .post(`/api/roles/assign/${targetRole.roleId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json({ roleManagementDays: 45, permissions: [permission.systemPermissionId] })

    response.assertStatus(201)

    const reloaded = await Role.query().where('role_id', targetRole.roleId).firstOrFail()
    assert.equal(reloaded.roleManagementDays, 45)

    const grants = await RoleSystemPermission.query().where('role_id', targetRole.roleId)
    assert.lengthOf(grants, 1)
  })

  test('permiso inexistente: revierte también roleManagementDays (atomicidad)', async ({ client, assert }) => {
    const before = await Role.query().where('role_id', targetRole.roleId).firstOrFail()
    const previousDays = before.roleManagementDays

    const response = await client
      .post(`/api/roles/assign/${targetRole.roleId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .setup((request) => {
        request.request.ok(() => true)
      })
      .json({ roleManagementDays: 999, permissions: [999999999] })

    response.assertStatus(500)
    assert.equal(response.body().key, 'asignacion-permisos-rol-fallida')

    const reloaded = await Role.query().where('role_id', targetRole.roleId).firstOrFail()
    assert.equal(reloaded.roleManagementDays, previousDays)

    const grants = await RoleSystemPermission.query()
      .where('role_id', targetRole.roleId)
      .where('system_permission_id', 999999999)
    assert.lengthOf(grants, 0)
  })
})
