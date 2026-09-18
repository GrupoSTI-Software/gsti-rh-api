import { test } from '@japa/runner'
import ace from '@adonisjs/core/services/ace'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Person from '#models/person'
import Role from '#models/role'
import RoleSystemPermission from '#models/role_system_permission'
import SystemPermission from '#models/system_permission'
import User from '#models/user'
import BackfillTenantRoles from '../../commands/backfill_tenant_roles.js'

/**
 * El caso que decide si el backfill se puede correr en producción: un rol
 * heredado que dos clientes comparten por el CSV `role_business_access`.
 *
 * Un rol no puede tener dos dueños, y ninguna de las dos empresas puede perder
 * el acceso que ya tenía. La única salida correcta es una copia por empresa,
 * con sus permisos, y cada cuenta apuntando a la copia de SU empresa.
 */

const stamp = () => `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

interface Fixture {
  units: BusinessUnit[]
  sharedRole: Role
  users: User[]
  people: Person[]
}

async function createUnit(label: string): Promise<BusinessUnit> {
  const token = stamp()
  return BusinessUnit.create({
    businessUnitName: `Backfill ${label} ${token}`,
    businessUnitSlug: `backfill-${label}-${token}`,
    businessUnitLegalName: `Backfill ${label} legal ${token}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

async function createUserIn(unit: BusinessUnit, role: Role): Promise<{ user: User; person: Person }> {
  const token = stamp()
  const person = await Person.create({
    personFirstname: 'Backfill',
    personLastname: 'Compartido',
    personSecondLastname: token,
    personEmail: `backfill-${token}@test.local`,
  })
  const user = await User.create({
    userEmail: `backfill-${token}@test.local`,
    userPassword: 'BackfillRolesPrueba123!',
    userActive: 1,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  await BusinessUnitUser.create({ businessUnitId: unit.businessUnitId, userId: user.userId })
  return { user, person }
}

async function cleanup(fixture: Fixture): Promise<void> {
  for (const user of fixture.users) {
    await BusinessUnitUser.query().where('user_id', user.userId).delete()
    await User.query().where('user_id', user.userId).delete()
  }
  for (const person of fixture.people) {
    await Person.query().where('person_id', person.personId).delete()
  }

  const unitIds = fixture.units.map((unit) => unit.businessUnitId)
  const roles = await Role.query().withTrashed().whereIn('business_unit_id', unitIds)
  const roleIds = [...roles.map((role) => role.roleId), fixture.sharedRole.roleId]
  await RoleSystemPermission.query().whereIn('role_id', roleIds).delete()
  await Role.query().withTrashed().whereIn('business_unit_id', unitIds).delete()
  await Role.query().withTrashed().where('role_id', fixture.sharedRole.roleId).delete()
  await BusinessUnit.query().whereIn('business_unit_id', unitIds).delete()
}

test.group('backfill:tenant-roles — rol heredado compartido por dos empresas', () => {
  test('cada empresa recibe su copia y cada cuenta apunta a la suya', async ({ assert }) => {
    const unitA = await createUnit('a')
    const unitB = await createUnit('b')

    const sharedRole = await Role.create({
      roleName: `Supervisor compartido ${stamp()}`,
      roleSlug: `supervisor-compartido-${stamp()}`,
      roleDescription: 'Rol heredado que dos empresas comparten por CSV',
      roleActive: 1,
      businessUnitId: null,
      roleBusinessAccess: `${unitA.businessUnitSlug},${unitB.businessUnitSlug}`,
    })

    const permission = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .firstOrFail()
    await RoleSystemPermission.create({
      roleId: sharedRole.roleId,
      systemPermissionId: permission.systemPermissionId,
    })

    const inA = await createUserIn(unitA, sharedRole)
    const inB = await createUserIn(unitB, sharedRole)

    const fixture: Fixture = {
      units: [unitA, unitB],
      sharedRole,
      users: [inA.user, inB.user],
      people: [inA.person, inB.person],
    }

    try {
      const command = await ace.create(BackfillTenantRoles, [])
      await command.exec()

      const copyInA = await Role.query()
        .whereNull('role_deleted_at')
        .where('role_slug', sharedRole.roleSlug)
        .where('business_unit_id', unitA.businessUnitId)
        .first()
      const copyInB = await Role.query()
        .whereNull('role_deleted_at')
        .where('role_slug', sharedRole.roleSlug)
        .where('business_unit_id', unitB.businessUnitId)
        .first()

      assert.isNotNull(copyInA, 'la empresa A conserva el rol como copia propia')
      assert.isNotNull(copyInB, 'la empresa B conserva el rol como copia propia')
      assert.notEqual(copyInA!.roleId, copyInB!.roleId, 'son dos roles distintos, uno por empresa')

      const grantsInA = await RoleSystemPermission.query().where('role_id', copyInA!.roleId)
      assert.lengthOf(grantsInA, 1, 'la copia se lleva los permisos del original')

      const membershipA = await BusinessUnitUser.query()
        .where('user_id', inA.user.userId)
        .where('business_unit_id', unitA.businessUnitId)
        .firstOrFail()
      const membershipB = await BusinessUnitUser.query()
        .where('user_id', inB.user.userId)
        .where('business_unit_id', unitB.businessUnitId)
        .firstOrFail()

      assert.equal(membershipA.roleId, copyInA!.roleId, 'la cuenta de A queda en la copia de A')
      assert.equal(membershipB.roleId, copyInB!.roleId, 'la cuenta de B queda en la copia de B')

      const original = await Role.query()
        .withTrashed()
        .where('role_id', sharedRole.roleId)
        .firstOrFail()
      assert.isNotNull(original.deletedAt, 'el rol sin dueño se retira una vez repartido')
    } finally {
      await cleanup(fixture)
    }
  })
})
