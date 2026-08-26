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

/**
 * Eco destructivo del salario diario en PUT /api/employees/:id
 * (USRH1787433076994, CA-2).
 *
 * El BO reenvía el registro completo del empleado en cada PUT, incluyendo
 * cualquier valor que haya recibido para `dailySalary` (que llega `null`
 * cuando el usuario no tiene `sensitive-financiero-read`, por Task 2 de este
 * mismo trabajo). Antes de esta corrección, `request.input('dailySalary') ||
 * 0` convertía ese eco en `0`, destruyendo el salario real y generando una
 * fila fantasma en el histórico.
 */

const TEST_PASSWORD = 'DailySalaryEchoTest123!'
const KNOWN_DAILY_SALARY = 850.5

interface TenantActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
  role: Role
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
    await RoleSystemPermission.create({
      roleId,
      systemPermissionId: await permissionId(slug),
    })
  }
}

async function createActor(emailPrefix: string): Promise<TenantActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Daily Salary Echo ${stamp}`,
    businessUnitSlug: `daily-salary-echo-${stamp}`,
    businessUnitLegalName: `Daily Salary Echo Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const role = await Role.create({
    roleName: `Daily Salary Echo ${stamp}`,
    roleSlug: `daily-salary-echo-${stamp}`,
    roleDescription: 'Rol temporal para pruebas de eco de salario diario',
    roleActive: 1,
    roleBusinessAccess: businessUnit.businessUnitSlug,
    roleManagementDays: 10,
  })
  const person = await Person.create({
    personFirstname: 'DailySalaryEcho',
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

interface EmployeeFixture {
  employee: Employee
  person: Person
  departmentId: number
  positionId: number
}

async function createEmployeeFixture(
  businessUnitId: number,
  prefix: string,
  dailySalary: number
): Promise<EmployeeFixture> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const now = new Date()
  const person = await Person.create({
    personFirstname: 'Empleado',
    personLastname: 'DailySalaryEcho',
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
    employee_last_name: 'DailySalaryEcho',
    employee_second_last_name: prefix,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    payroll_business_unit_id: businessUnitId,
    department_id: departmentId,
    position_id: positionId,
    person_id: person.personId,
    employee_type_id: 1,
    employee_work_schedule: 'Onsite',
    employee_business_email: `employee-work-${prefix}-${stamp}@gsti-tests.local`,
    daily_salary: dailySalary,
    employee_created_at: now,
  })
  const employeeId = Number(employeeInsert[0])
  return {
    employee: await Employee.findOrFail(employeeId),
    person,
    departmentId,
    positionId,
  }
}

async function cleanupEmployeeFixture(fixture: EmployeeFixture | null) {
  if (!fixture) return
  await db
    .from('employee_salary_history')
    .where('employee_id', fixture.employee.employeeId)
    .delete()
  await Employee.query().where('employee_id', fixture.employee.employeeId).delete()
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

async function dailySalarySnapshot(employeeId: number) {
  const row = await db
    .from('employees')
    .where('employee_id', employeeId)
    .select('daily_salary')
    .first()
  return Number(row.daily_salary)
}

async function salaryHistoryCount(employeeId: number): Promise<number> {
  const rows = await db.from('employee_salary_history').where('employee_id', employeeId)
  return rows.length
}

test.group(
  'Eco destructivo de dailySalary en PUT /api/employees/:id — USRH1787433076994',
  (group) => {
    let employeesModule: SystemModule
    let actor: TenantActor | null = null

    group.setup(async () => {
      employeesModule = await SystemModule.query()
        .whereNull('system_module_deleted_at')
        .where('system_module_slug', 'employees')
        .firstOrFail()
      employeesModule.systemModulePermissionEnforcementActive = true
      await employeesModule.save()
      actor = await createActor('daily-salary-echo')
      await grantOnly(actor.role.roleId, ['tab-trabajo-write'])
    })

    group.teardown(async () => {
      employeesModule.systemModulePermissionEnforcementActive = false
      await employeesModule.save()
      await cleanupActor(actor)
    })

    test('CA-2.1: dailySalary null explícito no modifica el salario ni genera historial', async ({
      client,
      assert,
    }) => {
      const fixture = await createEmployeeFixture(
        actor!.businessUnit.businessUnitId,
        'null-echo',
        KNOWN_DAILY_SALARY
      )
      try {
        const historyBefore = await salaryHistoryCount(fixture.employee.employeeId)
        assert.equal(historyBefore, 0)

        const response = await client
          .put(`/api/employees/${fixture.employee.employeeId}`)
          .loginAs(actor!.user)
          .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
          .json(
            employeePayload(fixture, {
              dailySalary: null,
              employeeBusinessEmail: `changed-${fixture.employee.employeeId}@gsti-tests.local`,
            })
          )

        response.assertStatus(201)
        assert.equal(await dailySalarySnapshot(fixture.employee.employeeId), KNOWN_DAILY_SALARY)
        assert.equal(await salaryHistoryCount(fixture.employee.employeeId), 0)

        const reloaded = await Employee.findOrFail(fixture.employee.employeeId)
        assert.equal(
          reloaded.employeeBusinessEmail,
          `changed-${fixture.employee.employeeId}@gsti-tests.local`
        )
      } finally {
        await cleanupEmployeeFixture(fixture)
      }
    })

    test('CA-2.2: dailySalary ausente del payload no modifica el salario ni genera historial', async ({
      client,
      assert,
    }) => {
      const fixture = await createEmployeeFixture(
        actor!.businessUnit.businessUnitId,
        'absent-echo',
        KNOWN_DAILY_SALARY
      )
      try {
        const historyBefore = await salaryHistoryCount(fixture.employee.employeeId)
        assert.equal(historyBefore, 0)

        const payload = employeePayload(fixture, {
          employeeBusinessEmail: `changed-absent-${fixture.employee.employeeId}@gsti-tests.local`,
        })
        assert.notProperty(payload, 'dailySalary')

        const response = await client
          .put(`/api/employees/${fixture.employee.employeeId}`)
          .loginAs(actor!.user)
          .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
          .json(payload)

        response.assertStatus(201)
        assert.equal(await dailySalarySnapshot(fixture.employee.employeeId), KNOWN_DAILY_SALARY)
        assert.equal(await salaryHistoryCount(fixture.employee.employeeId), 0)
      } finally {
        await cleanupEmployeeFixture(fixture)
      }
    })

    test('CA-2.3: dailySalary 0 explícito sí se persiste y genera historial', async ({
      client,
      assert,
    }) => {
      const fixture = await createEmployeeFixture(
        actor!.businessUnit.businessUnitId,
        'zero-explicit',
        KNOWN_DAILY_SALARY
      )
      try {
        assert.equal(await salaryHistoryCount(fixture.employee.employeeId), 0)

        const response = await client
          .put(`/api/employees/${fixture.employee.employeeId}`)
          .loginAs(actor!.user)
          .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
          .json(
            employeePayload(fixture, {
              dailySalary: 0,
              salaryChangeReason: 'Prueba CA-2.3',
            })
          )

        response.assertStatus(201)
        assert.equal(await dailySalarySnapshot(fixture.employee.employeeId), 0)
        assert.equal(await salaryHistoryCount(fixture.employee.employeeId), 1)
      } finally {
        await cleanupEmployeeFixture(fixture)
      }
    })

    test('CA-2.4: dailySalary no numérico ("abc") no modifica el salario ni genera historial', async ({
      client,
      assert,
    }) => {
      const fixture = await createEmployeeFixture(
        actor!.businessUnit.businessUnitId,
        'nan-echo',
        KNOWN_DAILY_SALARY
      )
      try {
        const response = await client
          .put(`/api/employees/${fixture.employee.employeeId}`)
          .loginAs(actor!.user)
          .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
          .json(
            employeePayload(fixture, {
              dailySalary: 'abc',
            })
          )

        response.assertStatus(201)
        assert.equal(await dailySalarySnapshot(fixture.employee.employeeId), KNOWN_DAILY_SALARY)
        assert.equal(await salaryHistoryCount(fixture.employee.employeeId), 0)
      } finally {
        await cleanupEmployeeFixture(fixture)
      }
    })
  }
)
