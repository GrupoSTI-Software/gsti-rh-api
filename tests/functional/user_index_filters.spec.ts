import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import i18nManager from '@adonisjs/i18n/services/main'
import db from '@adonisjs/lucid/services/db'
import Department from '#models/department'
import Person from '#models/person'
import Position from '#models/position'
import Role from '#models/role'
import User from '#models/user'
import UserService from '#services/user_service'
import { TenantContext } from '#utils/tenant_context'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { USER_VALIDATION_ERROR_CODES } from '#constants/user_validation_error_codes'
import { attachBusinessUnitsWithRole } from '#helpers/attach_business_units_with_role'
import { createEmployeeFixture, type EmployeeFixture } from '#tests/helpers/employee_fixture'
import { cleanupOrgChartFixtures } from '#tests/helpers/org_chart_fixtures'
import { cleanupTenantActor, createBypassActor, type TenantActor } from '#tests/helpers/tenant_actor'
import type { UserFilterSearchInterface } from '../../app/interfaces/user_filter_search_interface.js'

/**
 * Listado de usuarios para la pantalla rediseñada (`GET /api/users`,
 * VLRH-H1791581963402): precarga del empleado con departamento y puesto,
 * estatus de acceso, orden por nombre y búsqueda por número de empleado.
 *
 * Los tres usuarios del spec cubren los tres estatus. Los prefijos de las
 * personas (`a-`, `b-`, `c-`) fijan el orden alfabético esperado.
 */

const stamp = (): string => `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

type AccessKind = 'active' | 'suspended' | 'pending'

interface ListedUser {
  fixture: EmployeeFixture
  user: User
}

/** Forma exacta del empleado precargado: solo las columnas que pinta el listado. */
interface SerializedEmployee {
  employeeId: number
  personId: number
  employeeCode: string
  employeeBusinessEmail: string
  departmentId: number
  positionId: number
  department: { departmentId: number; departmentName: string }
  position: { positionId: number; positionName: string }
}

interface SerializedUser {
  userId: number
  person: { employee: SerializedEmployee | null }
}

/** Acota un dato del `setup` que los casos ya dan por creado. */
function required<T>(value: T | null, label: string): T {
  if (value === null) throw new Error(`El setup no dejó "${label}" disponible.`)
  return value
}

function userService(): UserService {
  return new UserService(i18nManager.locale(i18nManager.defaultLocale))
}

test.group('Usuarios — listado con empleado, estatus y orden', (group) => {
  let actor: TenantActor | null = null
  const listed: Partial<Record<AccessKind, ListedUser>> = {}

  const unitId = (): number => required(actor, 'actor').businessUnit.businessUnitId
  const pick = (kind: AccessKind): ListedUser => required(listed[kind] ?? null, kind)

  /** Ids del spec que devuelve el servicio, en el orden en que llegan. */
  async function listIds(overrides: Partial<UserFilterSearchInterface>): Promise<number[]> {
    const filters: UserFilterSearchInterface = {
      search: '',
      roleId: 0,
      businessUnitId: unitId(),
      page: 1,
      limit: 100,
      ...overrides,
    }
    const page = await TenantContext.run([unitId()], () => userService().index(filters, [unitId()]))
    const own = new Set(Object.values(listed).map((entry) => entry.user.userId))
    return page
      .all()
      .map((user) => user.userId)
      .filter((userId) => own.has(userId))
  }

  group.setup(async () => {
    actor = await createBypassActor('owner', `usr-idx-${stamp()}`)
    const suffix = stamp()
    // El listado solo alcanza roles de la empresa activa: uno global no aparece.
    const role = await Role.create({
      roleName: `Usuarios listado ${suffix}`,
      roleSlug: `usr-idx-${suffix}`,
      roleDescription: 'Rol temporal del spec del listado de usuarios',
      roleActive: 1,
      roleManagementDays: 10,
      businessUnitId: unitId(),
    })
    const plan: Array<[AccessKind, string, number, DateTime | null]> = [
      ['active', `a-${suffix}`, 1, DateTime.utc()],
      ['suspended', `b-${suffix}`, 0, DateTime.utc()],
      ['pending', `c-${suffix}`, 1, null],
    ]

    for (const [kind, prefix, userActive, userPasswordSetAt] of plan) {
      const fixture = await createEmployeeFixture(unitId(), prefix)
      const user = await User.create({
        userEmail: `usr-idx-${kind}-${suffix}@gsti-tests.local`,
        userPassword: 'UserIndexFilters123!',
        userActive,
        roleId: role.roleId,
        personId: fixture.person.personId,
        userEmailType: 'institutional',
        userPasswordSetAt,
      })
      await attachBusinessUnitsWithRole(user, [unitId()], role.roleId)
      listed[kind] = { fixture, user }
    }
  })

  group.teardown(async () => {
    const entries = Object.values(listed)
    const userIds = entries.map((entry) => entry.user.userId)
    if (userIds.length > 0) {
      await db.from('business_unit_users').whereIn('user_id', userIds).delete()
      await db.from('users').whereIn('user_id', userIds).delete()
    }
    // Primero todos los empleados y después el organigrama, que es por unidad
    // completa: borrarlo con un empleado vivo choca con su llave foránea.
    for (const entry of entries) {
      await db.from('employees').where('employee_id', entry.fixture.employee.employeeId).delete()
      await Person.query().where('person_id', entry.fixture.person.personId).delete()
    }
    if (actor) await cleanupOrgChartFixtures(actor.businessUnit.businessUnitId)
    await cleanupTenantActor(actor)
  })

  test('sin filtros nuevos lista a los tres usuarios en orden de user_id', async ({ assert }) => {
    const ids = await listIds({})

    assert.deepEqual(
      ids,
      [pick('active'), pick('suspended'), pick('pending')].map((entry) => entry.user.userId)
    )
  })

  test('accessStatus=all equivale a no enviarlo', async ({ assert }) => {
    assert.deepEqual(await listIds({ accessStatus: 'all' }), await listIds({}))
  })

  test('accessStatus=active deja solo la cuenta activa con contraseña', async ({ assert }) => {
    assert.deepEqual(await listIds({ accessStatus: 'active' }), [pick('active').user.userId])
  })

  test('accessStatus=suspended deja solo la cuenta inactiva con contraseña', async ({ assert }) => {
    assert.deepEqual(await listIds({ accessStatus: 'suspended' }), [pick('suspended').user.userId])
  })

  test('accessStatus=pending deja solo la invitación sin aceptar', async ({ assert }) => {
    assert.deepEqual(await listIds({ accessStatus: 'pending' }), [pick('pending').user.userId])
  })

  test('pending no mira user_active: una invitación desactivada sigue pendiente', async ({
    assert,
  }) => {
    const pending = pick('pending').user
    await db.from('users').where('user_id', pending.userId).update({ user_active: 0 })

    try {
      assert.deepEqual(await listIds({ accessStatus: 'pending' }), [pending.userId])
      assert.notInclude(await listIds({ accessStatus: 'suspended' }), pending.userId)
    } finally {
      await db.from('users').where('user_id', pending.userId).update({ user_active: 1 })
    }
  })

  test('sort=name_asc y name_desc ordenan por nombre completo de la persona', async ({
    assert,
  }) => {
    const ascending = [pick('active'), pick('suspended'), pick('pending')].map(
      (entry) => entry.user.userId
    )

    assert.deepEqual(await listIds({ sort: 'name_asc' }), ascending)
    assert.deepEqual(await listIds({ sort: 'name_desc' }), [...ascending].reverse())
  })

  test('search encuentra por número de empleado, exacto y por prefijo', async ({ assert }) => {
    const code = String(pick('suspended').fixture.employee.employeeCode)

    assert.deepEqual(await listIds({ search: code }), [pick('suspended').user.userId])
    assert.deepEqual(await listIds({ search: code.slice(0, -2) }), [pick('suspended').user.userId])
    assert.deepEqual(await listIds({ search: code.toLowerCase() }), [pick('suspended').user.userId])
  })

  test('la búsqueda por código no se salta los demás filtros', async ({ assert }) => {
    const code = String(pick('suspended').fixture.employee.employeeCode)

    assert.isEmpty(await listIds({ search: code, accessStatus: 'active' }))
  })

  test('el comodín de LIKE en el search no se toma como patrón del código', async ({ assert }) => {
    const code = String(pick('active').fixture.employee.employeeCode)

    assert.isEmpty(await listIds({ search: `${code.slice(0, 4)}%${code.slice(-3)}` }))
  })

  test('cada usuario trae su empleado con departamento y puesto', async ({ assert }) => {
    const filters: UserFilterSearchInterface = {
      search: '',
      roleId: 0,
      businessUnitId: unitId(),
      page: 1,
      limit: 100,
    }
    const page = await TenantContext.run([unitId()], () => userService().index(filters, [unitId()]))
    const target = pick('active')
    const serialized = page
      .all()
      .find((user) => user.userId === target.user.userId)
      ?.serialize() as SerializedUser | undefined
    const employee = required(serialized?.person.employee ?? null, 'employee serializado')
    const [department, position] = await TenantContext.runUnscoped(
      () =>
        Promise.all([
          Department.findOrFail(target.fixture.employee.departmentId),
          Position.findOrFail(target.fixture.employee.positionId),
        ]),
      TENANT_UNSCOPED_REASON.TEST_FIXTURE
    )

    const expected: SerializedEmployee = {
      employeeId: target.fixture.employee.employeeId,
      personId: target.fixture.person.personId,
      employeeCode: String(target.fixture.employee.employeeCode),
      employeeBusinessEmail: target.fixture.employee.employeeBusinessEmail,
      departmentId: department.departmentId,
      positionId: position.positionId,
      department: { departmentId: department.departmentId, departmentName: department.departmentName },
      position: { positionId: position.positionId, positionName: position.positionName },
    }

    assert.deepEqual(employee, expected)
  })
})

test.group('Usuarios — validación de filtros del listado', (group) => {
  let actor: TenantActor | null = null

  group.setup(async () => {
    actor = await createBypassActor('owner', `usr-idx-val-${stamp()}`)
  })

  group.teardown(async () => {
    await cleanupTenantActor(actor)
  })

  for (const [field, value] of [
    ['accessStatus', 'blocked'],
    ['sort', 'email_asc'],
  ] as const) {
    test(`${field} fuera del catálogo responde 422 con título, detalle y key`, async ({
      client,
      assert,
    }) => {
      const current = required(actor, 'actor')
      const response = await client
        .get('/api/users')
        .qs({ businessUnitId: current.businessUnit.businessUnitId, [field]: value })
        .loginAs(current.user)
        .headers({ 'X-Business-Unit-Id': current.businessUnit.businessUnitPublicId })

      response.assertStatus(422)
      const body = response.body() as Record<string, unknown>
      assert.equal(body.key, 'filtros-de-usuarios-invalidos')
      assert.equal(body.code, USER_VALIDATION_ERROR_CODES.LIST_FILTERS_INVALID)
      assert.isString(body.title)
      assert.isString(body.detail)
    })
  }

  test('con valores válidos responde 200', async ({ client }) => {
    const current = required(actor, 'actor')
    const response = await client
      .get('/api/users')
      .qs({
        businessUnitId: current.businessUnit.businessUnitId,
        accessStatus: 'active',
        sort: 'name_desc',
      })
      .loginAs(current.user)
      .headers({ 'X-Business-Unit-Id': current.businessUnit.businessUnitPublicId })

    response.assertStatus(200)
  })
})
