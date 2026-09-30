import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import RoleSystemPermission from '#models/role_system_permission'
import SystemPermission from '#models/system_permission'

/**
 * USRH1790276646847 — las seis rutas legacy sin tenant context ya no están
 * registradas. Con manage-biotime y unidad activa la respuesta debe ser 404
 * de ruteo (no 403 de PermissionGate).
 */

const TEST_PASSWORD = 'BiometricLegacyRetired123!'

const RETIRED_POST_ROUTES = [
  '/api/verify-face',
  '/api/synchronization/departments',
  '/api/synchronization/positions',
  '/api/synchronization/employees',
  '/api/synchronization/shift',
  '/api/synchronization/by-selection/employees',
] as const

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
    .firstOrFail()

  return permission.systemPermissionId
}

async function createActor(): Promise<TenantActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `biometric-legacy-retired-${stamp}@gsti-tests.local`
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Biometric Legacy Retired ${stamp}`,
    businessUnitSlug: `biometric-legacy-retired-${stamp}`,
    businessUnitLegalName: `Biometric Legacy Retired Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const role = await Role.create({
    roleName: `Biometric Legacy Retired ${stamp}`,
    roleSlug: `biometric-legacy-retired-${stamp}`,
    roleDescription: 'Rol temporal con manage-biotime',
    roleActive: 1,
    businessUnitId: businessUnit.businessUnitId,
    roleManagementDays: 10,
  })
  const person = await Person.create({
    personFirstname: 'BiometricLegacy',
    personLastname: 'Retired',
    personSecondLastname: stamp,
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
  await RoleSystemPermission.create({
    roleId: role.roleId,
    systemPermissionId: await permissionId('employees', 'manage-biotime'),
  })

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

test.group('Rutas biométricas legacy retiradas — 404 de ruteo (USRH1790276646847)', (group) => {
  let actor: TenantActor | null = null

  group.setup(async () => {
    actor = await createActor()
  })

  group.teardown(async () => {
    await cleanupActor(actor)
  })

  for (const route of RETIRED_POST_ROUTES) {
    test(`POST ${route} responde 404 con manage-biotime y unidad activa`, async ({ client }) => {
      const response = await client
        .post(route)
        .loginAs(actor!.user)
        .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
        .json({})

      response.assertStatus(404)
    })
  }
})
