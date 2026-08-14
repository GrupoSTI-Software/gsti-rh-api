import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'

const TEST_PASSWORD = 'RoleAssignBatchTest123!'

interface TenantActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
}

/**
 * Crea un actor de tenant con el rol indicado por slug (`root` para bypasear
 * el bloqueo de roles de sistema, cualquier otro slug no-root para probarlo).
 */
async function createActor(roleSlug: string, emailPrefix: string): Promise<TenantActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query()
    .whereNull('role_deleted_at')
    .where('role_slug', roleSlug)
    .first()
  if (!role) {
    throw new Error(`Se requiere el rol "${roleSlug}" en BD para este test.`)
  }

  const person = new Person()
  person.personFirstname = 'RoleAssignBatch'
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
  businessUnit.businessUnitName = `Role Assign Batch ${stamp}`
  businessUnit.businessUnitSlug = `role-assign-batch-${stamp}`
  businessUnit.businessUnitLegalName = `Role Assign Batch Legal ${stamp}`
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

test.group('POST /api/roles/assign-batch — atomicidad de conjunto (USRH1785766406741)', (group) => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  let actor: TenantActor | null = null
  let nonRootActor: TenantActor | null = null
  let roleA: Role
  let roleB: Role
  let ownerRole: Role
  let systemModule: SystemModule
  let permission: SystemPermission

  group.setup(async () => {
    actor = await createActor('root', 'role-assign-batch-root')
    nonRootActor = await createActor('rh-manager', 'role-assign-batch-rh')

    roleA = await Role.create({
      roleName: `Test Assign Batch Role A ${stamp}`,
      roleSlug: `test-assign-batch-role-a-${stamp}`,
      roleDescription: 'Fixture de test',
      roleActive: 1,
      roleBusinessAccess: '',
      roleManagementDays: 10,
    })
    roleB = await Role.create({
      roleName: `Test Assign Batch Role B ${stamp}`,
      roleSlug: `test-assign-batch-role-b-${stamp}`,
      roleDescription: 'Fixture de test',
      roleActive: 1,
      roleBusinessAccess: '',
      roleManagementDays: 10,
    })
    // Rol de sistema ya seedeado en BD (no se crea ni se borra en este test).
    ownerRole = await Role.query()
      .whereNull('role_deleted_at')
      .where('role_slug', 'owner')
      .firstOrFail()

    systemModule = await SystemModule.create({
      systemModuleName: 'Test Assign Batch Module',
      systemModuleSlug: `test-assign-batch-module-${stamp}`,
      systemModuleDescription: 'Fixture de test',
      systemModules: '1',
      systemModulePath: `/test-assign-batch-${stamp}`,
      systemModuleGroup: 'test',
      systemModuleActive: 1,
      systemModuleIcon: '',
    })
    permission = await SystemPermission.create({
      systemPermissionName: 'Read',
      systemPermissionSlug: 'read',
      systemModuleId: systemModule.systemModuleId,
    })

    // Grant previo en roleB: prueba que enviar `permissions: []` en el lote
    // sincroniza (borra) los permisos existentes, no solo los omite.
    await RoleSystemPermission.create({
      roleId: roleB.roleId,
      systemPermissionId: permission.systemPermissionId,
    })
  })

  group.teardown(async () => {
    await RoleSystemPermission.query().where('role_id', roleA.roleId).delete()
    await RoleSystemPermission.query().where('role_id', roleB.roleId).delete()
    await SystemPermission.query()
      .where('system_permission_id', permission.systemPermissionId)
      .delete()
    await SystemModule.query().where('system_module_id', systemModule.systemModuleId).delete()
    await Role.query().where('role_id', roleA.roleId).delete()
    await Role.query().where('role_id', roleB.roleId).delete()
    await cleanupActor(actor)
    await cleanupActor(nonRootActor)
  })

  test('éxito: actualiza days y grants de todos los roles del lote', async ({ client, assert }) => {
    const response = await client
      .post('/api/roles/assign-batch')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json({
        roles: [
          {
            roleId: roleA.roleId,
            permissions: [permission.systemPermissionId],
            roleManagementDays: 30,
          },
          {
            roleId: roleB.roleId,
            permissions: [],
            roleManagementDays: null,
          },
        ],
      })

    response.assertStatus(201)

    const reloadedA = await Role.query().where('role_id', roleA.roleId).firstOrFail()
    assert.equal(reloadedA.roleManagementDays, 30)
    const grantsA = await RoleSystemPermission.query()
      .whereNull('role_system_permission_deleted_at')
      .where('role_id', roleA.roleId)
    assert.lengthOf(grantsA, 1)

    const reloadedB = await Role.query().where('role_id', roleB.roleId).firstOrFail()
    assert.isNull(reloadedB.roleManagementDays)
    const grantsB = await RoleSystemPermission.query()
      .whereNull('role_system_permission_deleted_at')
      .where('role_id', roleB.roleId)
    assert.lengthOf(grantsB, 0)
  })

  test('permiso inválido en un rol: no cambia ninguno del lote', async ({ client, assert }) => {
    // Estado previo conocido en A y B, distinto al que llegará en el payload.
    const seedA = await Role.query().where('role_id', roleA.roleId).firstOrFail()
    seedA.roleManagementDays = 20
    await seedA.save()
    const seedB = await Role.query().where('role_id', roleB.roleId).firstOrFail()
    seedB.roleManagementDays = 5
    await seedB.save()

    const grantsBeforeA = await RoleSystemPermission.query()
      .whereNull('role_system_permission_deleted_at')
      .where('role_id', roleA.roleId)
    const grantsBeforeB = await RoleSystemPermission.query()
      .whereNull('role_system_permission_deleted_at')
      .where('role_id', roleB.roleId)

    const response = await client
      .post('/api/roles/assign-batch')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .setup((request) => {
        request.request.ok(() => true)
      })
      .json({
        roles: [
          {
            roleId: roleA.roleId,
            permissions: [permission.systemPermissionId],
            roleManagementDays: 77,
          },
          {
            roleId: roleB.roleId,
            permissions: [999999999],
            roleManagementDays: 88,
          },
        ],
      })

    response.assertStatus(500)
    assert.equal(response.body().key, 'asignacion-permisos-lote-fallida')

    const reloadedA = await Role.query().where('role_id', roleA.roleId).firstOrFail()
    assert.equal(reloadedA.roleManagementDays, 20)
    const reloadedB = await Role.query().where('role_id', roleB.roleId).firstOrFail()
    assert.equal(reloadedB.roleManagementDays, 5)

    const grantsAfterA = await RoleSystemPermission.query()
      .whereNull('role_system_permission_deleted_at')
      .where('role_id', roleA.roleId)
    assert.lengthOf(grantsAfterA, grantsBeforeA.length)
    const grantsAfterB = await RoleSystemPermission.query()
      .whereNull('role_system_permission_deleted_at')
      .where('role_id', roleB.roleId)
    assert.lengthOf(grantsAfterB, grantsBeforeB.length)
  })

  test('rol de sistema en el lote: 403, identifica el rol y no escribe nada', async ({
    client,
    assert,
  }) => {
    const seedA = await Role.query().where('role_id', roleA.roleId).firstOrFail()
    const previousDays = seedA.roleManagementDays

    const response = await client
      .post('/api/roles/assign-batch')
      .loginAs(nonRootActor!.user)
      .header('X-Business-Unit-Id', nonRootActor!.businessUnit.businessUnitPublicId)
      .setup((request) => {
        request.request.ok(() => true)
      })
      .json({
        roles: [
          {
            roleId: roleA.roleId,
            permissions: [permission.systemPermissionId],
            roleManagementDays: 55,
          },
          {
            roleId: ownerRole.roleId,
            permissions: [permission.systemPermissionId],
            roleManagementDays: 1,
          },
        ],
      })

    response.assertStatus(403)
    assert.equal(response.body().key, 'rol-sistema-bloqueado-lote')
    assert.equal(response.body().data.roleSlug, 'owner')

    const reloadedA = await Role.query().where('role_id', roleA.roleId).firstOrFail()
    assert.equal(reloadedA.roleManagementDays, previousDays)
  })
})
