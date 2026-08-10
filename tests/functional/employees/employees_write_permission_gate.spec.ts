import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'

const TEST_PASSWORD = 'EmployeesWriteSoftRolloutTest123!'

interface TenantActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
  role: Role
}

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
      `Se requiere el permiso "${moduleSlug}:${permissionSlug}" en BD para este test.`
    )
  }

  return permission.systemPermissionId
}

async function createActor(emailPrefix: string): Promise<TenantActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Employees Write Soft Rollout ${stamp}`,
    businessUnitSlug: `employees-write-soft-rollout-${stamp}`,
    businessUnitLegalName: `Employees Write Soft Rollout Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const role = await Role.create({
    roleName: `Employees Write Soft Rollout ${stamp}`,
    roleSlug: `employees-write-soft-rollout-${stamp}`,
    roleDescription: 'Rol temporal sin permisos de empleados',
    roleActive: 1,
    roleBusinessAccess: businessUnit.businessUnitSlug,
    roleManagementDays: 10,
  })
  const person = await Person.create({
    personFirstname: 'EmployeesWriteSoftRollout',
    personLastname: 'Test',
    personSecondLastname: emailPrefix,
    personEmail: email,
  })
  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })

  await user.related('businessUnits').attach([businessUnit.businessUnitId])
  return { user, person, businessUnit, role }
}

async function cleanupActor(actor: TenantActor | null) {
  if (!actor) return

  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await RoleSystemPermission.query().where('role_id', actor.role.roleId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await Role.query().where('role_id', actor.role.roleId).delete()
  await BusinessUnit.query().where('business_unit_id', actor.businessUnit.businessUnitId).delete()
}

test.group('Escrituras empleados — PermissionGate soft-rollout', (group) => {
  let employeesModule: SystemModule

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
  })

  group.teardown(async () => {
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
  })

  test('con exigencia apagada, rol sin permiso no recibe PERM.DENIED en POST /api/employees', async ({
    client,
    assert,
  }) => {
    const actor = await createActor('employees-write-soft-rollout')

    try {
      const createPermissionId = await permissionId('employees', 'create')
      const createGrant = await RoleSystemPermission.query()
        .whereNull('role_system_permission_deleted_at')
        .where('role_id', actor.role.roleId)
        .where('system_permission_id', createPermissionId)
        .first()
      assert.isNull(createGrant)

      const response = await client
        .post('/api/employees')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
        .json({ companyId: 1 })

      assert.notEqual(response.status(), 403)
      assert.notEqual(response.body()?.key, 'PERM.DENIED')
      assert.notEqual(response.body()?.key, 'PERM.UNRESOLVED')
    } finally {
      await cleanupActor(actor)
    }
  })
})
