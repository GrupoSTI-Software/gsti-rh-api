import { test } from '@japa/runner'
import i18nManager from '@adonisjs/i18n/services/main'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import Person from '#models/person'
import User from '#models/user'
import EmployeeService from '#services/employee_service'
import UserService from '#services/user_service'
import { TenantContext } from '#utils/tenant_context'
import { ensureRole } from '#tests/helpers/ensure_role'
import { createEmployeeFixture, type EmployeeFixture } from '#tests/helpers/employee_fixture'
import { cleanupOrgChartFixtures } from '#tests/helpers/org_chart_fixtures'
import type { EmployeeFilterSearchInterface } from '../../app/interfaces/employee_filter_search_interface.js'

/**
 * Catálogo de empleados sin usuario (`GET /api/employees/without-user`), que
 * alimenta el selector del alta de usuarios.
 *
 * La exclusión se mide con la misma regla que el listado de usuarios: una
 * cuenta cuenta para la empresa solo si está ligada a ella en
 * `business_unit_users`. Antes se medía contra todas las cuentas del sistema,
 * así que una cuenta de otra empresa dejaba al colaborador fuera del catálogo
 * sin que nadie pudiera verla ni corregirla desde la pantalla.
 *
 * El contrapeso de ese cambio vive en `UserService.verifyInfoExist`: una
 * persona tiene una sola cuenta, y a las demás empresas entra por la pivote.
 */

const stamp = (): string => `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

const FILTERS = { search: '', page: 1, limit: 100 } as EmployeeFilterSearchInterface

function employeeService(): EmployeeService {
  return new EmployeeService(i18nManager.locale(i18nManager.defaultLocale))
}

function userService(): UserService {
  return new UserService(i18nManager.locale(i18nManager.defaultLocale))
}

/** Códigos que el catálogo ofrece para un alcance, con el tenant activo. */
async function codesWithoutUser(scope: number[]): Promise<string[]> {
  const page = await TenantContext.run(scope, () =>
    employeeService().indexWithOutUser(FILTERS, scope)
  )
  return page.all().map((employee) => String(employee.employeeCode))
}

/** Acota un dato del `setup` que los casos ya dan por creado. */
function required<T>(value: T | null, label: string): T {
  if (value === null) throw new Error(`El setup no dejó "${label}" disponible.`)
  return value
}

const unitId = (unit: BusinessUnit | null): number => required(unit, 'unidad').businessUnitId
const code = (fixture: EmployeeFixture | null): string =>
  String(required(fixture, 'empleado').employee.employeeCode)
const personId = (fixture: EmployeeFixture | null): number =>
  required(fixture, 'empleado').person.personId

async function createUnit(label: string): Promise<BusinessUnit> {
  const suffix = stamp()
  return BusinessUnit.create({
    businessUnitName: `WithoutUser ${label} ${suffix}`,
    businessUnitSlug: `without-user-${label}-${suffix}`,
    businessUnitLegalName: `WithoutUser ${label} legal ${suffix}`,
    businessUnitActive: 1,
  })
}

test.group('Empleados sin usuario — alcance por empresa', (group) => {
  // Nulos al arrancar: si el `setup` falla a medias, el `teardown` corre igual
  // y tiene que poder limpiar lo que sí alcanzó a crearse.
  let homeUnit: BusinessUnit | null = null
  let otherUnit: BusinessUnit | null = null
  let freeEmployee: EmployeeFixture | null = null
  let takenEmployee: EmployeeFixture | null = null
  let accountElsewhere: User | null = null

  group.setup(async () => {
    homeUnit = await createUnit('home')
    otherUnit = await createUnit('other')

    freeEmployee = await createEmployeeFixture(homeUnit.businessUnitId, `free-${stamp()}`)
    takenEmployee = await createEmployeeFixture(homeUnit.businessUnitId, `taken-${stamp()}`)

    const role = await ensureRole('empleado')
    accountElsewhere = await User.create({
      userEmail: `without-user-${stamp()}@gsti-tests.local`,
      userPassword: 'WithoutUser123!',
      userActive: 1,
      roleId: role.roleId,
      personId: personId(takenEmployee),
      userEmailType: 'institutional',
    })
    await accountElsewhere.related('businessUnits').attach([otherUnit.businessUnitId])
  })

  group.teardown(async () => {
    if (accountElsewhere) {
      await db.from('business_unit_users').where('user_id', accountElsewhere.userId).delete()
      await db.from('users').where('user_id', accountElsewhere.userId).delete()
    }
    for (const fixture of [freeEmployee, takenEmployee]) {
      if (!fixture) continue
      await db.from('employees').where('employee_id', fixture.employee.employeeId).delete()
      await Person.query().where('person_id', fixture.person.personId).delete()
    }
    if (homeUnit) {
      await cleanupOrgChartFixtures(homeUnit.businessUnitId)
    }
    const unitIds = [homeUnit, otherUnit]
      .filter((unit): unit is BusinessUnit => unit !== null)
      .map((unit) => unit.businessUnitId)
    if (unitIds.length > 0) {
      await db.from('business_units').whereIn('business_unit_id', unitIds).delete()
    }
  })

  test('una cuenta que vive en otra empresa no saca al colaborador del catálogo', async ({
    assert,
  }) => {
    const codes = await codesWithoutUser([unitId(homeUnit)])

    assert.includeMembers(codes, [code(freeEmployee), code(takenEmployee)])
  })

  test('la cuenta ligada a la empresa sí lo saca del catálogo', async ({ assert }) => {
    const account = required(accountElsewhere, 'accountElsewhere')
    const home = unitId(homeUnit)
    await account.related('businessUnits').attach([home])

    try {
      const codes = await codesWithoutUser([home])

      assert.include(codes, code(freeEmployee))
      assert.notInclude(codes, code(takenEmployee))
    } finally {
      await db
        .from('business_unit_users')
        .where('user_id', account.userId)
        .where('business_unit_id', home)
        .delete()
    }
  })

  test('sin empresa en el alcance no hay catálogo que ofrecer', async ({ assert }) => {
    const codes = await codesWithoutUser([])

    assert.isEmpty(codes)
  })

  test('el alta rechaza una segunda cuenta para una persona que ya tiene', async ({ assert }) => {
    const result = await userService().verifyInfoExist({
      personId: personId(takenEmployee),
    } as User)

    assert.equal(result.status, 400)
    assert.equal(result.key, 'persona-ya-tiene-cuenta')
  })

  test('una persona sin cuenta pasa la validación del alta', async ({ assert }) => {
    const result = await userService().verifyInfoExist({
      personId: personId(freeEmployee),
    } as User)

    assert.equal(result.status, 200)
  })
})
