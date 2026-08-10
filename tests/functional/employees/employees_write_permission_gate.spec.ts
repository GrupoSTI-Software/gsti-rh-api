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

const TEST_PASSWORD = 'EmployeesWriteSoftRolloutTest123!'

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
    .first()

  if (!permission) {
    throw new Error(
      `Se requiere el permiso "${moduleSlug}:${permissionSlug}" en BD para este test.`
    )
  }

  return permission.systemPermissionId
}

async function createActor(emailPrefix: string): Promise<TenantActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Employees Write Soft Rollout ${stamp}`,
    businessUnitSlug: `employees-write-soft-rollout-${stamp}`,
    businessUnitLegalName: `Employees Write Soft Rollout Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const role = await Role.create({
    roleName: `Employees Write Soft Rollout ${stamp}`,
    roleSlug: `employees-write-soft-rollout-${stamp}`,
    roleDescription: 'Rol temporal sin permisos de empleados',
    roleActive: 1,
    roleBusinessAccess: businessUnit.businessUnitSlug,
    roleManagementDays: 10,
  })
  const person = await Person.create({
    personFirstname: 'EmployeesWriteSoftRollout',
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

test.group('Escrituras empleados — PermissionGate soft-rollout', (group) => {
  let employeesModule: SystemModule

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
  })

  group.teardown(async () => {
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
  })

  test('con exigencia apagada, rol sin permiso no recibe PERM.DENIED en POST /api/employees', async ({
    client,
    assert,
  }) => {
    const actor = await createActor('employees-write-soft-rollout')

    try {
      const createPermissionId = await permissionId('employees', 'create')
      const createGrant = await RoleSystemPermission.query()
        .whereNull('role_system_permission_deleted_at')
        .where('role_id', actor.role.roleId)
        .where('system_permission_id', createPermissionId)
        .first()
      assert.isNull(createGrant)

      const response = await client
        .post('/api/employees')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
        .json({ companyId: 1 })

      assert.notEqual(response.status(), 403)
      assert.notEqual(response.body()?.key, 'PERM.DENIED')
      assert.notEqual(response.body()?.key, 'PERM.UNRESOLVED')
    } finally {
      await cleanupActor(actor)
    }
  })
})

interface EmployeeFixture {
  employee: Employee
  person: Person
  departmentId: number
  positionId: number
  alternativePositionId: number
}

interface SystemActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
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

async function createSystemActor(roleSlug: string, emailPrefix: string): Promise<SystemActor> {
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', roleSlug).firstOrFail()
  const businessUnit = await BusinessUnit.query()
    .whereNull('business_unit_deleted_at')
    .where('business_unit_active', 1)
    .firstOrFail()
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const person = await Person.create({
    personFirstname: 'EmployeesWriteEnforced',
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
  return { user, person, businessUnit }
}

async function cleanupSystemActor(actor: SystemActor | null) {
  if (!actor) return
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

async function createEmployeeFixture(
  businessUnitId: number,
  prefix: string,
  terminated = false
): Promise<EmployeeFixture> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const now = new Date()
  const person = await Person.create({
    personFirstname: 'Empleado',
    personLastname: 'PermissionGate',
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
  const alternativePositionInsert = await db.table('positions').insert({
    position_sync_id: `${stamp}-alt`,
    position_code: `POS-${stamp}-ALT`,
    position_name: `Puesto alterno ${prefix}`,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    position_active: 1,
    position_created_at: now,
  })
  const alternativePositionId = Number(alternativePositionInsert[0])
  const employeeInsert = await db.table('employees').insert({
    employee_sync_id: `EMP-${stamp}`,
    employee_code: `EMP-${stamp}`,
    employee_first_name: 'Empleado',
    employee_last_name: 'PermissionGate',
    employee_second_last_name: prefix,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    department_id: departmentId,
    position_id: positionId,
    person_id: person.personId,
    employee_type_id: 1,
    employee_work_schedule: 'Onsite',
    employee_business_email: `employee-work-${prefix}-${stamp}@gsti-tests.local`,
    employee_terminated_date: terminated ? '2024-01-15' : null,
    employee_termination_modality: terminated ? 'Renuncia' : null,
    employee_termination_type: terminated ? 'Jubilación' : null,
    employee_created_at: now,
  })
  const employeeId = Number(employeeInsert[0])
  return {
    employee: await Employee.findOrFail(employeeId),
    person,
    departmentId,
    positionId,
    alternativePositionId,
  }
}

async function cleanupEmployeeFixture(fixture: EmployeeFixture | null) {
  if (!fixture) return
  await db.from('employee_salary_history').where('employee_id', fixture.employee.employeeId).delete()
  await Employee.query().where('employee_id', fixture.employee.employeeId).delete()
  await db.from('positions').where('position_id', fixture.alternativePositionId).delete()
  await db.from('positions').where('position_id', fixture.positionId).delete()
  await db.from('departments').where('department_id', fixture.departmentId).delete()
  await Person.query().where('person_id', fixture.person.personId).delete()
}

function employeePayload(fixture: EmployeeFixture, overrides: Record<string, unknown> = {}) {
  const employee = fixture.employee
  return {
    employeeCode: String(employee.employeeCode),
    employeeFirstName: employee.employeeFirstName ?? '',
    employeeLastName: employee.employeeLastName ?? '',
    employeeSecondLastName: employee.employeeSecondLastName ?? '',
    companyId: employee.companyId,
    departmentId: fixture.departmentId,
    positionId: fixture.positionId,
    employeeTypeId: employee.employeeTypeId,
    payrollBusinessUnitId: employee.businessUnitId,
    employeeBusinessEmail: employee.employeeBusinessEmail,
    employeeWorkSchedule: employee.employeeWorkSchedule ?? 'Onsite',
    employeeWorkScheduleHybridConfig: null,
    ...overrides,
  }
}

async function terminationSnapshot(employeeId: number) {
  return db
    .from('employees')
    .where('employee_id', employeeId)
    .select([
      'employee_terminated_date',
      'employee_termination_modality',
      'employee_termination_type',
      'position_id',
      'daily_salary',
    ])
    .first()
}

test.group('Escrituras empleados — PermissionGate exigencia ON', (group) => {
  let employeesModule: SystemModule
  let actor: TenantActor | null = null

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = true
    await employeesModule.save()
    actor = await createActor('employees-write-enforced')
    await grantOnly(actor.role.roleId, ['tab-trabajo-write'])
  })

  group.teardown(async () => {
    try {
      if (actor) {
        const employees = await db
          .from('employees')
          .where('business_unit_id', actor.businessUnit.businessUnitId)
          .select('employee_id')
        await db
          .from('employee_salary_history')
          .whereIn(
            'employee_id',
            employees.map((employee) => employee.employee_id)
          )
          .delete()
        await db.from('employees').where('business_unit_id', actor.businessUnit.businessUnitId).delete()
        await db.from('positions').where('business_unit_id', actor.businessUnit.businessUnitId).delete()
        await db.from('departments').where('business_unit_id', actor.businessUnit.businessUnitId).delete()
      }
      await cleanupActor(actor)
    } finally {
      employeesModule.systemModulePermissionEnforcementActive = false
      await employeesModule.save()
    }
  })

  test('A: permite editar puesto y salario de empleado activo con tab-trabajo-write', async ({
    client,
    assert,
  }) => {
    const fixture = await createEmployeeFixture(actor!.businessUnit.businessUnitId, 'active')
    try {
      const response = await client
        .put(`/api/employees/${fixture.employee.employeeId}`)
        .loginAs(actor!.user)
        .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
        .json(
          employeePayload(fixture, {
            positionId: fixture.alternativePositionId,
            dailySalary: 321,
            salaryChangeReason: 'Prueba',
          })
        )
      response.assertStatus(201)
      const updated = await terminationSnapshot(fixture.employee.employeeId)
      assert.equal(updated.position_id, fixture.alternativePositionId)
      assert.equal(Number(updated.daily_salary), 321)
      assert.isNull(updated.employee_terminated_date)
      assert.isNull(updated.employee_termination_modality)
      assert.isNull(updated.employee_termination_type)
    } finally {
      await cleanupEmployeeFixture(fixture)
    }
  })

  test('B: permite editar baja existente sin modificar su registro', async ({ client, assert }) => {
    const fixture = await createEmployeeFixture(actor!.businessUnit.businessUnitId, 'terminated', true)
    try {
      const before = await terminationSnapshot(fixture.employee.employeeId)
      const response = await client
        .put(`/api/employees/${fixture.employee.employeeId}`)
        .loginAs(actor!.user)
        .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
        .json(
          employeePayload(fixture, {
            dailySalary: 654,
            salaryChangeReason: 'Prueba',
            employeeTerminatedDate: '2024-01-15',
            employeeTerminationModality: 'Renuncia',
            employeeTerminationType: 'Jubilación',
          })
        )
      response.assertStatus(201)
      const updated = await terminationSnapshot(fixture.employee.employeeId)
      assert.equal(String(updated.employee_terminated_date), String(before.employee_terminated_date))
      assert.equal(updated.employee_termination_modality, before.employee_termination_modality)
      assert.equal(updated.employee_termination_type, before.employee_termination_type)
      assert.equal(Number(updated.daily_salary), 654)
    } finally {
      await cleanupEmployeeFixture(fixture)
    }
  })

  for (const [name, terminated, changes] of [
    ['C1: impide asentar una baja', false, { employeeTerminatedDate: '2024-01-15', employeeTerminationModality: 'Renuncia', employeeTerminationType: 'Jubilación' }],
    ['C2: impide cambiar la fecha de baja', true, { employeeTerminatedDate: '2024-02-15', employeeTerminationModality: 'Renuncia', employeeTerminationType: 'Jubilación' }],
    ['C3: impide cambiar modalidad o tipo de baja', true, { employeeTerminatedDate: '2024-01-15', employeeTerminationModality: 'Retiro', employeeTerminationType: 'Jubilación' }],
    ['C4: impide limpiar una baja', true, { employeeTerminatedDate: null, employeeTerminationModality: null, employeeTerminationType: null }],
  ] as const) {
    test(name, async ({ client, assert }) => {
      const fixture = await createEmployeeFixture(actor!.businessUnit.businessUnitId, name.slice(0, 2), terminated)
      try {
        const before = await terminationSnapshot(fixture.employee.employeeId)
        const response = await client
          .put(`/api/employees/${fixture.employee.employeeId}`)
          .loginAs(actor!.user)
          .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
          .json(employeePayload(fixture, { dailySalary: 999, ...changes }))
        response.assertStatus(403)
        assert.equal(response.body()?.key, 'PERM.DENIED')
        assert.deepEqual(await terminationSnapshot(fixture.employee.employeeId), before)
      } finally {
        await cleanupEmployeeFixture(fixture)
      }
    })
  }

  test('D: impide baja operativa sin delete', async ({ client, assert }) => {
    const fixture = await createEmployeeFixture(actor!.businessUnit.businessUnitId, 'delete')
    try {
      const response = await client
        .delete(`/api/employees/${fixture.employee.employeeId}`)
        .loginAs(actor!.user)
        .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      response.assertStatus(403)
      assert.equal(response.body()?.key, 'PERM.DENIED')
    } finally {
      await cleanupEmployeeFixture(fixture)
    }
  })

  test('E: impide importación antes de crear empleados', async ({ client, assert }) => {
    const before = await Employee.query().whereNull('employee_deleted_at').count('* as total')
    const response = await client
      .post('/api/employees/import-excel')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
    response.assertStatus(403)
    assert.equal(response.body()?.key, 'PERM.DENIED')
    const after = await Employee.query().whereNull('employee_deleted_at').count('* as total')
    assert.equal(Number(after[0].$extras.total), Number(before[0].$extras.total))
  })

  test('F: impide importación de asignaciones de turno', async ({ client, assert }) => {
    const response = await client
      .post('/api/employees/import-shift-assignments')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
    response.assertStatus(403)
    assert.equal(response.body()?.key, 'PERM.DENIED')
  })

  test('G: owner y root evaden el gate estándar sin grants', async ({ client, assert }) => {
    const owner = await createSystemActor('owner', 'employees-write-owner')
    const root = await createSystemActor('root', 'employees-write-root')
    try {
      for (const systemActor of [owner, root]) {
        const response = await client
          .delete('/api/employees/999999999')
          .loginAs(systemActor.user)
          .header('X-Business-Unit-Id', systemActor.businessUnit.businessUnitPublicId)
        assert.notEqual(response.body()?.key, 'PERM.DENIED')
      }
    } finally {
      await cleanupSystemActor(owner)
      await cleanupSystemActor(root)
    }
  })

  test('H: super-administrador sin grants no evade el gate', async ({ client, assert }) => {
    const superAdmin = await createSystemActor('super-administrador', 'employees-write-super-admin')
    try {
      const response = await client
        .post('/api/employees')
        .loginAs(superAdmin.user)
        .header('X-Business-Unit-Id', superAdmin.businessUnit.businessUnitPublicId)
        .json({ companyId: 1 })
      response.assertStatus(403)
      assert.equal(response.body()?.key, 'PERM.DENIED')
    } finally {
      await cleanupSystemActor(superAdmin)
    }
  })

  test('I: niega create, tab-foto-write y manage-biotime sin sus grants', async ({ client, assert }) => {
    const fixture = await createEmployeeFixture(actor!.businessUnit.businessUnitId, 'other-actions')
    try {
      const responses = [
        await client
          .post('/api/employees')
          .loginAs(actor!.user)
          .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId),
        await client
          .put(`/api/employees/${fixture.employee.employeeId}/photo`)
          .loginAs(actor!.user)
          .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId),
        await client
          .post('/api/synchronization/employees')
          .loginAs(actor!.user)
          .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId),
      ]
      for (const [index, response] of responses.entries()) {
        assert.equal(response.status(), 403, `La acción de muestra ${index} debe ser bloqueada`)
        assert.equal(response.body()?.key, 'PERM.DENIED')
      }
    } finally {
      await cleanupEmployeeFixture(fixture)
    }
  })
})
