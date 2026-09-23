import { Readable } from 'node:stream'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import EmployeeBiometricFaceId from '#models/employee_biometric_face_id'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import UploadService from '#services/upload_service'
import PiiAccessLogService from '#services/pii_access_log_service'
import {
  cleanupRevealLogs,
  countRevealLogSubjects,
  countRevealLogs,
  lastRevealLog,
} from '../pii/pii_permission_gate_support.js'
import { opaqueEmployeeSlug } from '#tests/helpers/employee_fixture'

const TEST_PASSWORD = 'BiometricFacePhotoStream123!'
const FAKE_IMAGE = Buffer.from('fake-biometric-photo-stream-bytes')

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

async function uniqueStamp() {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
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
  const stamp = await uniqueStamp()
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Bio stream ${stamp}`,
    businessUnitSlug: `bio-stream-${stamp}`,
    businessUnitLegalName: `Bio stream legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const role = await Role.create({
    roleName: `Bio stream ${stamp}`,
    roleSlug: `bio-stream-${stamp}`,
    roleDescription: 'Rol temporal para stream de foto biométrica',
    roleActive: 1,
    businessUnitId: businessUnit.businessUnitId,
    roleManagementDays: 10,
  })
  const person = await Person.create({
    personFirstname: 'BioStream',
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
  await cleanupRevealLogs({ userId: actor.user.userId })
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await RoleSystemPermission.query().where('role_id', actor.role.roleId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await Role.query().where('role_id', actor.role.roleId).delete()
  await BusinessUnit.query().where('business_unit_id', actor.businessUnit.businessUnitId).delete()
}

async function createEmployeeFixture(businessUnitId: number, prefix: string): Promise<EmployeeFixture> {
  const stamp = await uniqueStamp()
  const now = new Date()
  const person = await Person.create({
    personFirstname: 'Empleado',
    personLastname: 'BioStream',
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
    employee_slug: opaqueEmployeeSlug(),
    employee_sync_id: `EMP-${stamp}`,
    employee_code: `EMP-${stamp}`,
    employee_first_name: 'Empleado',
    employee_last_name: 'BioStream',
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
  const employeeId = fixture.employee.employeeId
  await db.from('employee_biometric_face_ids').where('employee_id', employeeId).delete()
  await Employee.query().where('employee_id', employeeId).delete()
  await db.from('positions').where('position_id', fixture.positionId).delete()
  await db.from('departments').where('department_id', fixture.departmentId).delete()
  await Person.query().where('person_id', fixture.person.personId).delete()
}

async function createFaceIdFixture(employeeId: number, businessUnitId: number, tokenSuffix: string) {
  return EmployeeBiometricFaceId.create({
    employeeId,
    businessUnitId,
    employeeBiometricFaceIdPhotoUrl: `employee-biometric-faces/test-${tokenSuffix}.png`,
    employeeBiometricFaceIdToken: `face-token-${tokenSuffix}`,
  })
}

function buHeader(actor: TenantActor) {
  return { 'X-Business-Unit-Id': actor.businessUnit.businessUnitPublicId }
}

test.group('Employee biometric face photo stream', (group) => {
  let actor: TenantActor | null = null
  let otherActor: TenantActor | null = null
  let fixture: EmployeeFixture | null = null
  let otherFixture: EmployeeFixture | null = null
  let employeesModule: SystemModule
  let originalGetObjectStream: typeof UploadService.prototype.getObjectStream

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = true
    await employeesModule.save()

    originalGetObjectStream = UploadService.prototype.getObjectStream
    UploadService.prototype.getObjectStream = async () => ({
      stream: Readable.from([FAKE_IMAGE]),
      contentType: 'image/jpeg',
      contentLength: FAKE_IMAGE.length,
      etag: 'test-etag',
      lastModified: new Date(),
    })

    actor = await createActor('bio-stream')
    otherActor = await createActor('bio-stream-other')
    fixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'stream')
    otherFixture = await createEmployeeFixture(otherActor.businessUnit.businessUnitId, 'other-bu')
  })

  group.teardown(async () => {
    try {
      UploadService.prototype.getObjectStream = originalGetObjectStream
      if (actor) {
        await cleanupRevealLogs({ userId: actor.user.userId })
      }
      if (otherActor) {
        await cleanupRevealLogs({ userId: otherActor.user.userId })
      }
      await cleanupEmployeeFixture(fixture)
      await cleanupEmployeeFixture(otherFixture)
      await cleanupActor(actor)
      await cleanupActor(otherActor)
    } finally {
      employeesModule.systemModulePermissionEnforcementActive = true
      await employeesModule.save()
    }
  })

  test('CA-1 — stream 200 escribe asiento con titular y originModule', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['tab-biometricos-read'])
    const face = await createFaceIdFixture(
      fixture!.employee.employeeId,
      actor!.businessUnit.businessUnitId,
      'stream-200'
    )
    const recordId = face.employeeBiometricFaceIdId
    const before = await countRevealLogs(
      'EmployeeBiometricFaceId',
      'employeeBiometricFaceIdPhotoUrl',
      recordId
    )

    const response = await client
      .get(`/api/employees/${fixture!.employee.employeeId}/biometric-face-id-photo`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
      .header('X-Origin-Module', 'employees')

    response.assertStatus(200)
    response.assertHeader('content-type', 'image/jpeg')
    assert.equal(await countRevealLogs(
      'EmployeeBiometricFaceId',
      'employeeBiometricFaceIdPhotoUrl',
      recordId
    ), before + 1)

    const log = await lastRevealLog(
      'EmployeeBiometricFaceId',
      'employeeBiometricFaceIdPhotoUrl',
      recordId
    )
    assert.isNotNull(log)
    assert.equal(log!.originModule, 'employees')
    assert.equal(await countRevealLogSubjects(log!.piiAccessLogId), 1)

    const subject = await db
      .from('pii_access_log_subjects')
      .where('pii_access_log_id', log!.piiAccessLogId)
      .first()
    assert.equal(Number(subject?.employee_id), fixture!.employee.employeeId)
  })

  test('CA-2 — sin tab-biometricos-read responde 403 sin asiento', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['sensitive-biometrico-read'])
    const face = await createFaceIdFixture(
      fixture!.employee.employeeId,
      actor!.businessUnit.businessUnitId,
      'stream-403'
    )
    const recordId = face.employeeBiometricFaceIdId
    const before = await countRevealLogs(
      'EmployeeBiometricFaceId',
      'employeeBiometricFaceIdPhotoUrl',
      recordId
    )

    const response = await client
      .get(`/api/employees/${fixture!.employee.employeeId}/biometric-face-id-photo`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))

    response.assertStatus(403)
    assert.equal(await countRevealLogs(
      'EmployeeBiometricFaceId',
      'employeeBiometricFaceIdPhotoUrl',
      recordId
    ), before)
  })

  test('CA-3 — empleado de otra unidad responde 404', async ({ client }) => {
    await grantOnly(actor!.role.roleId, ['tab-biometricos-read'])
    await createFaceIdFixture(
      otherFixture!.employee.employeeId,
      otherActor!.businessUnit.businessUnitId,
      'stream-other-bu'
    )

    const response = await client
      .get(`/api/employees/${otherFixture!.employee.employeeId}/biometric-face-id-photo`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))

    response.assertStatus(404)
  })

  test('CA-4 — sin foto registrada responde 404', async ({ client }) => {
    await grantOnly(actor!.role.roleId, ['tab-biometricos-read'])
    const emptyFixture = await createEmployeeFixture(actor!.businessUnit.businessUnitId, 'no-photo')
    try {
      const response = await client
        .get(`/api/employees/${emptyFixture.employee.employeeId}/biometric-face-id-photo`)
        .loginAs(actor!.user)
        .headers(buHeader(actor!))

      response.assertStatus(404)
    } finally {
      await cleanupEmployeeFixture(emptyFixture)
    }
  })

  test('CA-5 — fallo al asentar responde 500 sin entregar bytes', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['tab-biometricos-read'])
    const face = await createFaceIdFixture(
      fixture!.employee.employeeId,
      actor!.businessUnit.businessUnitId,
      'stream-500'
    )
    const recordId = face.employeeBiometricFaceIdId
    const before = await countRevealLogs(
      'EmployeeBiometricFaceId',
      'employeeBiometricFaceIdPhotoUrl',
      recordId
    )
    const originalRecord = PiiAccessLogService.prototype.record
    PiiAccessLogService.prototype.record = async () => {
      throw new Error('fallo simulado de auditoría biométrica')
    }

    try {
      const response = await client
        .get(`/api/employees/${fixture!.employee.employeeId}/biometric-face-id-photo`)
        .setup((request) => {
          request.request.ok(() => true)
        })
        .loginAs(actor!.user)
        .headers(buHeader(actor!))

      response.assertStatus(500)
      assert.notInclude(JSON.stringify(response.body()), 'fake-biometric-photo-stream-bytes')
      assert.equal(await countRevealLogs(
        'EmployeeBiometricFaceId',
        'employeeBiometricFaceIdPhotoUrl',
        recordId
      ), before)
    } finally {
      PiiAccessLogService.prototype.record = originalRecord
    }
  })
})
