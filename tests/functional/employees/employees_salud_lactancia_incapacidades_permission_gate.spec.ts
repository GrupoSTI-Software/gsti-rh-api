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
import MedicalConditionType from '#models/medical_condition_type'
import InsuranceCoverageType from '#models/insurance_coverage_type'
import EmployeeMedicalCondition from '#models/employee_medical_condition'
import WorkDisability from '#models/work_disability'
import { TenantContext } from '#utils/tenant_context'

const TEST_PASSWORD = 'EmployeesSaludLactanciaIncapSoftRollout123!'

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
  roleId: number
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
    businessUnitName: `Salud Lactancia Incap ${stamp}`,
    businessUnitSlug: `salud-lactancia-incap-${stamp}`,
    businessUnitLegalName: `Salud Lactancia Incap Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const role = await Role.create({
    roleName: `Salud Lactancia Incap ${stamp}`,
    roleSlug: `salud-lactancia-incap-${stamp}`,
    roleDescription: 'Rol temporal sin permisos de sección',
    roleActive: 1,
    roleBusinessAccess: businessUnit.businessUnitSlug,
    roleManagementDays: 10,
  })
  const person = await Person.create({
    personFirstname: 'SaludSoftRollout',
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
    personFirstname: 'SaludLactanciaIncap',
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
  return { user, person, businessUnit, roleId: role.roleId }
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
  for (const grant of grants) {
    await grant.delete()
  }
  return grants
}

async function restoreEmployeesGrants(grants: RoleSystemPermission[]) {
  for (const grant of grants) {
    await grant.restore()
  }
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
  await db
    .from('employee_lactation_periods')
    .where('employee_id', fixture.employee.employeeId)
    .delete()
  await db
    .from('employee_medical_conditions')
    .where('employee_id', fixture.employee.employeeId)
    .delete()
  await db.from('work_disabilities').where('employee_id', fixture.employee.employeeId).delete()
  await Employee.query().where('employee_id', fixture.employee.employeeId).delete()
  await db.from('positions').where('position_id', fixture.positionId).delete()
  await db.from('departments').where('department_id', fixture.departmentId).delete()
  await Person.query().where('person_id', fixture.person.personId).delete()
}

test.group('Salud/Lactancia/Incapacidades — PermissionGate soft-rollout', (group) => {
  let employeesModule: SystemModule
  let actor: TenantActor | null = null
  let fixture: EmployeeFixture | null = null
  let medicalConditionType: MedicalConditionType | null = null

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
    actor = await createActor('employees-salud-lactancia-incap')
    await grantOnly(actor.role.roleId, [])
    fixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'soft-rollout')
    medicalConditionType = await TenantContext.run(
      [actor.businessUnit.businessUnitId],
      async () => {
        const type = new MedicalConditionType()
        type.medicalConditionTypeName = `TEST-MCT-SOFT-${Date.now()}`
        type.medicalConditionTypeDescription = 'fixture soft-rollout'
        type.medicalConditionTypeActive = 1
        await type.save()
        return type
      }
    )
  })

  group.teardown(async () => {
    let enforcementLeftDisabled = false
    try {
      if (medicalConditionType) {
        await TenantContext.runUnscoped(async () => {
          await MedicalConditionType.query()
            .where('medicalConditionTypeId', medicalConditionType!.medicalConditionTypeId)
            .delete()
        }, 'limpieza tipo condición médica soft-rollout')
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

  test('con exigencia apagada, POST condición médica no responde PERM.DENIED', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/employee-medical-conditions')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json({
        employeeId: fixture!.employee.employeeId,
        medicalConditionTypeId: medicalConditionType!.medicalConditionTypeId,
        employeeMedicalConditionDiagnosis: 'Soft rollout diagnosis',
      })

    assert.notEqual(response.body()?.key, 'PERM.DENIED')
    assert.notEqual(response.body()?.key, 'PERM.UNRESOLVED')
  })

  test('con exigencia apagada, POST incapacidad no responde PERM.DENIED', async ({
    client,
    assert,
  }) => {
    const coverage = await InsuranceCoverageType.query()
      .whereNull('insurance_coverage_type_deleted_at')
      .firstOrFail()
    const response = await client
      .post('/api/work-disabilities')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json({
        employeeId: fixture!.employee.employeeId,
        insuranceCoverageTypeId: coverage.insuranceCoverageTypeId,
      })

    assert.notEqual(response.body()?.key, 'PERM.DENIED')
    assert.notEqual(response.body()?.key, 'PERM.UNRESOLVED')
  })

  test('con exigencia apagada y con update-information, POST lactancia no responde PERM.DENIED', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['update-information'])
    const response = await client
      .post('/api/employee-lactation-periods')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json({
        employeeId: fixture!.employee.employeeId,
        employeeLactationPeriodStartDate: '2026-01-01',
        employeeLactationPeriodEndDate: '2026-08-01',
        employeeLactationPeriodType: 'reduced_hour',
      })

    assert.notEqual(response.body()?.key, 'PERM.DENIED')
    assert.notEqual(response.body()?.key, 'PERM.UNRESOLVED')
  })

  test('con exigencia apagada y sin update-information, lactancia sigue respondiendo sin-permiso legacy', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    const response = await client
      .post('/api/employee-lactation-periods')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json({
        employeeId: fixture!.employee.employeeId,
        employeeLactationPeriodStartDate: '2026-01-01',
        employeeLactationPeriodEndDate: '2026-08-01',
        employeeLactationPeriodType: 'reduced_hour',
      })

    assert.equal(response.status(), 403)
    assert.equal(response.body()?.key, 'sin-permiso')
  })
})

test.group('Salud/Lactancia/Incapacidades — PermissionGate exigencia ON', (group) => {
  let employeesModule: SystemModule
  let actor: TenantActor | null = null
  let fixture: EmployeeFixture | null = null
  let medicalConditionType: MedicalConditionType | null = null

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = true
    await employeesModule.save()
    actor = await createActor('employees-salud-lactancia-incap-enforced')
    fixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'enforced')
    medicalConditionType = await TenantContext.run(
      [actor.businessUnit.businessUnitId],
      async () => {
        const type = new MedicalConditionType()
        type.medicalConditionTypeName = `TEST-MCT-ON-${Date.now()}`
        type.medicalConditionTypeDescription = 'fixture exigencia ON'
        type.medicalConditionTypeActive = 1
        await type.save()
        return type
      }
    )
  })

  group.teardown(async () => {
    let enforcementLeftDisabled = false
    try {
      if (medicalConditionType) {
        await TenantContext.runUnscoped(async () => {
          await MedicalConditionType.query()
            .where('medicalConditionTypeId', medicalConditionType!.medicalConditionTypeId)
            .delete()
        }, 'limpieza tipo condición médica exigencia ON')
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

  test('sin tab-condicion-medica-write, POST condición médica → PERM.DENIED', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['update-information'])
    const response = await client
      .post('/api/employee-medical-conditions')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json({
        employeeId: fixture!.employee.employeeId,
        medicalConditionTypeId: medicalConditionType!.medicalConditionTypeId,
        employeeMedicalConditionDiagnosis: 'Denied',
      })
    assert.equal(response.status(), 403)
    assert.equal(response.body()?.key, 'PERM.DENIED')
  })

  test('con write sin delete, DELETE condición médica → PERM.DENIED y el registro permanece', async ({
    client,
    assert,
  }) => {
    const condition = await EmployeeMedicalCondition.create({
      employeeId: fixture!.employee.employeeId,
      medicalConditionTypeId: medicalConditionType!.medicalConditionTypeId,
      employeeMedicalConditionDiagnosis: 'Solo write',
      employeeMedicalConditionActive: 1,
    })
    await grantOnly(actor!.role.roleId, ['tab-condicion-medica-write'])
    const response = await client
      .delete(`/api/employee-medical-conditions/${condition.employeeMedicalConditionId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
    assert.equal(response.status(), 403)
    assert.equal(response.body()?.key, 'PERM.DENIED')
    assert.isNotNull(
      await EmployeeMedicalCondition.query()
        .where('employee_medical_condition_id', condition.employeeMedicalConditionId)
        .whereNull('employee_medical_condition_deleted_at')
        .first()
    )
  })

  test('con manage-work-disabilities, DELETE incapacidad no responde PERM.DENIED', async ({
    client,
    assert,
  }) => {
    const coverage = await InsuranceCoverageType.query()
      .whereNull('insurance_coverage_type_deleted_at')
      .firstOrFail()
    const disability = new WorkDisability()
    disability.workDisabilityUuid = `test-wd-pg-${Date.now()}`
    disability.employeeId = fixture!.employee.employeeId
    disability.insuranceCoverageTypeId = coverage.insuranceCoverageTypeId
    await disability.save()
    await grantOnly(actor!.role.roleId, ['manage-work-disabilities'])
    const response = await client
      .delete(`/api/work-disabilities/${disability.workDisabilityId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
    assert.notEqual(response.body()?.key, 'PERM.DENIED')
  })

  test('sin manage-work-disabilities, POST y DELETE incapacidad → PERM.DENIED', async ({
    client,
    assert,
  }) => {
    const coverage = await InsuranceCoverageType.query()
      .whereNull('insurance_coverage_type_deleted_at')
      .firstOrFail()
    await grantOnly(actor!.role.roleId, ['update-information'])
    const create = await client
      .post('/api/work-disabilities')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json({
        employeeId: fixture!.employee.employeeId,
        insuranceCoverageTypeId: coverage.insuranceCoverageTypeId,
      })
    assert.equal(create.status(), 403)
    assert.equal(create.body()?.key, 'PERM.DENIED')

    const disability = new WorkDisability()
    disability.workDisabilityUuid = `test-wd-pg-del-${Date.now()}`
    disability.employeeId = fixture!.employee.employeeId
    disability.insuranceCoverageTypeId = coverage.insuranceCoverageTypeId
    await disability.save()
    const del = await client
      .delete(`/api/work-disabilities/${disability.workDisabilityId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
    assert.equal(del.status(), 403)
    assert.equal(del.body()?.key, 'PERM.DENIED')
  })

  test('lactancia: solo permiso nuevo sin update-information → mensaje legacy sin-permiso', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-periodos-lactancia-write'])
    const response = await client
      .post('/api/employee-lactation-periods')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json({
        employeeId: fixture!.employee.employeeId,
        employeeLactationPeriodStartDate: '2026-01-01',
        employeeLactationPeriodEndDate: '2026-08-01',
        employeeLactationPeriodType: 'reduced_hour',
      })
    assert.equal(response.status(), 403)
    assert.equal(response.body()?.key, 'sin-permiso')
  })

  test('lactancia: solo update-information sin permiso nuevo → PERM.DENIED', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['update-information'])
    const response = await client
      .post('/api/employee-lactation-periods')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json({
        employeeId: fixture!.employee.employeeId,
        employeeLactationPeriodStartDate: '2026-01-01',
        employeeLactationPeriodEndDate: '2026-08-01',
        employeeLactationPeriodType: 'reduced_hour',
      })
    assert.equal(response.status(), 403)
    assert.equal(response.body()?.key, 'PERM.DENIED')
  })

  test('lactancia: ambas autorizaciones permiten alta', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['update-information', 'tab-periodos-lactancia-write'])
    const response = await client
      .post('/api/employee-lactation-periods')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json({
        employeeId: fixture!.employee.employeeId,
        employeeLactationPeriodStartDate: '2026-01-01',
        employeeLactationPeriodEndDate: '2026-08-01',
        employeeLactationPeriodType: 'reduced_hour',
      })
    assert.notEqual(response.body()?.key, 'PERM.DENIED')
    assert.notEqual(response.body()?.key, 'sin-permiso')
  })

  test('disparo manual de aviso exige tab-periodos-lactancia-write', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['update-information'])
    const response = await client
      .post('/api/employee-lactation-periods/notifications/run-expiring-check')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
    assert.equal(response.status(), 403)
    assert.equal(response.body()?.key, 'PERM.DENIED')
  })

  test('owner evade el gate y super-administrador no', async ({ client, assert }) => {
    const owner = await createSystemActor('owner', 'employees-salud-owner')
    const superAdmin = await createSystemActor('super-administrador', 'employees-salud-super-admin')
    let ownerGrants: RoleSystemPermission[] = []
    let superAdminGrants: RoleSystemPermission[] = []
    try {
      ownerGrants = await snapshotAndClearEmployeesGrants(owner.roleId)
      superAdminGrants = await snapshotAndClearEmployeesGrants(superAdmin.roleId)
      const ownerResponse = await client
        .post('/api/employee-medical-conditions')
        .loginAs(owner.user)
        .header('X-Business-Unit-Id', owner.businessUnit.businessUnitPublicId)
        .json({
          employeeId: fixture!.employee.employeeId,
          medicalConditionTypeId: medicalConditionType!.medicalConditionTypeId,
          employeeMedicalConditionDiagnosis: 'Owner bypass',
        })
      assert.notEqual(ownerResponse.body()?.key, 'PERM.DENIED')

      const superAdminResponse = await client
        .post('/api/employee-medical-conditions')
        .loginAs(superAdmin.user)
        .header('X-Business-Unit-Id', superAdmin.businessUnit.businessUnitPublicId)
        .json({
          employeeId: fixture!.employee.employeeId,
          medicalConditionTypeId: medicalConditionType!.medicalConditionTypeId,
          employeeMedicalConditionDiagnosis: 'DG denied',
        })
      assert.equal(superAdminResponse.status(), 403)
      assert.equal(superAdminResponse.body()?.key, 'PERM.DENIED')
    } finally {
      await restoreEmployeesGrants(ownerGrants)
      await restoreEmployeesGrants(superAdminGrants)
      await cleanupSystemActor(owner)
      await cleanupSystemActor(superAdmin)
    }
  })

  test('GET condición médica e incapacidades por employeeId no responden PERM.DENIED sin grants', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    const medical = await client
      .get(`/api/employee-medical-conditions/employee/${fixture!.employee.employeeId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
    const disabilities = await client
      .get(`/api/work-disabilities/employee/${fixture!.employee.employeeId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
    assert.notEqual(medical.body()?.key, 'PERM.DENIED')
    assert.notEqual(disabilities.body()?.key, 'PERM.DENIED')
  })
})
