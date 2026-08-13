import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'

const TEST_PASSWORD = 'EmployeesExpedienteReadPermissionGate123!'

interface TenantActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
  role: Role
}

interface SystemActor {
  user: User
  person: Person
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
    businessUnitName: `Expediente lectura ${stamp}`,
    businessUnitSlug: `expediente-lectura-${stamp}`,
    businessUnitLegalName: `Expediente lectura legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const role = await Role.create({
    roleName: `Expediente lectura ${stamp}`,
    roleSlug: `expediente-lectura-${stamp}`,
    roleDescription: 'Rol temporal sin permisos de lectura del expediente',
    roleActive: 1,
    roleBusinessAccess: businessUnit.businessUnitSlug,
    roleManagementDays: 10,
  })
  const person = await Person.create({
    personFirstname: 'ExpedienteLectura',
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

async function createSystemActor(
  roleSlug: string,
  emailPrefix: string,
  businessUnitId: number
): Promise<SystemActor> {
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', roleSlug).firstOrFail()
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const person = await Person.create({
    personFirstname: 'ExpedienteLectura',
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
  return { user, person, roleId: role.roleId }
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
      personLastname: 'Expediente',
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
    employee_last_name: 'Expediente',
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

async function createBankFixture(fixture: EmployeeFixture, businessUnitId: number) {
  const insert = await db.table('employee_banks').insert({
    employee_bank_account_clabe: '012180001234567890',
    employee_bank_account_clabe_last_numbers: '7890',
    employee_bank_account_number: null,
    employee_bank_account_number_last_numbers: null,
    employee_bank_account_currency_type: 'MXN',
    employee_id: fixture.employee.employeeId,
    business_unit_id: businessUnitId,
    bank_id: 1,
    employee_bank_created_at: new Date(),
  })
  return Number(insert[0])
}

function buHeader(actor: TenantActor) {
  return actor.businessUnit.businessUnitPublicId
}

test.group('Expediente lectura — PermissionGate soft-rollout', (group) => {
  let employeesModule: SystemModule
  let actor: TenantActor | null = null
  let fixture: EmployeeFixture | null = null

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
    actor = await createActor('employees-expediente-read-soft')
    await grantOnly(actor.role.roleId, [])
    fixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'soft')
  })

  group.teardown(async () => {
    let enforcementLeftDisabled = false
    try {
      await cleanupEmployeeFixture(fixture)
      await cleanupActor(actor)
    } finally {
      employeesModule.systemModulePermissionEnforcementActive = false
      await employeesModule.save()
      const moduleAfterTeardown = await SystemModule.findOrFail(employeesModule.systemModuleId)
      enforcementLeftDisabled = moduleAfterTeardown.systemModulePermissionEnforcementActive === false
    }
    if (!enforcementLeftDisabled) {
      throw new Error('La exigencia de permisos de empleados debe quedar apagada tras el suite.')
    }
  })

  test('con exigencia apagada, GET bancos y GET anotaciones no responden PERM.DENIED', async ({
    client,
    assert,
  }) => {
    const banks = await client
      .get(`/api/employees/${fixture!.employee.employeeId}/banks`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    const notes = await client
      .get(`/api/employee-annotations/employee/${fixture!.employee.employeeId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))

    assert.notEqual(banks.body()?.key, 'PERM.DENIED')
    assert.notEqual(notes.body()?.key, 'PERM.DENIED')
  })

  test('con exigencia apagada, GET ficha no responde PERM.DENIED', async ({ client, assert }) => {
    const response = await client
      .get(`/api/employees/${fixture!.employee.employeeId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))

    assert.notEqual(response.body()?.key, 'PERM.DENIED')
  })
})

test.group('Expediente lectura — PermissionGate exigencia ON', (group) => {
  let employeesModule: SystemModule
  let actor: TenantActor | null = null
  let fixture: EmployeeFixture | null = null
  let ownFixture: EmployeeFixture | null = null
  let customerPerson: Person | null = null
  let bankId: number

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = true
    await employeesModule.save()
    actor = await createActor('employees-expediente-read-on')
    fixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'on')
    ownFixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'own', actor.person)
    bankId = await createBankFixture(fixture, actor.businessUnit.businessUnitId)
    customerPerson = await Person.create({
      personFirstname: 'Persona',
      personLastname: 'Cliente',
      personSecondLastname: 'Expediente',
      personEmail: `customer-${Date.now()}@gsti-tests.local`,
    })
  })

  group.teardown(async () => {
    let enforcementLeftDisabled = false
    try {
      if (customerPerson) {
        await Person.query().where('person_id', customerPerson.personId).delete()
      }
      await cleanupEmployeeFixture(ownFixture)
      await cleanupEmployeeFixture(fixture)
      await cleanupActor(actor)
    } finally {
      employeesModule.systemModulePermissionEnforcementActive = false
      await employeesModule.save()
      const moduleAfterTeardown = await SystemModule.findOrFail(employeesModule.systemModuleId)
      enforcementLeftDisabled = moduleAfterTeardown.systemModulePermissionEnforcementActive === false
    }
    if (!enforcementLeftDisabled) {
      throw new Error('La exigencia de permisos de empleados debe quedar apagada tras el suite.')
    }
  })

  test('solo tab-bancos-read abre bancos y niega anotaciones y ficha', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['tab-bancos-read'])
    const banks = await client
      .get(`/api/employees/${fixture!.employee.employeeId}/banks`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    assert.notEqual(banks.body()?.key, 'PERM.DENIED')

    const notes = await client
      .get(`/api/employee-annotations/employee/${fixture!.employee.employeeId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    notes.assertStatus(403)
    assert.equal(notes.body()?.key, 'PERM.DENIED')
    assert.equal(notes.body()?.title, 'Sin permiso')

    const ficha = await client
      .get(`/api/employees/${fixture!.employee.employeeId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    ficha.assertStatus(403)
    assert.equal(ficha.body()?.key, 'PERM.DENIED')
  })

  test('tab-condicion-medica-read abre condición y propiedades dinámicas', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-condicion-medica-read'])
    const medical = await client
      .get(`/api/employee-medical-conditions/employee/${fixture!.employee.employeeId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    assert.notEqual(medical.body()?.key, 'PERM.DENIED')

    const props = await client
      .get('/api/medical-condition-type-property-values')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    assert.notEqual(props.body()?.key, 'PERM.DENIED')

    const banks = await client
      .get(`/api/employees/${fixture!.employee.employeeId}/banks`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    banks.assertStatus(403)
    assert.equal(banks.body()?.key, 'PERM.DENIED')
  })

  test('tab-trabajo-read abre la ficha completa y no recorta', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['tab-trabajo-read'])
    const ficha = await client
      .get(`/api/employees/${fixture!.employee.employeeId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))

    assert.notEqual(ficha.body()?.key, 'PERM.DENIED')
    assert.equal(ficha.status(), 200)
    assert.exists(ficha.body()?.data?.employee)
  })

  test('el colaborador consulta su condición médica sin grant de pestaña', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    const medical = await client
      .get(`/api/employee-medical-conditions/employee/${ownFixture!.employee.employeeId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))

    assert.notEqual(medical.body()?.key, 'PERM.DENIED')
  })

  test('super-administrador sin grant recibe PERM.DENIED; owner no', async ({ client, assert }) => {
    const owner = await createSystemActor(
      'owner',
      'employees-expediente-read-owner',
      actor!.businessUnit.businessUnitId
    )
    const superAdmin = await createSystemActor(
      'super-administrador',
      'employees-expediente-read-super-admin',
      actor!.businessUnit.businessUnitId
    )
    let ownerGrants: RoleSystemPermission[] = []
    let superAdminGrants: RoleSystemPermission[] = []
    try {
      ownerGrants = await snapshotAndClearEmployeesGrants(owner.roleId)
      superAdminGrants = await snapshotAndClearEmployeesGrants(superAdmin.roleId)

      const denied = await client
        .get(`/api/employees/${fixture!.employee.employeeId}/banks`)
        .loginAs(superAdmin.user)
        .header('X-Business-Unit-Id', buHeader(actor!))
      denied.assertStatus(403)
      assert.equal(denied.body()?.key, 'PERM.DENIED')
      assert.equal(denied.body()?.title, 'Sin permiso')

      const ownerRes = await client
        .get(`/api/employees/${fixture!.employee.employeeId}/banks`)
        .loginAs(owner.user)
        .header('X-Business-Unit-Id', buHeader(actor!))
      assert.notEqual(ownerRes.body()?.key, 'PERM.DENIED')
    } finally {
      await restoreEmployeesGrants(ownerGrants)
      await restoreEmployeesGrants(superAdminGrants)
      await cleanupSystemActor(superAdmin)
      await cleanupSystemActor(owner)
    }
  })

  test('sin permiso, id inexistente y id existente responden el mismo PERM.DENIED', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    const missing = await client
      .get('/api/employee-banks/999999999')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    const existing = await client
      .get(`/api/employee-banks/${bankId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))

    missing.assertStatus(403)
    existing.assertStatus(403)
    assert.equal(missing.body()?.key, existing.body()?.key)
    assert.equal(missing.body()?.detail, existing.body()?.detail)
  })

  test('persona no colaborador sigue consultándose sin tab-persona-read', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, [])
    const response = await client
      .get(`/api/persons/${customerPerson!.personId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))

    assert.notEqual(response.body()?.key, 'PERM.DENIED')
  })
})
