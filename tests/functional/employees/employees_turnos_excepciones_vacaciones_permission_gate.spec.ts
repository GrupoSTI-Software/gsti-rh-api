import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import EmployeeShift from '#models/employee_shift'
import ExceptionRequest from '#models/exception_request'
import ExceptionType from '#models/exception_type'
import RoleSystemPermission from '#models/role_system_permission'
import ShiftException from '#models/shift_exception'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import VacationSetting from '#models/vacation_setting'

const TEST_PASSWORD = 'TurnosExcepcionesVacacionesPermissionGate123!'

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
  shiftId: number
}

interface TestFixtures {
  employee: EmployeeFixture
  absenceType: ExceptionType
  vacationType: ExceptionType
  vacationSetting: VacationSetting
}

async function permissionId(permissionSlug: string): Promise<number> {
  const permission = await SystemPermission.query()
    .whereNull('system_permission_deleted_at')
    .where('system_permission_slug', permissionSlug)
    .whereHas('systemModule', (query) =>
      query.whereNull('system_module_deleted_at').where('system_module_slug', 'employees')
    )
    .first()
  if (!permission) throw new Error(`Se requiere el permiso "employees:${permissionSlug}" en BD.`)
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
    businessUnitName: `Turnos pruebas ${stamp}`,
    businessUnitSlug: `turnos-pruebas-${stamp}`,
    businessUnitLegalName: `Turnos pruebas legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const role = await Role.create({
    roleName: `Turnos pruebas ${stamp}`,
    roleSlug: `turnos-pruebas-${stamp}`,
    roleDescription: 'Rol temporal para matriz de permisos',
    roleActive: 1,
    roleBusinessAccess: businessUnit.businessUnitSlug,
    roleManagementDays: 10,
  })
  const person = await Person.create({
    personFirstname: 'TurnosPermissionGate',
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
  const role = await Role.query()
    .whereNull('role_deleted_at')
    .where('role_slug', roleSlug)
    .firstOrFail()
  const businessUnit = await BusinessUnit.query()
    .whereNull('business_unit_deleted_at')
    .where('business_unit_active', 1)
    .firstOrFail()
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const person = await Person.create({
    personFirstname: 'TurnosSistema',
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
  return { user, person, businessUnit, roleId: role.roleId }
}

async function cleanupSystemActor(actor: SystemActor) {
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

async function snapshotAndClearEmployeesGrants(roleId: number) {
  const grants = await RoleSystemPermission.query()
    .where('role_id', roleId)
    .whereNull('role_system_permission_deleted_at')
    .whereHas('systemPermissions', (permissionQuery) =>
      permissionQuery.whereHas('systemModule', (moduleQuery) =>
        moduleQuery.where('system_module_slug', 'employees')
      )
    )
  for (const grant of grants) await grant.delete()
  return grants
}

async function restoreEmployeesGrants(grants: RoleSystemPermission[]) {
  for (const grant of grants) await grant.restore()
}

async function createEmployeeFixture(
  businessUnitId: number,
  prefix: string
): Promise<EmployeeFixture> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const now = new Date()
  const person = await Person.create({
    personFirstname: 'Empleado',
    personLastname: 'Turnos',
    personSecondLastname: prefix,
    personEmail: `empleado-turnos-${stamp}@gsti-tests.local`,
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
    employee_last_name: 'Turnos',
    employee_second_last_name: prefix,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    department_id: departmentId,
    position_id: positionId,
    person_id: person.personId,
    employee_type_id: 1,
    employee_work_schedule: 'Onsite',
    employee_business_email: `empleado-trabajo-${stamp}@gsti-tests.local`,
    employee_created_at: now,
  })
  const employeeId = Number(employeeInsert[0])
  const shiftInsert = await db.table('shifts').insert({
    shift_name: `Turno ${stamp}`,
    shift_alias: `T${stamp}`,
    shift_calculate_flag: 'daily',
    shift_day_start: 1,
    shift_time_start: '08:00:00',
    shift_active_hours: 8,
    shift_rest_days: '0,6',
    shift_accumulated_fault: 0,
    shift_business_units: String(businessUnitId),
    business_unit_id: businessUnitId,
    shift_temp: 0,
    shift_color: '#000000',
    shift_created_at: now,
    shift_updated_at: now,
  })
  const shiftId = Number(shiftInsert[0])
  return {
    employee: await Employee.findOrFail(employeeId),
    person,
    departmentId,
    positionId,
    shiftId,
  }
}

async function cleanupEmployeeFixture(fixture: EmployeeFixture | null) {
  if (!fixture) return
  const employeeId = fixture.employee.employeeId
  await db.from('employee_assist_calendars').where('employee_id', employeeId).delete()
  await db.from('vacation_deductions').where('employee_id', employeeId).delete()
  await db.from('exception_requests').where('employee_id', employeeId).delete()
  await db.from('shift_exceptions').where('employee_id', employeeId).delete()
  await db.from('employee_shifts').where('employee_id', employeeId).delete()
  await db.from('employees').where('employee_id', employeeId).delete()
  await db.from('shifts').where('shift_id', fixture.shiftId).delete()
  await db.from('positions').where('position_id', fixture.positionId).delete()
  await db.from('departments').where('department_id', fixture.departmentId).delete()
  await Person.query().where('person_id', fixture.person.personId).delete()
}

async function createFixtures(actor: TenantActor): Promise<TestFixtures> {
  const [absenceType, vacationType, vacationSetting] = await Promise.all([
    ExceptionType.query()
      .whereNull('exception_type_deleted_at')
      .where('exception_type_slug', 'absence-from-work')
      .firstOrFail(),
    ExceptionType.query()
      .whereNull('exception_type_deleted_at')
      .where('exception_type_slug', 'vacation')
      .firstOrFail(),
    VacationSetting.query().whereNull('vacation_setting_deleted_at').firstOrFail(),
  ])
  return {
    employee: await createEmployeeFixture(actor.businessUnit.businessUnitId, 'fixture'),
    absenceType,
    vacationType,
    vacationSetting,
  }
}

function shiftPayload(fixtures: TestFixtures) {
  return {
    employeeId: fixtures.employee.employee.employeeId,
    shiftId: fixtures.employee.shiftId,
    employeShiftsApplySince: '2030-01-06 08:00:00',
  }
}

function exceptionPayload(
  fixtures: TestFixtures,
  exceptionTypeId = fixtures.absenceType.exceptionTypeId
) {
  return {
    employeeId: fixtures.employee.employee.employeeId,
    exceptionTypeId,
    shiftExceptionsDescription: 'Prueba de matriz de permisos',
    shiftExceptionsDate: '2030-01-06',
    shiftExceptionEnjoymentOfSalary: 1,
    shiftExceptionTimeByTime: 0,
    vacationSettingId: fixtures.vacationSetting.vacationSettingId,
  }
}

function requestPayload(fixtures: TestFixtures) {
  return {
    employeeId: fixtures.employee.employee.employeeId,
    exceptionTypeId: fixtures.absenceType.exceptionTypeId,
    exceptionRequestStatus: 'requested',
    exceptionRequestDescription: 'Solicitud de prueba D-08',
    requestedDate: '2030-01-07',
  }
}

function assertNotPermissionDenied(assert: any, response: any) {
  assert.notEqual(response.body()?.key, 'PERM.DENIED')
  assert.notEqual(response.body()?.key, 'PERM.UNRESOLVED')
}

function assertPermissionDenied(assert: any, response: any) {
  assert.equal(response.status(), 403)
  assert.equal(response.body()?.key, 'PERM.DENIED')
  assert.equal(response.body()?.title, 'Sin permiso')
}

async function createCommonRequest(fixtures: TestFixtures, actor: TenantActor) {
  return ExceptionRequest.create({
    employeeId: fixtures.employee.employee.employeeId,
    exceptionTypeId: fixtures.absenceType.exceptionTypeId,
    exceptionRequestStatus: 'requested',
    exceptionRequestDescription: 'Solicitud común para aprobar',
    exceptionRequestCheckInTime: null,
    exceptionRequestCheckOutTime: null,
    exceptionRequestPeriodInHours: 0,
    requestedDate: '2030-02-01',
    exceptionRequestRhRead: 0,
    exceptionRequestGerencialRead: 0,
    userId: actor.user.userId,
  })
}

test.group('Turnos/Excepciones/Vacaciones — soft-rollout (exigencia OFF)', (group) => {
  let actor: TenantActor | null = null
  let fixtures: TestFixtures | null = null
  let employeesModule: SystemModule

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
    actor = await createActor('turnos-soft')
    fixtures = await createFixtures(actor)
  })

  group.teardown(async () => {
    try {
      await cleanupEmployeeFixture(fixtures?.employee ?? null)
      await cleanupActor(actor)
    } finally {
      employeesModule.systemModulePermissionEnforcementActive = false
      await employeesModule.save()
    }
  })

  test('sin grants: asignar turno no responde PERM.DENIED', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, [])
    const response = await client
      .post('/api/employee_shifts')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json(shiftPayload(fixtures!))
    assertNotPermissionDenied(assert, response)
  })

  test('sin grants: crear excepción común no responde PERM.DENIED', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, [])
    const response = await client
      .post('/api/shift-exception')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json(exceptionPayload(fixtures!))
    assertNotPermissionDenied(assert, response)
  })

  test('sin grants: POST /api/exception-requests (D-08) no responde PERM.DENIED', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    const response = await client
      .post('/api/exception-requests')
      .loginAs(actor!.user)
      .json(requestPayload(fixtures!))
    assertNotPermissionDenied(assert, response)
  })
})

test.group('Turnos/Excepciones/Vacaciones — matriz (exigencia ON)', (group) => {
  let actor: TenantActor | null = null
  let fixtures: TestFixtures | null = null
  let employeesModule: SystemModule

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = true
    await employeesModule.save()
    actor = await createActor('turnos-on')
    fixtures = await createFixtures(actor)
  })

  group.teardown(async () => {
    try {
      await cleanupEmployeeFixture(fixtures?.employee ?? null)
      await cleanupActor(actor)
    } finally {
      employeesModule.systemModulePermissionEnforcementActive = false
      await employeesModule.save()
    }
  })

  test('manage-shift permite asignar; sin él PERM.DENIED', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['manage-shift'])
    const allowed = await client
      .post('/api/employee_shifts')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json(shiftPayload(fixtures!))
    assertNotPermissionDenied(assert, allowed)
    await grantOnly(actor!.role.roleId, [])
    const denied = await client
      .post('/api/employee_shifts')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json(shiftPayload(fixtures!))
    assertPermissionDenied(assert, denied)
  })

  test('remove-shift-assigned-to-the-day es distinto de manage-shift', async ({
    client,
    assert,
  }) => {
    const assignment = await EmployeeShift.create({
      employeeId: fixtures!.employee.employee.employeeId,
      shiftId: fixtures!.employee.shiftId,
      employeShiftsApplySince: '2030-02-01',
    })
    await grantOnly(actor!.role.roleId, ['manage-shift'])
    const denied = await client
      .delete(`/api/employee_shifts/${assignment.employeeShiftId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
    assertPermissionDenied(assert, denied)
    await grantOnly(actor!.role.roleId, ['remove-shift-assigned-to-the-day'])
    const allowed = await client
      .delete(`/api/employee_shifts/${assignment.employeeShiftId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
    assertNotPermissionDenied(assert, allowed)
  })

  test('solicitar no es aprobar: exception-request no basta para status', async ({
    client,
    assert,
  }) => {
    const request = await createCommonRequest(fixtures!, actor!)
    await grantOnly(actor!.role.roleId, ['exception-request'])
    const denied = await client
      .post(`/api/exception-requests/${request.exceptionRequestId}/status`)
      .loginAs(actor!.user)
      .json({ status: 'accepted' })
    assertPermissionDenied(assert, denied)
    await grantOnly(actor!.role.roleId, ['add-exception'])
    const allowed = await client
      .post(`/api/exception-requests/${request.exceptionRequestId}/status`)
      .loginAs(actor!.user)
      .json({ status: 'accepted' })
    assertNotPermissionDenied(assert, allowed)
  })

  test('vacación exige manage-vacation además de add-exception', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['add-exception'])
    const denied = await client
      .post('/api/shift-exception')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json(exceptionPayload(fixtures!, fixtures!.vacationType.exceptionTypeId))
    assertPermissionDenied(assert, denied)
    await grantOnly(actor!.role.roleId, ['add-exception', 'manage-vacation'])
    const allowed = await client
      .post('/api/shift-exception')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json(exceptionPayload(fixtures!, fixtures!.vacationType.exceptionTypeId))
    assertNotPermissionDenied(assert, allowed)
  })

  test('edición ordinaria de excepción común no exige manage-vacation', async ({
    client,
    assert,
  }) => {
    const exception = await ShiftException.create({
      ...exceptionPayload(fixtures!),
      vacationSettingId: null,
    } as ShiftException)
    await grantOnly(actor!.role.roleId, ['add-exception'])
    const response = await client
      .put(`/api/shift-exception/${exception.shiftExceptionId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json(exceptionPayload(fixtures!))
    assertNotPermissionDenied(assert, response)
  })

  test('excepción masiva exige apply-exception-mass (no basta add-exception)', async ({
    client,
    assert,
  }) => {
    const payload = {
      ...exceptionPayload(fixtures!),
      employeeIds: [fixtures!.employee.employee.employeeId],
    }
    await grantOnly(actor!.role.roleId, ['add-exception'])
    const denied = await client
      .post('/api/shift-exception-apply-general')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json(payload)
    assertPermissionDenied(assert, denied)
    await grantOnly(actor!.role.roleId, ['apply-exception-mass'])
    const allowed = await client
      .post('/api/shift-exception-apply-general')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json(payload)
    assertNotPermissionDenied(assert, allowed)
  })

  test('deducción de vacaciones exige manage-vacation', async ({ client, assert }) => {
    const payload = {
      vacationSettingId: fixtures!.vacationSetting.vacationSettingId,
      vacationDeductionDays: 1,
      vacationDeductionDescription: 'Deducción de prueba',
    }
    await grantOnly(actor!.role.roleId, ['add-exception'])
    const denied = await client
      .post(`/api/employees/${fixtures!.employee.employee.employeeId}/vacation-deductions`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json(payload)
    assertPermissionDenied(assert, denied)
    await grantOnly(actor!.role.roleId, ['manage-vacation'])
    const allowed = await client
      .post(`/api/employees/${fixtures!.employee.employee.employeeId}/vacation-deductions`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json(payload)
    assertNotPermissionDenied(assert, allowed)
  })

  test('owner y root bypassean; super-administrador no', async ({ client, assert }) => {
    const owner = await createSystemActor('owner', 'turnos-owner')
    const root = await createSystemActor('root', 'turnos-root')
    const superAdmin = await createSystemActor('super-administrador', 'turnos-super-admin')
    let ownerGrants: RoleSystemPermission[] = []
    let rootGrants: RoleSystemPermission[] = []
    let superAdminGrants: RoleSystemPermission[] = []
    try {
      ownerGrants = await snapshotAndClearEmployeesGrants(owner.roleId)
      rootGrants = await snapshotAndClearEmployeesGrants(root.roleId)
      superAdminGrants = await snapshotAndClearEmployeesGrants(superAdmin.roleId)
      for (const systemActor of [owner, root]) {
        const response = await client
          .post('/api/employee_shifts')
          .loginAs(systemActor.user)
          .header('X-Business-Unit-Id', systemActor.businessUnit.businessUnitPublicId)
          .json({
            employeeId: 999999999,
            shiftId: 999999999,
            employeShiftsApplySince: '2030-01-01 08:00:00',
          })
        assertNotPermissionDenied(assert, response)
      }
      const denied = await client
        .post('/api/employee_shifts')
        .loginAs(superAdmin.user)
        .header('X-Business-Unit-Id', superAdmin.businessUnit.businessUnitPublicId)
        .json({
          employeeId: 999999999,
          shiftId: 999999999,
          employeShiftsApplySince: '2030-01-01 08:00:00',
        })
      assertPermissionDenied(assert, denied)
    } finally {
      await restoreEmployeesGrants(superAdminGrants)
      await restoreEmployeesGrants(rootGrants)
      await restoreEmployeesGrants(ownerGrants)
      await cleanupSystemActor(superAdmin)
      await cleanupSystemActor(root)
      await cleanupSystemActor(owner)
    }
  })

  test('D-08: alta de solicitud sigue sin PERM aunque exigencia ON y sin grants', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    const response = await client
      .post('/api/exception-requests')
      .loginAs(actor!.user)
      .json(requestPayload(fixtures!))
    assertNotPermissionDenied(assert, response)
  })
})
