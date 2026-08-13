import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import RoleDepartment from '#models/role_department'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'

const TEST_PASSWORD = 'EmployeesListadoPermissionGate123!'

interface TenantActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
  role: Role
}

interface SystemActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
  roleId: number
}

interface EmployeeFixture {
  employee: Employee
  person: Person
  departmentId: number
  positionId: number
  ownsPerson: boolean
}

async function permissionId(permissionSlug: string): Promise<number> {
  const permission = await SystemPermission.query()
    .whereNull('system_permission_deleted_at')
    .where('system_permission_slug', permissionSlug)
    .whereHas('systemModule', (query) =>
      query.whereNull('system_module_deleted_at').where('system_module_slug', 'employees')
    )
    .first()

  if (!permission) {
    throw new Error(`Se requiere el permiso "employees:${permissionSlug}" en BD para este test.`)
  }

  return permission.systemPermissionId
}

async function grantOnly(roleId: number, permissionSlugs: string[]) {
  await RoleSystemPermission.query().where('role_id', roleId).delete()
  for (const slug of permissionSlugs) {
    await RoleSystemPermission.create({ roleId, systemPermissionId: await permissionId(slug) })
  }
}

async function createActor(emailPrefix: string): Promise<TenantActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Listado ${stamp}`,
    businessUnitSlug: `listado-${stamp}`,
    businessUnitLegalName: `Listado legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const role = await Role.create({
    roleName: `Listado ${stamp}`,
    roleSlug: `listado-${stamp}`,
    roleDescription: 'Rol temporal sin permisos de listado',
    roleActive: 1,
    roleBusinessAccess: businessUnit.businessUnitSlug,
    roleManagementDays: 10,
  })
  const person = await Person.create({
    personFirstname: 'Listado',
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
  await RoleDepartment.query().where('role_id', actor.role.roleId).delete()
  await RoleSystemPermission.query().where('role_id', actor.role.roleId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await Role.query().where('role_id', actor.role.roleId).delete()
  await BusinessUnit.query().where('business_unit_id', actor.businessUnit.businessUnitId).delete()
}

async function createSystemActor(
  roleSlug: string,
  emailPrefix: string,
  businessUnitId: number
): Promise<SystemActor> {
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', roleSlug).firstOrFail()
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const person = await Person.create({
    personFirstname: 'Listado',
    personLastname: 'Sistema',
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

  await user.related('businessUnits').attach([businessUnitId])
  const businessUnit = await BusinessUnit.findOrFail(businessUnitId)
  return { user, person, roleId: role.roleId, businessUnit }
}

async function cleanupSystemActor(actor: SystemActor | null) {
  if (!actor) return
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

async function activeEmployeesGrants(roleId: number) {
  return RoleSystemPermission.query()
    .where('role_id', roleId)
    .whereNull('role_system_permission_deleted_at')
    .whereHas('systemPermissions', (permissionQuery) =>
      permissionQuery
        .whereNull('system_permission_deleted_at')
        .whereHas('systemModule', (moduleQuery) =>
          moduleQuery.whereNull('system_module_deleted_at').where('system_module_slug', 'employees')
        )
    )
}

async function snapshotAndClearEmployeesGrants(roleId: number) {
  const grants = await activeEmployeesGrants(roleId)
  for (const grant of grants) await grant.delete()
  return grants
}

async function restoreEmployeesGrants(grants: RoleSystemPermission[]) {
  for (const grant of grants) await grant.restore()
}

async function createEmployeeFixture(
  businessUnitId: number,
  prefix: string,
  person?: Person
): Promise<EmployeeFixture> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const now = new Date()
  const employeePerson =
    person ??
    (await Person.create({
      personFirstname: 'Empleado',
      personLastname: 'Listado',
      personSecondLastname: prefix,
      personEmail: `employee-${prefix}-${stamp}@gsti-tests.local`,
    }))
  const departmentInsert = await db.table('departments').insert({
    department_sync_id: stamp,
    department_code: `DEP-${stamp}`,
    department_name: `Departamento ${prefix}`,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    department_active: 1,
    department_created_at: now,
  })
  const positionInsert = await db.table('positions').insert({
    position_sync_id: stamp,
    position_code: `POS-${stamp}`,
    position_name: `Puesto ${prefix}`,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    position_active: 1,
    position_created_at: now,
  })
  const employeeInsert = await db.table('employees').insert({
    employee_sync_id: `EMP-${stamp}`,
    employee_code: `EMP-${stamp}`,
    employee_first_name: 'Empleado',
    employee_last_name: 'Listado',
    employee_second_last_name: prefix,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    department_id: Number(departmentInsert[0]),
    position_id: Number(positionInsert[0]),
    person_id: employeePerson.personId,
    employee_type_id: 1,
    employee_work_schedule: 'Onsite',
    employee_business_email: `employee-work-${prefix}-${stamp}@gsti-tests.local`,
    employee_created_at: now,
  })

  return {
    employee: await Employee.findOrFail(Number(employeeInsert[0])),
    person: employeePerson,
    departmentId: Number(departmentInsert[0]),
    positionId: Number(positionInsert[0]),
    ownsPerson: Boolean(person),
  }
}

async function cleanupEmployeeFixture(fixture: EmployeeFixture | null) {
  if (!fixture) return
  const employeeId = fixture.employee.employeeId
  await db.from('employee_annotations').where('employee_id', employeeId).delete()
  await db.from('employee_banks').where('employee_id', employeeId).delete()
  await db.from('employee_medical_conditions').where('employee_id', employeeId).delete()
  await Employee.query().where('employee_id', employeeId).delete()
  await db.from('positions').where('position_id', fixture.positionId).delete()
  await db.from('departments').where('department_id', fixture.departmentId).delete()
  if (!fixture.ownsPerson) {
    await Person.query().where('person_id', fixture.person.personId).delete()
  }
}

function buHeader(actor: { businessUnit: BusinessUnit }) {
  return actor.businessUnit.businessUnitPublicId
}

function assertPermissionDenied(
  assert: { equal: Function; isUndefined: Function },
  response: { status: () => number; body: () => Record<string, unknown> }
) {
  assert.equal(response.status(), 403)
  assert.equal(response.body()?.key, 'PERM.DENIED')
  assert.equal(response.body()?.title, 'Sin permiso')
  assert.equal(response.body()?.detail, 'No tienes permiso para realizar esta operación.')
  assert.isUndefined(response.body()?.data)
}

function listUrl(query = '') {
  return `/api/employees/${query}`
}

/**
 * Lee el paginador Lucid de GET /api/employees/ (data.employees.data)
 * o un arreglo plano en data.employees. No altera el contrato de éxito.
 */
function extractEmployeeIds(body: Record<string, unknown> | null | undefined): number[] {
  const payload = (body?.data ?? {}) as Record<string, unknown>
  const employees = payload.employees
  let rows: unknown[] = []
  if (Array.isArray(employees)) {
    rows = employees
  } else if (employees && typeof employees === 'object') {
    const nested = (employees as { data?: unknown }).data
    if (Array.isArray(nested)) {
      rows = nested
    }
  }
  return rows
    .map((row) => {
      const record = row as Record<string, unknown>
      return Number(record.employeeId ?? record.employee_id)
    })
    .filter((id) => Number.isFinite(id) && id > 0)
}

async function disableEnforcementAndVerify(employeesModule: SystemModule) {
  employeesModule.systemModulePermissionEnforcementActive = false
  await employeesModule.save()
  const moduleAfterTeardown = await SystemModule.findOrFail(employeesModule.systemModuleId)
  if (moduleAfterTeardown.systemModulePermissionEnforcementActive !== false) {
    throw new Error('La exigencia de permisos de empleados debe quedar apagada tras el suite.')
  }
}

test.group('Listado — PermissionGate soft-rollout', (group) => {
  let employeesModule: SystemModule
  let actor: TenantActor | null = null

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
    actor = await createActor('listado-off')
    await grantOnly(actor.role.roleId, [])
  })

  group.teardown(async () => {
    try {
      await cleanupActor(actor)
    } finally {
      await disableEnforcementAndVerify(employeesModule)
    }
  })

  test('con exigencia apagada, el listado y las bajas no responden PERM.DENIED', async ({
    client,
    assert,
  }) => {
    const list = await client
      .get(listUrl('?page=1&limit=10'))
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    const bajas = await client
      .get(listUrl('?page=1&limit=10&onlyInactive=true'))
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    const birthday = await client
      .get('/api/employees/get-birthday')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    const types = await client
      .get('/api/employee-types?page=1&limit=10')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))

    assert.notEqual(list.body()?.key, 'PERM.DENIED')
    assert.notEqual(bajas.body()?.key, 'PERM.DENIED')
    assert.notEqual(birthday.body()?.key, 'PERM.DENIED')
    assert.notEqual(types.body()?.key, 'PERM.DENIED')
  })
})

test.group('Listado — PermissionGate exigencia ON', (group) => {
  let employeesModule: SystemModule
  let actor: TenantActor | null = null
  let fixture: EmployeeFixture | null = null

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = true
    await employeesModule.save()
    actor = await createActor('listado-on')
    fixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'ops')
  })

  group.teardown(async () => {
    try {
      await cleanupEmployeeFixture(fixture)
      await cleanupActor(actor)
    } finally {
      await disableEnforcementAndVerify(employeesModule)
    }
  })

  test('sin read el listado responde PERM.DENIED y no entrega registros ni total', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    const response = await client
      .get(listUrl('?page=1&limit=10'))
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    assertPermissionDenied(assert, response)
  })

  test('solo read abre el listado de activos y niega el filtro de bajas', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['read'])
    const activos = await client
      .get(listUrl('?page=1&limit=10'))
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    assert.notEqual(activos.body()?.key, 'PERM.DENIED')
    assert.equal(activos.status(), 200)

    const bajas = await client
      .get(listUrl('?page=1&limit=10&onlyInactive=true'))
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    assertPermissionDenied(assert, bajas)
  })

  test('to-assigned y excel con onlyInactive sin permiso de bajas también se rechazan', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['read'])
    const assigned = await client
      .get('/api/employees/to-assigned?page=1&limit=10&onlyInactive=true')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    const excel = await client
      .get('/api/employees/employee-generate-excel?onlyInactive=true')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    assertPermissionDenied(assert, assigned)
    assertPermissionDenied(assert, excel)
  })

  test('read más read-terminated-employees abre el listado de bajas', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['read', 'read-terminated-employees'])
    const bajas = await client
      .get(listUrl('?page=1&limit=10&onlyInactive=true'))
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    assert.notEqual(bajas.body()?.key, 'PERM.DENIED')
    assert.equal(bajas.status(), 200)
  })

  test('read abre calendarios y catálogos internos; tab-trabajo-read no basta para el listado', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-trabajo-read'])
    const list = await client
      .get(listUrl('?page=1&limit=10'))
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    assertPermissionDenied(assert, list)

    await grantOnly(actor!.role.roleId, ['read'])
    const birthday = await client
      .get('/api/employees/get-birthday')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    const anniversary = await client
      .get('/api/employees/get-anniversary?year=2026')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    const schedules = await client
      .get('/api/employees/get-work-schedules')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    const catalog = await client
      .get('/api/employees/termination-catalog')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    const types = await client
      .get('/api/employee-types?page=1&limit=10')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    const withoutUser = await client
      .get('/api/employees/without-user?page=1&limit=10')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))

    assert.notEqual(birthday.body()?.key, 'PERM.DENIED')
    assert.notEqual(anniversary.body()?.key, 'PERM.DENIED')
    assert.notEqual(schedules.body()?.key, 'PERM.DENIED')
    assert.notEqual(catalog.body()?.key, 'PERM.DENIED')
    assert.notEqual(types.body()?.key, 'PERM.DENIED')
    assert.notEqual(withoutUser.body()?.key, 'PERM.DENIED')
  })

  test('read no amplía el alcance: filtrar Finanzas no entrega gente de otro departamento', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['read'])
    const finance = await createEmployeeFixture(actor!.businessUnit.businessUnitId, 'fin')
    await RoleDepartment.create({
      roleId: actor!.role.roleId,
      departmentId: fixture!.departmentId,
    })
    try {
      const response = await client
        .get(listUrl(`?page=1&limit=50&departmentId=${finance.departmentId}`))
        .loginAs(actor!.user)
        .header('X-Business-Unit-Id', buHeader(actor!))
      assert.notEqual(response.body()?.key, 'PERM.DENIED')
      assert.exists(response.body()?.data?.employees)
      const rows = extractEmployeeIds(response.body())
      assert.notInclude(rows, finance.employee.employeeId)
    } finally {
      await RoleDepartment.query().where('role_id', actor!.role.roleId).delete()
      await cleanupEmployeeFixture(finance)
    }
  })
})

test.group('Listado — PermissionGate bypass standard', (group) => {
  let employeesModule: SystemModule
  let actor: TenantActor | null = null
  let ownerActor: SystemActor | null = null
  let rootActor: SystemActor | null = null
  let ownerGrants: RoleSystemPermission[] = []
  let rootGrants: RoleSystemPermission[] = []

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = true
    await employeesModule.save()
    actor = await createActor('listado-bypass')
    await grantOnly(actor.role.roleId, [])
    ownerActor = await createSystemActor('owner', 'listado-owner', actor.businessUnit.businessUnitId)
    rootActor = await createSystemActor('root', 'listado-root', actor.businessUnit.businessUnitId)
  })

  group.teardown(async () => {
    try {
      await restoreEmployeesGrants(ownerGrants)
      await restoreEmployeesGrants(rootGrants)
      await cleanupSystemActor(ownerActor)
      await cleanupSystemActor(rootActor)
      await cleanupActor(actor)
    } finally {
      await disableEnforcementAndVerify(employeesModule)
    }
  })

  test('owner y root sin grants no reciben PERM.DENIED en el listado ni en bajas', async ({
    client,
    assert,
  }) => {
    ownerGrants = await snapshotAndClearEmployeesGrants(ownerActor!.roleId)
    rootGrants = await snapshotAndClearEmployeesGrants(rootActor!.roleId)
    for (const systemActor of [ownerActor!, rootActor!]) {
      const list = await client
        .get(listUrl('?page=1&limit=10'))
        .loginAs(systemActor.user)
        .header('X-Business-Unit-Id', buHeader(systemActor))
      const bajas = await client
        .get(listUrl('?page=1&limit=10&onlyInactive=true'))
        .loginAs(systemActor.user)
        .header('X-Business-Unit-Id', buHeader(systemActor))
      assert.notEqual(list.body()?.key, 'PERM.DENIED')
      assert.notEqual(bajas.body()?.key, 'PERM.DENIED')
    }
  })

  test('super-administrador sin grants recibe PERM.DENIED en el listado', async ({
    client,
    assert,
  }) => {
    const direccion = await createSystemActor(
      'super-administrador',
      'listado-dg',
      actor!.businessUnit.businessUnitId
    )
    const dgGrants = await snapshotAndClearEmployeesGrants(direccion.roleId)
    try {
      const denied = await client
        .get(listUrl('?page=1&limit=10'))
        .loginAs(direccion.user)
        .header('X-Business-Unit-Id', buHeader(actor!))
      assertPermissionDenied(assert, denied)
    } finally {
      await restoreEmployeesGrants(dgGrants)
      await cleanupSystemActor(direccion)
    }
  })
})
