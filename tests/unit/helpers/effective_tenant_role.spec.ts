import { test } from '@japa/runner'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Person from '#models/person'
import Role from '#models/role'
import User from '#models/user'
import {
  applyEffectiveTenantRole,
  resolveEffectiveTenantRole,
} from '#helpers/effective_tenant_role'
import { canAccessBackoffice } from '#helpers/backoffice_access'
import { attachBusinessUnitsWithRole } from '#helpers/attach_business_units_with_role'

/**
 * Rol efectivo por empresa y su consecuencia en el acceso al backoffice.
 *
 * El caso que justifica todo el cambio es el de la cuenta con dos empresas:
 * dueña en una, colaboradora en la otra. Con `users.role_id` único, esa cuenta
 * entraba a las dos con el mismo rol.
 */

const stamp = () => `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

interface Fixture {
  user: User
  person: Person
  units: BusinessUnit[]
  roles: Role[]
}

async function createBusinessUnit(label: string): Promise<BusinessUnit> {
  const token = stamp()
  return BusinessUnit.create({
    businessUnitName: `Efectivo ${label} ${token}`,
    businessUnitSlug: `efectivo-${label}-${token}`,
    businessUnitLegalName: `Efectivo ${label} legal ${token}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

async function createRole(slug: string, businessUnitId: number): Promise<Role> {
  return Role.create({
    roleName: `Rol ${slug} ${stamp()}`,
    roleSlug: slug,
    roleDescription: 'Rol de prueba',
    roleActive: 1,
    businessUnitId,
  })
}

async function createUser(roleId: number): Promise<{ user: User; person: Person }> {
  const token = stamp()
  const person = await Person.create({
    personFirstname: 'Efectivo',
    personLastname: 'Prueba',
    personSecondLastname: token,
    personEmail: `efectivo-${token}@test.local`,
  })
  const user = await User.create({
    userEmail: `efectivo-${token}@test.local`,
    userPassword: 'EfectivoRolPrueba123!',
    userActive: 1,
    roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  return { user, person }
}

async function cleanup(fixture: Fixture): Promise<void> {
  await BusinessUnitUser.query().where('user_id', fixture.user.userId).delete()
  await User.query().where('user_id', fixture.user.userId).delete()
  await Person.query().where('person_id', fixture.person.personId).delete()
  for (const role of fixture.roles) {
    await Role.query().withTrashed().where('role_id', role.roleId).delete()
  }
  for (const unit of fixture.units) {
    await BusinessUnit.query().where('business_unit_id', unit.businessUnitId).delete()
  }
}

test.group('Rol efectivo por empresa', () => {
  test('la misma cuenta resuelve un rol distinto en cada empresa', async ({ assert }) => {
    const unitA = await createBusinessUnit('a')
    const unitB = await createBusinessUnit('b')
    const ownerRole = await createRole('owner', unitA.businessUnitId)
    const employeeRole = await createRole('empleado', unitB.businessUnitId)
    const { user, person } = await createUser(ownerRole.roleId)
    const fixture: Fixture = {
      user,
      person,
      units: [unitA, unitB],
      roles: [ownerRole, employeeRole],
    }

    try {
      await attachBusinessUnitsWithRole(user, [unitA.businessUnitId], ownerRole.roleId)
      await attachBusinessUnitsWithRole(user, [unitB.businessUnitId], employeeRole.roleId)

      const inA = await resolveEffectiveTenantRole(user, unitA.businessUnitId)
      const inB = await resolveEffectiveTenantRole(user, unitB.businessUnitId)

      assert.equal(inA?.roleId, ownerRole.roleId, 'en su empresa es dueña')
      assert.equal(inB?.roleId, employeeRole.roleId, 'en la otra es colaboradora')
    } finally {
      await cleanup(fixture)
    }
  })

  test('sin rol escrito en la membresía devuelve null y manda el respaldo', async ({ assert }) => {
    const unit = await createBusinessUnit('respaldo')
    const role = await createRole('admin', unit.businessUnitId)
    const { user, person } = await createUser(role.roleId)
    const fixture: Fixture = { user, person, units: [unit], roles: [role] }

    try {
      await attachBusinessUnitsWithRole(user, [unit.businessUnitId], null)

      const resolved = await resolveEffectiveTenantRole(user, unit.businessUnitId)

      assert.isNull(resolved, 'un entorno sin backfill sigue operando con users.role_id')
    } finally {
      await cleanup(fixture)
    }
  })

  test('aplicar el rol efectivo no ensucia el modelo de usuario', async ({ assert }) => {
    const unit = await createBusinessUnit('limpio')
    const accountRole = await createRole('empleado', unit.businessUnitId)
    const effectiveRole = await createRole('admin', unit.businessUnitId)
    const { user, person } = await createUser(accountRole.roleId)
    const fixture: Fixture = {
      user,
      person,
      units: [unit],
      roles: [accountRole, effectiveRole],
    }

    try {
      applyEffectiveTenantRole(user, effectiveRole)

      assert.equal(user.roleId, effectiveRole.roleId, 'el runtime ve el rol de la empresa activa')
      assert.equal(user.role.roleSlug, 'admin', 'los guards por slug ven lo mismo')
      assert.isEmpty(
        user.$dirty,
        'un save() posterior no debe persistir el rol de la empresa que se estaba mirando'
      )

      const persisted = await User.findOrFail(user.userId)
      assert.equal(persisted.roleId, accountRole.roleId, 'en la base sigue el rol de la cuenta')
    } finally {
      await cleanup(fixture)
    }
  })
})

test.group('Acceso al backoffice', () => {
  test('la cuenta que es colaboradora en una empresa y admin en otra entra', async ({ assert }) => {
    const unitA = await createBusinessUnit('bo-a')
    const unitB = await createBusinessUnit('bo-b')
    const employeeRole = await createRole('empleado', unitA.businessUnitId)
    const adminRole = await createRole('admin', unitB.businessUnitId)
    const { user, person } = await createUser(employeeRole.roleId)
    const fixture: Fixture = {
      user,
      person,
      units: [unitA, unitB],
      roles: [employeeRole, adminRole],
    }

    try {
      await attachBusinessUnitsWithRole(user, [unitA.businessUnitId], employeeRole.roleId)
      await attachBusinessUnitsWithRole(user, [unitB.businessUnitId], adminRole.roleId)

      assert.isTrue(await canAccessBackoffice(user))
    } finally {
      await cleanup(fixture)
    }
  })

  test('la cuenta que solo es colaboradora queda fuera', async ({ assert }) => {
    const unit = await createBusinessUnit('bo-solo')
    const employeeRole = await createRole('empleado', unit.businessUnitId)
    const { user, person } = await createUser(employeeRole.roleId)
    const fixture: Fixture = { user, person, units: [unit], roles: [employeeRole] }

    try {
      await attachBusinessUnitsWithRole(user, [unit.businessUnitId], employeeRole.roleId)

      assert.isFalse(await canAccessBackoffice(user))
    } finally {
      await cleanup(fixture)
    }
  })

  test('sin rol en la membresía decide el rol de la cuenta', async ({ assert }) => {
    const unit = await createBusinessUnit('bo-respaldo')
    const employeeRole = await createRole('empleado', unit.businessUnitId)
    const { user, person } = await createUser(employeeRole.roleId)
    const fixture: Fixture = { user, person, units: [unit], roles: [employeeRole] }

    try {
      await attachBusinessUnitsWithRole(user, [unit.businessUnitId], null)

      assert.isFalse(await canAccessBackoffice(user))
    } finally {
      await cleanup(fixture)
    }
  })
})
