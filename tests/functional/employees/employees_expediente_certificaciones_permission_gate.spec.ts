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
import EmployeeRecordProperty from '#models/employee_record_property'
import CertificationCategory from '#models/certification_category'

const TEST_PASSWORD = 'EmployeesExpedienteCertificacionesSoftRollout123!'

/** PDF mínimo válido (header %PDF). */
const VALID_PDF_BUFFER = Buffer.from(
  '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n',
  'utf8'
)

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
    businessUnitName: `Expediente Certificaciones ${stamp}`,
    businessUnitSlug: `expediente-certificaciones-${stamp}`,
    businessUnitLegalName: `Expediente Certificaciones Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const role = await Role.create({
    roleName: `Expediente Certificaciones ${stamp}`,
    roleSlug: `expediente-certificaciones-${stamp}`,
    roleDescription: 'Rol temporal sin permisos de sección',
    roleActive: 1,
    roleBusinessAccess: businessUnit.businessUnitSlug,
    roleManagementDays: 10,
  })
  const person = await Person.create({
    personFirstname: 'ExpedienteSoftRollout',
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
  await db.from('employee_records').where('employee_id', fixture.employee.employeeId).delete()
  await Employee.query().where('employee_id', fixture.employee.employeeId).delete()
  await db.from('positions').where('position_id', fixture.positionId).delete()
  await db.from('departments').where('department_id', fixture.departmentId).delete()
  await Person.query().where('person_id', fixture.person.personId).delete()
}

async function ensureEmployeeRecordProperty(): Promise<EmployeeRecordProperty> {
  const existing = await EmployeeRecordProperty.query()
    .whereNull('employee_record_property_deleted_at')
    .where('employee_record_property_type', 'Text')
    .first()
  if (existing) return existing
  return EmployeeRecordProperty.create({
    employeeRecordPropertyName: `Prop soft ${Date.now()}`,
    employeeRecordPropertyType: 'Text',
    employeeRecordPropertyCategoryName: 'Expediente soft-rollout',
  })
}

async function ensureCertificationCategory(): Promise<CertificationCategory> {
  const existing = await CertificationCategory.query()
    .where('certification_category_is_active', 1)
    .first()
  if (existing) return existing
  return CertificationCategory.create({
    certificationCategoryName: `Cat soft ${Date.now()}`,
    certificationCategoryKey: `cat-soft-${Date.now()}`,
    certificationCategoryIsActive: 1,
    certificationCategoryDisplayOrder: 999,
  })
}

async function createProceedingFileTypeForArea(area: string): Promise<number> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const now = new Date()
  const insert = await db.table('proceeding_file_types').insert({
    proceeding_file_type_name: `PFType ${area} ${stamp}`,
    proceeding_file_type_slug: `pftype-${area}-${stamp}`,
    proceeding_file_type_area_to_use: area,
    proceeding_file_type_active: 1,
    proceeding_file_type_created_at: now,
    proceeding_file_type_updated_at: now,
  })
  return Number(insert[0])
}

test.group('Expediente/Certificaciones — PermissionGate soft-rollout', (group) => {
  let actor: TenantActor | null = null
  let fixture: EmployeeFixture | null = null
  let employeesModule: SystemModule
  let recordProperty: EmployeeRecordProperty
  let certificationCategory: CertificationCategory
  let employeeProceedingFileTypeId: number
  const createdProceedingFileTypeIds: number[] = []
  let createdCertificationId: number | null = null

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    if (employeesModule.systemModulePermissionEnforcementActive) {
      throw new Error('Este suite de soft-rollout exige el interruptor del módulo apagado.')
    }
    actor = await createActor('employees-expediente-cert-soft')
    fixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'soft')
    recordProperty = await ensureEmployeeRecordProperty()
    certificationCategory = await ensureCertificationCategory()
    employeeProceedingFileTypeId = await createProceedingFileTypeForArea('employee')
    createdProceedingFileTypeIds.push(employeeProceedingFileTypeId)
  })

  group.teardown(async () => {
    let enforcementLeftDisabled = false
    try {
      if (createdProceedingFileTypeIds.length) {
        await db
          .from('proceeding_files')
          .whereIn('proceeding_file_type_id', createdProceedingFileTypeIds)
          .delete()
        await db
          .from('proceeding_file_types')
          .whereIn('proceeding_file_type_id', createdProceedingFileTypeIds)
          .delete()
      }
      if (createdCertificationId) {
        await db
          .from('business_unit_certifications')
          .where('certification_id', createdCertificationId)
          .delete()
        await db.from('certifications').where('certification_id', createdCertificationId).delete()
      }
      await cleanupEmployeeFixture(fixture)
      await cleanupActor(actor)
    } finally {
      // Si el cleanup arriba lanza, esta rama corre igual pero NO relanza: la excepción
      // original del cleanup sigue propagándose y el throw de abajo nunca se alcanza,
      // preservando el error original en vez de enmascararlo (evita no-unsafe-finally).
      const moduleAfterTeardown = await SystemModule.findOrFail(employeesModule.systemModuleId)
      enforcementLeftDisabled = moduleAfterTeardown.systemModulePermissionEnforcementActive === false
    }
    if (!enforcementLeftDisabled) {
      throw new Error('La exigencia de permisos de empleados debe quedar apagada tras el suite.')
    }
  })

  test('con exigencia apagada, POST employee-records no responde PERM.DENIED', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    const response = await client
      .post('/api/employee-records')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json({
        employeeId: fixture!.employee.employeeId,
        employeeRecordPropertyId: recordProperty.employeeRecordPropertyId,
        employeeRecordValue: 'soft-rollout',
        employeeRecordActive: true,
      })
    assert.notEqual(response.body()?.key, 'PERM.DENIED')
    assert.notEqual(response.body()?.key, 'PERM.UNRESOLVED')
  })

  test('con exigencia apagada, POST certifications no responde PERM.DENIED', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    const response = await client.post('/api/certifications').loginAs(actor!.user).json({
      name: `Cert soft ${Date.now()}`,
      categoryId: certificationCategory.certificationCategoryId,
      isExternal: false,
      renewalPeriodDays: 365,
      businessUnitIds: [actor!.businessUnit.businessUnitId],
    })
    createdCertificationId = response.body()?.data?.certification?.id ?? null
    assert.notEqual(response.body()?.key, 'PERM.DENIED')
    assert.notEqual(response.body()?.key, 'PERM.UNRESOLVED')
  })

  test('con exigencia apagada, POST proceeding-files área employee no responde PERM.DENIED', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    const response = await client
      .post('/api/proceeding-files')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .file('file', VALID_PDF_BUFFER, {
        filename: 'soft-rollout.pdf',
        contentType: 'application/pdf',
      })
      .field('proceedingFileTypeId', String(employeeProceedingFileTypeId))
      .field('proceedingFileName', 'soft-rollout.pdf')
      .field('proceedingFileActive', 'true')
    assert.notEqual(response.body()?.key, 'PERM.DENIED')
    assert.notEqual(response.body()?.key, 'PERM.UNRESOLVED')
  })
})
