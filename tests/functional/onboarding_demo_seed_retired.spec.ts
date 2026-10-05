import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Person from '#models/person'
import Role from '#models/role'
import User from '#models/user'

/**
 * USRH1789079078168 — CA-01, RN-01, S1. Las 3 rutas de la siembra demo del
 * onboarding se retiraron del router (`git mv` + import quitado de
 * `start/routes.ts`): ya no existen, así que responden 404 tanto con sesión
 * válida como anónimas — el router no hace match antes de `auth` (A7 del
 * spec: no se afirma el body, solo el código y que nada cambió en la BD).
 */

const RETIRED_ROUTES = [
  '/api/onboarding/me/demo-seed',
  '/api/onboarding/me/demo-seed/credentials',
  '/api/onboarding/me/demo-seed/wipe',
] as const

/**
 * `users` es global (sin `business_unit_id` propio): "usuarios de esa
 * empresa" se lee por su membresía viva en `business_unit_users`, la misma
 * tabla cuyo conteo de filas se compara aparte.
 */
async function countRow(businessUnitId: number) {
  const [departments, positions, employees, users, businessUnitUsers] = await Promise.all([
    db.from('departments').where('business_unit_id', businessUnitId).count('* as total').first(),
    db.from('positions').where('business_unit_id', businessUnitId).count('* as total').first(),
    db.from('employees').where('business_unit_id', businessUnitId).count('* as total').first(),
    db
      .from('business_unit_users')
      .where('business_unit_id', businessUnitId)
      .countDistinct('user_id as total')
      .first(),
    db
      .from('business_unit_users')
      .where('business_unit_id', businessUnitId)
      .count('* as total')
      .first(),
  ])
  return {
    departments: Number(departments?.total ?? 0),
    positions: Number(positions?.total ?? 0),
    employees: Number(employees?.total ?? 0),
    users: Number(users?.total ?? 0),
    businessUnitUsers: Number(businessUnitUsers?.total ?? 0),
  }
}

test.group('Rutas retiradas de la siembra demo del onboarding (USRH1789079078168)', (group) => {
  let businessUnit: BusinessUnit
  let role: Role
  let person: Person
  let user: User
  let businessUnitId: number
  let publicId: string

  group.setup(async () => {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
    businessUnit = await BusinessUnit.create({
      businessUnitName: `Demo retirada ${stamp}`,
      businessUnitSlug: `demo-retirada-${stamp}`,
      businessUnitLegalName: `Demo retirada Legal ${stamp}`,
      businessUnitActive: 1,
    })
    businessUnitId = businessUnit.businessUnitId
    publicId = String(businessUnit.businessUnitPublicId)

    role = await Role.create({
      roleName: `Demo retirada ${stamp}`,
      roleSlug: `demo-retirada-${stamp}`,
      roleDescription: 'Rol temporal para USRH1789079078168',
      roleActive: 1,
      businessUnitId,
      roleManagementDays: 10,
    })

    person = await Person.create({
      personFirstname: 'DemoRetirada',
      personLastname: 'Test',
      personSecondLastname: stamp,
    })

    user = await User.create({
      userEmail: `demo-retirada-${stamp}@gsti-tests.local`,
      userPassword: 'DemoRetiradaTest123!',
      userActive: 1,
      roleId: role.roleId,
      personId: person.personId,
      userEmailType: 'institutional',
    })

    await user.related('businessUnits').attach([businessUnitId])
  })

  group.teardown(async () => {
    await BusinessUnitUser.query().where('user_id', user.userId).delete()
    await User.query().where('user_id', user.userId).delete()
    await Person.query().where('person_id', person.personId).delete()
    await Role.query().where('role_id', role.roleId).delete()
    await BusinessUnit.query().where('business_unit_id', businessUnitId).delete()
  })

  for (const path of RETIRED_ROUTES) {
    test(`POST ${path} con sesión y BU válidas responde 404 y no crea ni borra nada`, async ({
      client,
      assert,
    }) => {
      const before = await countRow(businessUnitId)

      const response = await client.post(path).loginAs(user).header('X-Business-Unit-Id', publicId)

      assert.equal(response.status(), 404)

      const after = await countRow(businessUnitId)
      assert.deepEqual(after, before)
    })

    test(`POST ${path} anónima también responde 404 (el router no hace match antes de auth)`, async ({
      client,
      assert,
    }) => {
      const response = await client.post(path)
      assert.equal(response.status(), 404)
    })
  }
})
