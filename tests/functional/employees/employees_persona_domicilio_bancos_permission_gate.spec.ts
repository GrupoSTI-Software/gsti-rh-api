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

const TEST_PASSWORD = 'EmployeesPersonaDomicilioBancosSoftRollout123!'

interface TenantActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
  role: Role
}

interface EmployeeFixture {
  employee: Employee
  person: Person
  departmentId: number
  positionId: number
}

interface SystemActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
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
    throw new Error(`Se requiere el permiso "${moduleSlug}:${permissionSlug}" en BD para este test.`)
  }

  return permission.systemPermissionId
}

async function grantOnly(roleId: number, permissionSlugs: string[]) {
  await RoleSystemPermission.query().where('role_id', roleId).delete()
  for (const slug of permissionSlugs) {
    await RoleSystemPermission.create({
      roleId,
      systemPermissionId: await permissionId('employees', slug),
    })
  }
}

async function createActor(emailPrefix: string): Promise<TenantActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Persona Domicilio Bancos ${stamp}`,
    businessUnitSlug: `persona-domicilio-bancos-${stamp}`,
    businessUnitLegalName: `Persona Domicilio Bancos Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const role = await Role.create({
    roleName: `Persona Domicilio Bancos ${stamp}`,
    roleSlug: `persona-domicilio-bancos-${stamp}`,
    roleDescription: 'Rol temporal sin permisos de sección',
    roleActive: 1,
    roleBusinessAccess: businessUnit.businessUnitSlug,
    roleManagementDays: 10,
  })
  const person = await Person.create({
    personFirstname: 'PersonaSoftRollout',
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

async function createSystemActor(roleSlug: string, emailPrefix: string): Promise<SystemActor> {
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', roleSlug).firstOrFail()
  const businessUnit = await BusinessUnit.query()
    .whereNull('business_unit_deleted_at')
    .where('business_unit_active', 1)
    .firstOrFail()
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const person = await Person.create({
    personFirstname: 'PersonaDomicilioBancos',
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

  await user.related('businessUnits').attach([businessUnit.businessUnitId])
  return { user, person, businessUnit }
}

async function cleanupSystemActor(actor: SystemActor | null) {
  if (!actor) return
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

async function createEmployeeFixture(businessUnitId: number, prefix: string): Promise<EmployeeFixture> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const now = new Date()
  const person = await Person.create({
    personFirstname: 'Empleado',
    personLastname: 'SoftRollout',
    personSecondLastname: prefix,
    personEmail: `employee-${prefix}-${stamp}@gsti-tests.local`,
  })
  const departmentInsert = await db.table('departments').insert({
    department_sync_id: stamp,
    department_code: `DEP-${stamp}`,
    department_name: `Departamento ${prefix}`,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    department_active: 1,
    department_created_at: now,
  })
  const departmentId = Number(departmentInsert[0])
  const positionInsert = await db.table('positions').insert({
    position_sync_id: stamp,
    position_code: `POS-${stamp}`,
    position_name: `Puesto ${prefix}`,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    position_active: 1,
    position_created_at: now,
  })
  const positionId = Number(positionInsert[0])
  const employeeInsert = await db.table('employees').insert({
    employee_sync_id: `EMP-${stamp}`,
    employee_code: `EMP-${stamp}`,
    employee_first_name: 'Empleado',
    employee_last_name: 'SoftRollout',
    employee_second_last_name: prefix,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    department_id: departmentId,
    position_id: positionId,
    person_id: person.personId,
    employee_type_id: 1,
    employee_work_schedule: 'Onsite',
    employee_business_email: `employee-work-${prefix}-${stamp}@gsti-tests.local`,
    employee_created_at: now,
  })

  return {
    employee: await Employee.findOrFail(Number(employeeInsert[0])),
    person,
    departmentId,
    positionId,
  }
}

async function cleanupEmployeeFixture(fixture: EmployeeFixture | null) {
  if (!fixture) return
  await db.from('employee_emergency_contacts').where('employee_id', fixture.employee.employeeId).delete()
  await db.from('employee_children').where('employee_id', fixture.employee.employeeId).delete()
  await db.from('employee_banks').where('employee_id', fixture.employee.employeeId).delete()
  await Employee.query().where('employee_id', fixture.employee.employeeId).delete()
  await db.from('positions').where('position_id', fixture.positionId).delete()
  await db.from('departments').where('department_id', fixture.departmentId).delete()
  await Person.query().where('person_id', fixture.person.personId).delete()
}

function bankPayload(employeeId: number, suffix: number) {
  return {
    employeeBankAccountClabe: `012180001234567${String(suffix).padStart(3, '0')}`,
    employeeBankAccountCurrencyType: 'MXN',
    employeeId,
    bankId: 1,
  }
}

function childPayload(employeeId: number) {
  return {
    employeeChildrenFirstname: 'Hijo',
    employeeChildrenLastname: 'Prueba',
    employeeChildrenSecondLastname: 'Gate',
    employeeId,
  }
}

function emergencyPayload(employeeId: number) {
  return {
    employeeEmergencyContactFirstname: 'Contacto',
    employeeEmergencyContactLastname: 'Emergencia',
    employeeEmergencyContactSecondLastname: 'Gate',
    employeeEmergencyContactRelationship: 'Familiar',
    employeeEmergencyContactPhone: '5551112233',
    employeeId,
  }
}

async function createBankFixture(fixture: EmployeeFixture, businessUnitId: number, suffix: number) {
  const now = new Date()
  const insert = await db.table('employee_banks').insert({
    employee_bank_account_clabe: `012180001234567${String(suffix).padStart(3, '0')}`,
    employee_bank_account_clabe_last_numbers: String(suffix).padStart(4, '0').slice(-4),
    employee_bank_account_number: null,
    employee_bank_account_number_last_numbers: null,
    employee_bank_account_currency_type: 'MXN',
    employee_id: fixture.employee.employeeId,
    business_unit_id: businessUnitId,
    bank_id: 1,
    employee_bank_created_at: now,
  })
  return Number(insert[0])
}

async function createChildFixture(fixture: EmployeeFixture, businessUnitId: number) {
  const insert = await db.table('employee_children').insert({
    employee_children_firstname: 'Hijo',
    employee_children_lastname: 'Eliminar',
    employee_children_second_lastname: 'Gate',
    employee_id: fixture.employee.employeeId,
    business_unit_id: businessUnitId,
    employee_children_created_at: new Date(),
  })
  return Number(insert[0])
}

test.group('Persona/Domicilio/Bancos — PermissionGate soft-rollout', (group) => {
  let employeesModule: SystemModule
  let actor: TenantActor | null = null
  let fixture: EmployeeFixture | null = null
  let createdAddressId: number | null = null

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
    actor = await createActor('employees-persona-domicilio-bancos')
    await grantOnly(actor.role.roleId, [])
    fixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'soft-rollout')
  })

  group.teardown(async () => {
    let enforcementLeftDisabled = false
    try {
      if (createdAddressId) {
        await db.from('addresses').where('address_id', createdAddressId).delete()
      }
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

  test('con exigencia apagada, POST /api/employee-banks no responde PERM.DENIED', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/employee-banks')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json({
        employeeBankAccountClabe: '012180001234567890',
        employeeBankAccountCurrencyType: 'MXN',
        employeeId: fixture!.employee.employeeId,
        bankId: 1,
      })

    assert.notEqual(response.status(), 403)
    assert.notEqual(response.body()?.key, 'PERM.DENIED')
    assert.notEqual(response.body()?.key, 'PERM.UNRESOLVED')
  })

  test('con exigencia apagada, PUT persona-colaborador no responde PERM.DENIED', async ({
    client,
    assert,
  }) => {
    const response = await client
      .put(`/api/persons/${fixture!.person.personId}`)
      .loginAs(actor!.user)
      .json({
        personFirstname: 'Soft',
        personLastname: 'Rollout',
        personPhone: '5550000000',
      })

    assert.notEqual(response.status(), 403)
    assert.notEqual(response.body()?.key, 'PERM.DENIED')
  })

  test('con exigencia apagada, POST /api/address no responde PERM.DENIED', async ({
    client,
    assert,
  }) => {
    const response = await client.post('/api/address').loginAs(actor!.user).json({
      addressZipcode: 64000,
      addressCountry: 'México',
      addressState: 'Nuevo León',
      addressTownship: 'Monterrey',
      addressCity: 'Monterrey',
      addressSettlement: 'Centro',
      addressStreet: 'Calle Soft',
      addressTypeId: 1,
    })
    createdAddressId = response.body()?.data?.address?.addressId ?? null

    assert.notEqual(response.status(), 403)
    assert.notEqual(response.body()?.key, 'PERM.DENIED')
  })
})

test.group('Persona/Domicilio/Bancos — PermissionGate exigencia ON', (group) => {
  let employeesModule: SystemModule
  let actor: TenantActor | null = null
  let fixture: EmployeeFixture | null = null
  let customerPerson: Person | null = null
  let createdAddressId: number | null = null

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = true
    await employeesModule.save()
    actor = await createActor('employees-persona-domicilio-bancos-enforced')
    fixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'enforced')
  })

  group.teardown(async () => {
    let enforcementLeftDisabled = false
    try {
      if (createdAddressId) {
        await db.from('addresses').where('address_id', createdAddressId).delete()
      }
      if (customerPerson) {
        await db.from('customers').where('person_id', customerPerson.personId).delete()
        await Person.query().where('person_id', customerPerson.personId).delete()
      }
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

  test('capturista permite domicilio e hijos, pero niega bancos', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, [
      'tab-persona-write',
      'tab-persona-delete',
      'tab-domicilio-write',
      'tab-domicilio-delete',
    ])

    const addressResponse = await client.post('/api/address').loginAs(actor!.user).json({
      addressZipcode: 64000,
      addressCountry: 'México',
      addressState: 'Nuevo León',
      addressTownship: 'Monterrey',
      addressCity: 'Monterrey',
      addressSettlement: 'Centro',
      addressStreet: 'Calle Capturista',
      addressTypeId: 1,
    })
    createdAddressId = addressResponse.body()?.data?.address?.addressId ?? null
    assert.notEqual(addressResponse.body()?.key, 'PERM.DENIED')

    const childResponse = await client
      .post('/api/employee-children')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json(childPayload(fixture!.employee.employeeId))
    assert.notEqual(childResponse.body()?.key, 'PERM.DENIED')

    const bankResponse = await client
      .post('/api/employee-banks')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json(bankPayload(fixture!.employee.employeeId, 101))
    bankResponse.assertStatus(403)
    assert.equal(bankResponse.body()?.key, 'PERM.DENIED')
    const bank = await db
      .from('employee_banks')
      .where('employee_id', fixture!.employee.employeeId)
      .where('employee_bank_account_clabe_last_numbers', '0101')
      .first()
    assert.isNull(bank)

    const bankId = await createBankFixture(fixture!, actor!.businessUnit.businessUnitId, 102)
    const deleteResponse = await client
      .delete(`/api/employee-banks/${bankId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
    deleteResponse.assertStatus(403)
    assert.equal(deleteResponse.body()?.key, 'PERM.DENIED')
    assert.isNotNull(await db.from('employee_banks').where('employee_bank_id', bankId).first())
  })

  test('nómina permite bancos y niega contactos de emergencia', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['tab-bancos-write', 'tab-bancos-delete'])

    const bankResponse = await client
      .post('/api/employee-banks')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json(bankPayload(fixture!.employee.employeeId, 201))
    assert.notEqual(bankResponse.status(), 403)
    assert.notEqual(bankResponse.body()?.key, 'PERM.DENIED')

    const emergencyResponse = await client
      .post('/api/employee-emergency-contacts')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json(emergencyPayload(fixture!.employee.employeeId))
    emergencyResponse.assertStatus(403)
    assert.equal(emergencyResponse.body()?.key, 'PERM.DENIED')
  })

  test('niega al colaborador antes de validar el cuerpo inválido', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, [])

    const response = await client
      .put(`/api/persons/${fixture!.person.personId}`)
      .loginAs(actor!.user)
      .json({ personLastname: 'Inválido' })

    response.assertStatus(403)
    assert.equal(response.body()?.key, 'PERM.DENIED')
  })

  test('permite editar persona cliente sin permiso de empleados', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, [])
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
    customerPerson = await Person.create({
      personFirstname: 'Cliente',
      personLastname: 'PermissionGate',
      personSecondLastname: 'Prueba',
      personEmail: `customer-${stamp}@gsti-tests.local`,
    })
    await db.table('customers').insert({
      person_id: customerPerson.personId,
      customer_created_at: new Date(),
    })

    const response = await client
      .put(`/api/persons/${customerPerson.personId}`)
      .loginAs(actor!.user)
      .json({ personFirstname: 'Cliente', personLastname: 'Actualizado' })

    assert.notEqual(response.status(), 403)
    assert.notEqual(response.body()?.key, 'PERM.DENIED')
  })

  test('owner evade el gate y super-administrador no', async ({ client, assert }) => {
    const owner = await createSystemActor('owner', 'employees-persona-owner')
    const superAdmin = await createSystemActor(
      'super-administrador',
      'employees-persona-super-admin'
    )
    try {
      const ownerResponse = await client
        .post('/api/employee-banks')
        .loginAs(owner.user)
        .header('X-Business-Unit-Id', owner.businessUnit.businessUnitPublicId)
        .json(bankPayload(fixture!.employee.employeeId, 301))
      assert.notEqual(ownerResponse.status(), 403)
      assert.notEqual(ownerResponse.body()?.key, 'PERM.DENIED')

      const superAdminResponse = await client
        .post('/api/employee-banks')
        .loginAs(superAdmin.user)
        .header('X-Business-Unit-Id', superAdmin.businessUnit.businessUnitPublicId)
        .json(bankPayload(fixture!.employee.employeeId, 302))
      superAdminResponse.assertStatus(403)
      assert.equal(superAdminResponse.body()?.key, 'PERM.DENIED')
    } finally {
      await cleanupSystemActor(owner)
      await cleanupSystemActor(superAdmin)
    }
  })

  test('write sin delete no permite eliminar bancos ni hijos', async ({ client, assert }) => {
    const bankId = await createBankFixture(fixture!, actor!.businessUnit.businessUnitId, 401)
    const childId = await createChildFixture(fixture!, actor!.businessUnit.businessUnitId)

    await grantOnly(actor!.role.roleId, ['tab-bancos-write'])
    const bankDeleteResponse = await client
      .delete(`/api/employee-banks/${bankId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
    bankDeleteResponse.assertStatus(403)
    assert.equal(bankDeleteResponse.body()?.key, 'PERM.DENIED')
    assert.isNotNull(await db.from('employee_banks').where('employee_bank_id', bankId).first())

    await grantOnly(actor!.role.roleId, ['tab-persona-write'])
    const childDeleteResponse = await client
      .delete(`/api/employee-children/${childId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
    childDeleteResponse.assertStatus(403)
    assert.equal(childDeleteResponse.body()?.key, 'PERM.DENIED')
    assert.isNotNull(await db.from('employee_children').where('employee_children_id', childId).first())
  })
})
