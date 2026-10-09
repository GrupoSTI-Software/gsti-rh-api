import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import Department from '#models/department'
import Position from '#models/position'
import { attachBusinessUnitsWithRole } from '#helpers/attach_business_units_with_role'

/**
 * VLRH-H1791336042220 — los responsables automáticos del alta son solo de la
 * empresa del colaborador, por el rol que tienen ahí.
 */

const TEST_PASSWORD = 'ResponsablesEmpresa123!'
const stamp = () => `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

type Account = { user: User; person: Person }

test.group('Responsables automáticos del alta — POST /api/employees', () => {
  test('CA-1 y CA-S3 el alta en A no liga al administrador de B', async ({ client, assert }) => {
    const world = await workplace('A')
    const other = await unit('B')
    const adminA = await role('admin', world.unit.businessUnitId, true)
    const adminB = await role('admin', other.businessUnitId, true)
    const userA = await account(adminA.roleId, 'admin-a')
    const userB = await account(adminB.roleId, 'admin-b')
    await attachBusinessUnitsWithRole(userA.user, [world.unit.businessUnitId], adminA.roleId)
    await attachBusinessUnitsWithRole(userB.user, [other.businessUnitId], adminB.roleId)
    const root = await rootActor(world.unit)

    try {
      const created = await hire(client, root, world)
      assert.equal(created.status, 201)
      const ids = await responsibleIds(created.employeeId)
      assert.include(ids, userA.user.userId)
      assert.notInclude(ids, userB.user.userId)

      const consulted = await client
        .get(`/api/v1/employees/${created.employeeId}/access/consulted-by`)
        .loginAs(root.user)
        .header('X-Business-Unit-Id', world.unit.businessUnitPublicId)
      consulted.assertStatus(200)
      const listed = (consulted.body().data.consultedBy as Array<{ userId: number }>).map(
        (row) => row.userId
      )
      assert.include(listed, userA.user.userId)
      assert.notInclude(listed, userB.user.userId)
    } finally {
      await cleanup([world, { unit: other, department: null, position: null }], [userA, userB, root], [
        adminA,
        adminB,
      ])
    }
  })

  test('CA-2 nóminas inactivo, borrado o sin acceso vigente no queda ligado', async ({
    client,
    assert,
  }) => {
    const world = await workplace('A')
    const payroll = await role('nominas', world.unit.businessUnitId, true)
    const inactive = await account(payroll.roleId, 'inactivo')
    const deleted = await account(payroll.roleId, 'borrado')
    const unlinked = await account(payroll.roleId, 'sin-acceso')
    await attachBusinessUnitsWithRole(inactive.user, [world.unit.businessUnitId], payroll.roleId)
    await attachBusinessUnitsWithRole(deleted.user, [world.unit.businessUnitId], payroll.roleId)
    await attachBusinessUnitsWithRole(unlinked.user, [world.unit.businessUnitId], payroll.roleId)
    await db.from('users').where('user_id', inactive.user.userId).update({ user_active: 0 })
    await db.from('users').where('user_id', deleted.user.userId).update({ user_deleted_at: new Date() })
    await db
      .from('business_unit_users')
      .where('user_id', unlinked.user.userId)
      .update({ business_unit_user_deleted_at: new Date() })
    const root = await rootActor(world.unit)

    try {
      const created = await hire(client, root, world)
      assert.equal(created.status, 201)
      const ids = await responsibleIds(created.employeeId)
      assert.notInclude(ids, inactive.user.userId)
      assert.notInclude(ids, deleted.user.userId)
      assert.notInclude(ids, unlinked.user.userId)
    } finally {
      await cleanup([world], [inactive, deleted, unlinked, root], [payroll])
    }
  })

  test('CA-3 el rol de nóminas en A deja solo lectura aunque la cuenta sea admin de B', async ({
    client,
    assert,
  }) => {
    const world = await workplace('A')
    const other = await unit('B')
    const payroll = await role('nominas', world.unit.businessUnitId, true)
    const adminB = await role('admin', other.businessUnitId, true)
    const user = await account(adminB.roleId, 'nomina-a')
    await attachBusinessUnitsWithRole(user.user, [world.unit.businessUnitId], payroll.roleId)
    const root = await rootActor(world.unit)

    try {
      const created = await hire(client, root, world)
      assert.equal(created.status, 201)
      const row = await responsibleRow(created.employeeId, user.user.userId)
      assert.isNotNull(row)
      assert.equal(Number(row?.user_responsible_employee_readonly), 1)
    } finally {
      await cleanup([world, { unit: other, department: null, position: null }], [user, root], [
        payroll,
        adminB,
      ])
    }
  })

  test('CA-4 el rol de la empresa sin esos slugs no liga aunque la cuenta sea admin', async ({
    client,
    assert,
  }) => {
    const world = await workplace('A')
    const adminA = await role('admin', world.unit.businessUnitId, true)
    const plain = await role('colaborador', world.unit.businessUnitId)
    const user = await account(adminA.roleId, 'colaborador-a')
    await attachBusinessUnitsWithRole(user.user, [world.unit.businessUnitId], plain.roleId)
    const root = await rootActor(world.unit)

    try {
      const created = await hire(client, root, world)
      assert.equal(created.status, 201)
      assert.notInclude(await responsibleIds(created.employeeId), user.user.userId)
    } finally {
      await cleanup([world], [user, root], [adminA, plain])
    }
  })

  test('CA-5 el rol de cuenta solo cuenta si es de la empresa o común, y el rol borrado no cae', async ({
    client,
    assert,
  }) => {
    const world = await workplace('A')
    const other = await unit('B')
    const globalRh = await ensureGlobalRole('rh-manager')
    const common = await account(globalRh.role.roleId, 'rh-comun')
    await attachBusinessUnitsWithRole(common.user, [world.unit.businessUnitId], null)

    const adminB = await role('admin', other.businessUnitId, true)
    const foreign = await account(adminB.roleId, 'admin-b')
    await attachBusinessUnitsWithRole(foreign.user, [world.unit.businessUnitId], null)

    const liveRh = await role('rh-manager', world.unit.businessUnitId, true)
    const deletedAdmin = await role('admin', world.unit.businessUnitId, true)
    const broken = await account(liveRh.roleId, 'pivote-rota')
    await attachBusinessUnitsWithRole(broken.user, [world.unit.businessUnitId], deletedAdmin.roleId)
    await deletedAdmin.delete()

    const root = await rootActor(world.unit)

    try {
      const created = await hire(client, root, world)
      assert.equal(created.status, 201)
      const commonRow = await responsibleRow(created.employeeId, common.user.userId)
      assert.isNotNull(commonRow)
      assert.notEqual(Number(commonRow?.user_responsible_employee_readonly), 1)
      assert.notInclude(await responsibleIds(created.employeeId), foreign.user.userId)
      assert.notInclude(await responsibleIds(created.employeeId), broken.user.userId)
    } finally {
      await cleanup(
        [world, { unit: other, department: null, position: null }],
        [common, foreign, broken, root],
        [adminB, liveRh, deletedAdmin],
        globalRh.created ? [globalRh.role] : []
      )
    }
  })

  test('CA-6 el rol admin inactivo y el dueño no quedan ligados', async ({ client, assert }) => {
    const world = await workplace('A')
    const admin = await role('admin', world.unit.businessUnitId, true)
    const ownerRole = await role('owner', world.unit.businessUnitId, true)
    const adminUser = await account(admin.roleId, 'admin-off')
    const owner = await account(ownerRole.roleId, 'owner')
    await attachBusinessUnitsWithRole(adminUser.user, [world.unit.businessUnitId], admin.roleId)
    await attachBusinessUnitsWithRole(owner.user, [world.unit.businessUnitId], ownerRole.roleId)
    await db.from('roles').where('role_id', admin.roleId).update({ role_active: 0 })
    const root = await rootActor(world.unit)

    try {
      const created = await hire(client, root, world)
      assert.equal(created.status, 201)
      const ids = await responsibleIds(created.employeeId)
      assert.notInclude(ids, adminUser.user.userId)
      assert.notInclude(ids, owner.user.userId)
    } finally {
      await cleanup([world], [adminUser, owner, root], [admin, ownerRole])
    }
  })

  test('CA-7 quien hace el alta y ya es admin queda una sola vez', async ({ client, assert }) => {
    const world = await workplace('A')
    const admin = await role('admin', world.unit.businessUnitId, true)
    await grant(admin.roleId, 'employees', 'create')
    await grant(admin.roleId, 'employees', 'sensitive-financiero-write')
    const actor = await account(admin.roleId, 'quien-alta')
    await attachBusinessUnitsWithRole(actor.user, [world.unit.businessUnitId], admin.roleId)

    try {
      const created = await hire(client, actor, world)
      assert.equal(created.status, 201, JSON.stringify(created.body))
      const rows = await db
        .from('user_responsible_employees')
        .where('employee_id', created.employeeId)
        .where('user_id', actor.user.userId)
        .whereNull('user_responsible_employee_deleted_at')
      assert.lengthOf(rows, 1)
    } finally {
      await cleanup([world], [actor], [admin])
    }
  })

  test('CA-8 sin esos roles el alta responde 201 y no deja responsables', async ({
    client,
    assert,
  }) => {
    const world = await workplace('C')
    const root = await rootActor(world.unit)

    try {
      const created = await hire(client, root, world)
      assert.equal(created.status, 201)
      assert.equal(created.body.type, 'success')
      assert.deepEqual(await responsibleIds(created.employeeId), [])
    } finally {
      await cleanup([world], [root], [])
    }
  })
})

interface Workplace {
  unit: BusinessUnit
  department: Department | null
  position: Position | null
}

async function workplace(label: string): Promise<Workplace> {
  const created = await unit(label)
  const token = stamp()
  const department = await Department.create({
    departmentSyncId: Date.now() + Math.floor(Math.random() * 1000),
    departmentCode: `RES-${token}`.slice(0, 50),
    departmentName: `Resp ${label} ${token}`,
    departmentAlias: '',
    departmentIsDefault: false,
    departmentActive: 1,
    businessUnitId: created.businessUnitId,
    companyId: created.businessUnitId,
  })
  const position = await Position.create({
    positionSyncId: Date.now() + Math.floor(Math.random() * 1000),
    positionCode: `RES-${token}`.slice(0, 50),
    positionName: `Resp ${label} ${token}`.slice(0, 100),
    positionActive: 1,
    businessUnitId: created.businessUnitId,
    companyId: created.businessUnitId,
  })
  return { unit: created, department, position }
}

async function unit(label: string): Promise<BusinessUnit> {
  const token = stamp()
  return BusinessUnit.create({
    businessUnitName: `Resp ${label} ${token}`,
    businessUnitSlug: `resp-${label}-${token}`.toLowerCase(),
    businessUnitLegalName: `Resp ${label} ${token}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

async function role(slug: string, businessUnitId: number | null, exact = false): Promise<Role> {
  return Role.create({
    roleName: `Rol ${slug} ${stamp()}`,
    roleSlug: exact ? slug : `${slug}-${stamp()}`.toLowerCase().slice(0, 140),
    roleDescription: 'Rol de responsables automáticos',
    roleActive: 1,
    businessUnitId,
  })
}

async function ensureGlobalRole(slug: string): Promise<{ role: Role; created: boolean }> {
  const existing = await Role.query()
    .where('role_slug', slug)
    .whereNull('business_unit_id')
    .whereNull('role_deleted_at')
    .first()
  if (existing) return { role: existing, created: false }
  const created = await role(slug, null, true)
  return { role: created, created: true }
}

async function account(roleId: number, label: string): Promise<Account> {
  const token = stamp()
  const email = `resp-${label}-${token}@gsti-tests.local`
  const person = await Person.create({
    personFirstname: 'Responsable',
    personLastname: label,
    personSecondLastname: token,
    personEmail: email,
  })
  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  return { user, person }
}

async function rootActor(target: BusinessUnit): Promise<Account> {
  const rootRole = await Role.query().where('role_slug', 'root').whereNull('role_deleted_at').firstOrFail()
  const actor = await account(rootRole.roleId, 'root')
  await actor.user.related('businessUnits').attach([target.businessUnitId])
  return actor
}

async function grant(roleId: number, moduleSlug: string, action: string): Promise<void> {
  const row = await db
    .from('system_permissions as sp')
    .innerJoin('system_modules as sm', 'sm.system_module_id', 'sp.system_module_id')
    .where('sm.system_module_slug', moduleSlug)
    .where('sp.system_permission_slug', action)
    .whereNull('sp.system_permission_deleted_at')
    .select('sp.system_permission_id')
    .first()
  if (!row) throw new Error(`No está sembrado ${moduleSlug}:${action}`)
  const now = new Date()
  await db.table('role_system_permissions').insert({
    role_id: roleId,
    system_permission_id: row.system_permission_id,
    role_system_permission_created_at: now,
    role_system_permission_updated_at: now,
  })
}

async function hire(
  client: ApiClient,
  actor: Account,
  world: Workplace
): Promise<{ status: number; employeeId: number; body: { type?: string } }> {
  const token = stamp()
  const person = await Person.create({
    personFirstname: 'Alta',
    personLastname: 'Responsables',
    personSecondLastname: token,
    personEmail: `alta-resp-${token}@gsti-tests.local`,
    businessUnitId: world.unit.businessUnitId,
  })
  const response = await client
    .post('/api/employees')
    .loginAs(actor.user)
    .header('X-Business-Unit-Id', world.unit.businessUnitPublicId)
    .json({
      employeeFirstName: 'Alta',
      employeeLastName: 'Responsables',
      employeeSecondLastName: 'QA',
      employeeCode: `RES-${token}`,
      employeePayrollNum: `RES-PN-${token}`,
      companyId: world.unit.businessUnitId,
      personId: person.personId,
      employeeTypeId: 1,
      businessUnitId: world.unit.businessUnitId,
      payrollBusinessUnitId: world.unit.businessUnitId,
      employeeWorkSchedule: 'Onsite',
      employeeWorkScheduleHybridConfig: null,
      employeeBusinessEmail: person.personEmail,
      departmentId: world.department?.departmentId,
      positionId: world.position?.positionId,
    })
  const employeeId = Number(response.body()?.data?.employee?.employeeId ?? 0)
  return { status: response.status(), employeeId, body: response.body() }
}

async function responsibleIds(employeeId: number): Promise<number[]> {
  const rows = await db
    .from('user_responsible_employees')
    .where('employee_id', employeeId)
    .whereNull('user_responsible_employee_deleted_at')
  return rows.map((row) => Number(row.user_id))
}

async function responsibleRow(employeeId: number, userId: number) {
  return db
    .from('user_responsible_employees')
    .where('employee_id', employeeId)
    .where('user_id', userId)
    .whereNull('user_responsible_employee_deleted_at')
    .first()
}

async function cleanup(
  places: Workplace[],
  users: Account[],
  roles: Role[],
  extraRoles: Role[] = []
): Promise<void> {
  const unitIds = places.map((place) => place.unit.businessUnitId)
  const employees = await db.from('employees').whereIn('business_unit_id', unitIds).select('employee_id', 'person_id')
  const employeeIds = employees.map((row) => Number(row.employee_id))
  if (employeeIds.length > 0) {
    await db.from('user_responsible_employees').whereIn('employee_id', employeeIds).delete()
    await db.from('employee_offboardings').whereIn('employee_id', employeeIds).delete()
    await db.from('employee_salary_history').whereIn('employee_id', employeeIds).delete()
    await db.from('employees').whereIn('employee_id', employeeIds).delete()
  }
  const personIds = [
    ...users.map((row) => row.person.personId),
    ...employees.map((row) => Number(row.person_id)),
  ]
  const userIds = users.map((row) => row.user.userId)
  if (userIds.length > 0) {
    await db.from('api_tokens').whereIn('tokenable_id', userIds).delete()
    await db.from('business_unit_users').whereIn('user_id', userIds).delete()
    await db.from('users').whereIn('user_id', userIds).delete()
  }
  if (personIds.length > 0) {
    await db.from('people').whereIn('person_id', personIds).delete()
  }
  const roleIds = [...roles, ...extraRoles].map((item) => item.roleId)
  if (roleIds.length > 0) {
    await db.from('role_system_permissions').whereIn('role_id', roleIds).delete()
    await db.from('roles').whereIn('role_id', roleIds).delete()
  }
  for (const place of places) {
    if (place.position) {
      await db.from('positions').where('position_id', place.position.positionId).delete()
    }
    if (place.department) {
      await db.from('departments').where('department_id', place.department.departmentId).delete()
    }
    await db.from('business_units').where('business_unit_id', place.unit.businessUnitId).delete()
  }
}
