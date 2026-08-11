import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
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
import Certification from '#models/certification'
import EmployeeCertification from '#models/employee_certification'
import EmployeeProceedingFile from '#models/employee_proceeding_file'
import EmployeeProceedingFileService from '#services/employee_proceeding_file_service'

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

async function createSystemActor(roleSlug: string, emailPrefix: string): Promise<SystemActor> {
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', roleSlug).firstOrFail()
  const businessUnit = await BusinessUnit.query()
    .whereNull('business_unit_deleted_at')
    .where('business_unit_active', 1)
    .firstOrFail()
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const person = await Person.create({
    personFirstname: 'ExpedienteCertificaciones',
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

async function countProceedingFilesForType(typeId: number): Promise<number> {
  const row = await db
    .from('proceeding_files')
    .whereNull('proceeding_file_deleted_at')
    .where('proceeding_file_type_id', typeId)
    .count('* as total')
    .first()
  return Number(row?.total ?? 0)
}

async function countCertificationUploads(
  employeeId: number,
  certificationId: number
): Promise<number> {
  const row = await db
    .from('employee_certifications')
    .whereNull('employee_certification_deleted_at')
    .where('employee_id', employeeId)
    .where('certification_id', certificationId)
    .count('* as total')
    .first()
  return Number(row?.total ?? 0)
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

test.group('Expediente/Certificaciones — PermissionGate exigencia ON', (group) => {
  let actor: TenantActor | null = null
  let fixture: EmployeeFixture | null = null
  let employeesModule: SystemModule
  let certificationCategory: CertificationCategory
  let employeeProceedingFileTypeId: number
  let aircraftProceedingFileTypeId: number
  let certificationId: number
  let employeeProceedingFileLinkId: number
  let currentUploadId: number
  let olderUploadId: number
  const createdProceedingFileTypeIds: number[] = []
  let createdProceedingFileId: number | null = null

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = true
    await employeesModule.save()

    actor = await createActor('employees-expediente-cert-on')
    fixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'on')
    certificationCategory = await ensureCertificationCategory()
    employeeProceedingFileTypeId = await createProceedingFileTypeForArea('employee')
    aircraftProceedingFileTypeId = await createProceedingFileTypeForArea('aircraft')
    createdProceedingFileTypeIds.push(employeeProceedingFileTypeId, aircraftProceedingFileTypeId)

    const certification = await Certification.create({
      categoryId: certificationCategory.certificationCategoryId,
      certificationName: `Cert ON ${Date.now()}`,
      isExternal: false,
      renewalPeriodDays: 365,
    })
    certificationId = certification.certificationId

    const now = new Date()
    const proceedingFileInsert = await db.table('proceeding_files').insert({
      proceeding_file_name: `link-on-${Date.now()}.pdf`,
      proceeding_file_path: `link-on-${Date.now()}.pdf`,
      proceeding_file_type_id: employeeProceedingFileTypeId,
      proceeding_file_active: 1,
      proceeding_file_uuid: `pf-on-${Date.now()}-${Math.floor(Math.random() * 100_000)}`,
      proceeding_file_created_at: now,
      proceeding_file_updated_at: now,
    })
    createdProceedingFileId = Number(proceedingFileInsert[0])

    const link = await new EmployeeProceedingFileService().create(
      Object.assign(new EmployeeProceedingFile(), {
        employeeId: fixture.employee.employeeId,
        proceedingFileId: createdProceedingFileId,
      })
    )
    if (!link) {
      throw new Error('No se pudo crear el vínculo employees-proceeding-files de la fixture ON.')
    }
    employeeProceedingFileLinkId = link.employeeProceedingFileId

    const olderUpload = new EmployeeCertification()
    olderUpload.employeeId = fixture.employee.employeeId
    olderUpload.certificationId = certificationId
    olderUpload.employeeCertificationCompliedAt = DateTime.fromISO('2026-06-01')
    await olderUpload.save()
    olderUploadId = olderUpload.employeeCertificationId

    const currentUpload = new EmployeeCertification()
    currentUpload.employeeId = fixture.employee.employeeId
    currentUpload.certificationId = certificationId
    currentUpload.employeeCertificationCompliedAt = DateTime.fromISO('2026-07-01')
    await currentUpload.save()
    currentUploadId = currentUpload.employeeCertificationId
  })

  group.teardown(async () => {
    let enforcementLeftDisabled = false
    try {
      await db
        .from('employee_certifications')
        .whereIn('employee_certification_id', [currentUploadId, olderUploadId])
        .delete()
      await db
        .from('employee_proceeding_files')
        .where('employee_proceeding_file_id', employeeProceedingFileLinkId)
        .delete()
      if (createdProceedingFileId) {
        await db.from('proceeding_files').where('proceeding_file_id', createdProceedingFileId).delete()
      }
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
      await db.from('business_unit_certifications').where('certification_id', certificationId).delete()
      await db.from('certifications').where('certification_id', certificationId).delete()
      await cleanupEmployeeFixture(fixture)
      await cleanupActor(actor)
    } finally {
      // Si el cleanup arriba lanza, esta rama corre igual pero NO relanza: la excepción
      // original del cleanup sigue propagándose y el throw de abajo nunca se alcanza,
      // preservando el error original en vez de enmascararlo (evita no-unsafe-finally).
      employeesModule.systemModulePermissionEnforcementActive = false
      await employeesModule.save()
      const moduleAfterTeardown = await SystemModule.findOrFail(employeesModule.systemModuleId)
      enforcementLeftDisabled = moduleAfterTeardown.systemModulePermissionEnforcementActive === false
    }
    if (!enforcementLeftDisabled) {
      throw new Error('La exigencia de permisos de empleados debe quedar apagada tras el suite.')
    }
  })

  test('con tab-expediente-write, POST proceeding-files área employee no responde PERM.DENIED', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-expediente-write'])
    const response = await client
      .post('/api/proceeding-files')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .file('file', VALID_PDF_BUFFER, {
        filename: 'with-write.pdf',
        contentType: 'application/pdf',
      })
      .field('proceedingFileTypeId', String(employeeProceedingFileTypeId))
      .field('proceedingFileName', 'with-write.pdf')
      .field('proceedingFileActive', 'true')
    assert.notEqual(response.body()?.key, 'PERM.DENIED')
    assert.notEqual(response.body()?.key, 'PERM.UNRESOLVED')
  })

  test('sin tab-expediente-write, POST proceeding-files área employee → PERM.DENIED y no crea registro', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    const before = await countProceedingFilesForType(employeeProceedingFileTypeId)
    const response = await client
      .post('/api/proceeding-files')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .file('file', VALID_PDF_BUFFER, {
        filename: 'denied.pdf',
        contentType: 'application/pdf',
      })
      .field('proceedingFileTypeId', String(employeeProceedingFileTypeId))
      .field('proceedingFileName', 'denied.pdf')
      .field('proceedingFileActive', 'true')
    assert.equal(response.status(), 403)
    assert.equal(response.body()?.key, 'PERM.DENIED')
    const after = await countProceedingFilesForType(employeeProceedingFileTypeId)
    assert.equal(after, before)
  })

  test('POST proceeding-files área aircraft sin permiso de expediente no responde PERM.DENIED', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    const response = await client
      .post('/api/proceeding-files')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .file('file', VALID_PDF_BUFFER, {
        filename: 'aircraft.pdf',
        contentType: 'application/pdf',
      })
      .field('proceedingFileTypeId', String(aircraftProceedingFileTypeId))
      .field('proceedingFileName', 'aircraft.pdf')
      .field('proceedingFileActive', 'true')
    assert.notEqual(response.body()?.key, 'PERM.DENIED')
  })

  test('con write sin delete, DELETE employees-proceeding-files → PERM.DENIED y el vínculo permanece', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-expediente-write'])
    const response = await client
      .delete(`/api/employees-proceeding-files/${employeeProceedingFileLinkId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
    assert.equal(response.status(), 403)
    assert.equal(response.body()?.key, 'PERM.DENIED')
    const stillThere = await db
      .from('employee_proceeding_files')
      .whereNull('employee_proceeding_file_deleted_at')
      .where('employee_proceeding_file_id', employeeProceedingFileLinkId)
      .first()
    assert.isNotNull(stillThere)
  })

  test('sin tab-certificaciones-write, POST upload de cumplimiento → PERM.DENIED', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    const before = await countCertificationUploads(
      fixture!.employee.employeeId,
      certificationId
    )
    const response = await client
      .post(
        `/api/employees/${fixture!.employee.employeeId}/certifications/${certificationId}/uploads`
      )
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .file('file', VALID_PDF_BUFFER, {
        filename: 'cert-denied.pdf',
        contentType: 'application/pdf',
      })
      .field('compliedAt', '2026-08-01')
    assert.equal(response.status(), 403)
    assert.equal(response.body()?.key, 'PERM.DENIED')
    const after = await countCertificationUploads(fixture!.employee.employeeId, certificationId)
    assert.equal(after, before)
  })

  test('sin tab-certificaciones-delete, DELETE upload → PERM.DENIED; historial intacto', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-certificaciones-write'])
    const before = await countCertificationUploads(
      fixture!.employee.employeeId,
      certificationId
    )
    const response = await client
      .delete(
        `/api/employees/${fixture!.employee.employeeId}/certifications/${certificationId}/uploads/${currentUploadId}`
      )
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
    assert.equal(response.status(), 403)
    assert.equal(response.body()?.key, 'PERM.DENIED')
    const after = await countCertificationUploads(fixture!.employee.employeeId, certificationId)
    assert.equal(after, before)
  })

  test('con delete, borrar cumplimiento no reciente conserva el aviso propio (no PERM.*)', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [
      'tab-certificaciones-write',
      'tab-certificaciones-delete',
    ])
    const response = await client
      .delete(
        `/api/employees/${fixture!.employee.employeeId}/certifications/${certificationId}/uploads/${olderUploadId}`
      )
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
    assert.notEqual(response.body()?.key, 'PERM.DENIED')
    assert.notEqual(response.body()?.key, 'PERM.UNRESOLVED')
    // El servicio responde el aviso de negocio (código EC_* / mensaje
    // "Solo se puede borrar el cumplimiento más reciente.").
    assert.match(JSON.stringify(response.body()), /más reciente/i)
  })

  test('owner y root evaden el gate estándar sin grants', async ({ client, assert }) => {
    const owner = await createSystemActor('owner', 'employees-expediente-owner')
    const root = await createSystemActor('root', 'employees-expediente-root')
    let ownerGrants: RoleSystemPermission[] = []
    let rootGrants: RoleSystemPermission[] = []
    try {
      ownerGrants = await snapshotAndClearEmployeesGrants(owner.roleId)
      rootGrants = await snapshotAndClearEmployeesGrants(root.roleId)
      for (const systemActor of [owner, root]) {
        const response = await client
          .post('/api/certifications')
          .loginAs(systemActor.user)
          .json({
            name: `Cert bypass ${systemActor.user.userEmail}`,
            categoryId: certificationCategory.certificationCategoryId,
            isExternal: false,
            renewalPeriodDays: 365,
            businessUnitIds: [systemActor.businessUnit.businessUnitId],
          })
        assert.notEqual(response.body()?.key, 'PERM.DENIED')
      }
    } finally {
      await restoreEmployeesGrants(ownerGrants)
      await restoreEmployeesGrants(rootGrants)
      await cleanupSystemActor(root)
      await cleanupSystemActor(owner)
    }
  })
})
