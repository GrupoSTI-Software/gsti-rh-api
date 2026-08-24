import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import EmployeeDevice from '#models/employee_device'
import EmployeeBiometric from '#models/employee_biometric'
import EmployeeBiometricFaceId from '#models/employee_biometric_face_id'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'

const TEST_PASSWORD = 'BiometricosDispositivosPermissionGate123!'

const VALID_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
)
const VALID_FILE_NAME = 'foto-biometrica.png'

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

async function createActor(emailPrefix: string): Promise<TenantActor> {
  const stamp = await uniqueStamp()
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Bio pruebas ${stamp}`,
    businessUnitSlug: `bio-pruebas-${stamp}`,
    businessUnitLegalName: `Bio pruebas legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const role = await Role.create({
    roleName: `Bio pruebas ${stamp}`,
    roleSlug: `bio-pruebas-${stamp}`,
    roleDescription: 'Rol temporal para la matriz de permisos biometrica',
    roleActive: 1,
    roleBusinessAccess: businessUnit.businessUnitSlug,
    roleManagementDays: 10,
  })
  const person = await Person.create({
    personFirstname: 'BioPermissionGate',
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

async function createSystemActor(roleSlug: string, emailPrefix: string): Promise<SystemActor> {
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', roleSlug).firstOrFail()
  const stamp = await uniqueStamp()
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Bio sistema ${stamp}`,
    businessUnitSlug: `bio-sistema-${stamp}`,
    businessUnitLegalName: `Bio sistema legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const person = await Person.create({
    personFirstname: 'BioSystem',
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

async function cleanupActor(actor: TenantActor | null) {
  if (!actor) return
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await RoleSystemPermission.query().where('role_id', actor.role.roleId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await Role.query().where('role_id', actor.role.roleId).delete()
  await BusinessUnit.query().where('business_unit_id', actor.businessUnit.businessUnitId).delete()
}

async function cleanupSystemActor(actor: SystemActor | null) {
  if (!actor) return
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await BusinessUnit.query().where('business_unit_id', actor.businessUnit.businessUnitId).delete()
}

async function createEmployeeFixture(businessUnitId: number, prefix: string): Promise<EmployeeFixture> {
  const stamp = await uniqueStamp()
  const now = new Date()
  const person = await Person.create({
    personFirstname: 'Empleado',
    personLastname: 'BioGate',
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
    employee_last_name: 'BioGate',
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
  await db.from('employee_devices').where('employee_id', employeeId).delete()
  await db.from('employee_biometric_face_ids').where('employee_id', employeeId).delete()
  await db.from('employee_biometrics').where('employee_id', employeeId).delete()
  await Employee.query().where('employee_id', employeeId).delete()
  await db.from('positions').where('position_id', fixture.positionId).delete()
  await db.from('departments').where('department_id', fixture.departmentId).delete()
  await Person.query().where('person_id', fixture.person.personId).delete()
}

async function createDeviceFixture(employeeId: number, businessUnitId: number, tokenSuffix: string) {
  return EmployeeDevice.create({
    employeeId,
    businessUnitId,
    employeeDeviceToken: `token-bio-gate-${tokenSuffix}`,
    employeeDeviceModel: 'TestPhone',
    employeeDeviceBrand: 'TestBrand',
    employeeDeviceType: 'mobile',
    employeeDeviceOs: 'android',
    employeeDeviceActive: 1,
  })
}

async function ensureDeviceFixture(
  employeeId: number,
  businessUnitId: number,
  tokenSuffix: string
) {
  const current = await EmployeeDevice.query()
    .where('employee_id', employeeId)
    .whereNull('employee_device_deleted_at')
    .first()
  return current ?? createDeviceFixture(employeeId, businessUnitId, tokenSuffix)
}

async function createFaceIdFixture(employeeId: number, businessUnitId: number, tokenSuffix: string) {
  return EmployeeBiometricFaceId.create({
    employeeId,
    businessUnitId,
    employeeBiometricFaceIdPhotoUrl: `employee-biometric-faces/test-${tokenSuffix}.png`,
    employeeBiometricFaceIdToken: `face-token-${tokenSuffix}`,
  })
}

async function ensureFaceIdFixture(
  employeeId: number,
  businessUnitId: number,
  tokenSuffix: string
) {
  const current = await EmployeeBiometricFaceId.query()
    .where('employee_id', employeeId)
    .whereNull('employee_biometric_face_id_deleted_at')
    .first()
  return current ?? createFaceIdFixture(employeeId, businessUnitId, tokenSuffix)
}

async function createBiometricFixture(employeeId: number, businessUnitId: number) {
  return EmployeeBiometric.create({
    employeeId,
    businessUnitId,
    employeeBiometricData: JSON.stringify({ Fingers: [1, 4], Face: true }),
    employeeBiometricStatus: 'completed_both',
  })
}

async function ensureBiometricFixture(employeeId: number, businessUnitId: number) {
  const current = await EmployeeBiometric.query()
    .where('employee_id', employeeId)
    .whereNull('employee_biometric_deleted_at')
    .first()
  return current ?? createBiometricFixture(employeeId, businessUnitId)
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

function buHeader(actor: TenantActor | SystemActor) {
  return { 'X-Business-Unit-Id': actor.businessUnit.businessUnitPublicId }
}

async function disableEnforcementAndVerify(employeesModule: SystemModule) {
  employeesModule.systemModulePermissionEnforcementActive = false
  await employeesModule.save()
  const reloaded = await SystemModule.findOrFail(employeesModule.systemModuleId)
  if (reloaded.systemModulePermissionEnforcementActive !== false) {
    throw new Error('La exigencia de permisos de empleados debe quedar apagada tras el suite.')
  }
}

test.group('Biometricos/Dispositivos - soft-rollout (exigencia OFF)', (group) => {
  let actor: TenantActor | null = null
  let fixture: EmployeeFixture | null = null
  let employeesModule: SystemModule

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
    actor = await createActor('bio-soft')
    fixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'soft')
  })

  group.teardown(async () => {
    try {
      await cleanupEmployeeFixture(fixture)
      await cleanupActor(actor)
    } finally {
      await disableEnforcementAndVerify(employeesModule)
    }
  })

  test('sin grants: las nueve escrituras no responden PERM.DENIED', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['sensitive-biometrico-write'])
    const employeeId = fixture!.employee.employeeId
    const biometric = await ensureBiometricFixture(employeeId, actor!.businessUnit.businessUnitId)
    const biometricBefore = {
      biometricId: biometric.employeeBiometricId,
      data: biometric.employeeBiometricData,
      status: biometric.employeeBiometricStatus,
    }
    const face = await ensureFaceIdFixture(employeeId, actor!.businessUnit.businessUnitId, 'soft')
    const device = await ensureDeviceFixture(employeeId, actor!.businessUnit.businessUnitId, 'soft')
    const storeFixture = await createEmployeeFixture(actor!.businessUnit.businessUnitId, 'soft-store')

    try {
      const ops = [
        client
          .post(`/api/employees/${employeeId}/biometric-face-id`)
          .loginAs(actor!.user)
          .headers(buHeader(actor!))
          .file('photo', VALID_PNG_BUFFER, { filename: VALID_FILE_NAME, contentType: 'image/png' }),
        client
          .put(`/api/employees/${employeeId}/biometric-face-id`)
          .loginAs(actor!.user)
          .headers(buHeader(actor!))
          .file('photo', VALID_PNG_BUFFER, { filename: VALID_FILE_NAME, contentType: 'image/png' }),
        client
          .delete(`/api/employees/${employeeId}/biometric-face-id`)
          .loginAs(actor!.user)
          .headers(buHeader(actor!)),
        client
          .put(`/api/employees/${employeeId}/biometrics/fingers`)
          .loginAs(actor!.user)
          .headers(buHeader(actor!))
          .json({ Fingers: [1, 4, 7] }),
        client
          .post(`/api/employees/${storeFixture.employee.employeeId}/biometrics`)
          .loginAs(actor!.user)
          .headers(buHeader(actor!))
          .json({ Fingers: [1], Face: false }),
        client
          .put(`/api/employees/${employeeId}/biometrics`)
          .loginAs(actor!.user)
          .headers(buHeader(actor!))
          .json({ Fingers: [1, 4], Face: true }),
        client
          .put(`/api/employees/${employeeId}/biometrics/face`)
          .loginAs(actor!.user)
          .headers(buHeader(actor!))
          .json({ Face: false }),
        client
          .put(`/api/employee-devices/${device.employeeDeviceId}/status`)
          .loginAs(actor!.user)
          .headers(buHeader(actor!))
          .json({ employeeDeviceActive: 0 }),
        client
          .delete(`/api/employee-devices/${device.employeeDeviceId}`)
          .loginAs(actor!.user)
          .headers(buHeader(actor!)),
      ]

      for (const pending of ops) {
        const response = await pending
        assertNotPermissionDenied(assert, response)
      }

      const faceGone = await EmployeeBiometricFaceId.query()
        .where('employee_biometric_face_id_id', face.employeeBiometricFaceIdId)
        .whereNull('employee_biometric_face_id_deleted_at')
        .first()
      assert.isNull(faceGone)

      const biometricAfter = await EmployeeBiometric.query()
        .where('employee_biometric_id', biometricBefore.biometricId)
        .whereNull('employee_biometric_deleted_at')
        .first()
      assert.isNotNull(biometricAfter)
      assert.notEqual(biometricAfter!.employeeBiometricData, biometricBefore.data)

      const deviceGone = await EmployeeDevice.query()
        .where('employee_device_id', device.employeeDeviceId)
        .whereNull('employee_device_deleted_at')
        .first()
      assert.isNull(deviceGone)
    } finally {
      await cleanupEmployeeFixture(storeFixture)
    }
  })
})

test.group('Biometricos/Dispositivos - matriz con exigencia ON', (group) => {
  let actor: TenantActor | null = null
  let fixture: EmployeeFixture | null = null
  let employeesModule: SystemModule

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = true
    await employeesModule.save()
    actor = await createActor('bio-enforced')
    fixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'enforced')
  })

  group.teardown(async () => {
    try {
      await cleanupEmployeeFixture(fixture)
      await cleanupActor(actor)
    } finally {
      await disableEnforcementAndVerify(employeesModule)
    }
  })

  test('upload-face-id permite subir y reemplazar; sin permiso responde PERM.DENIED', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    const deniedUpload = await client
      .post(`/api/employees/${fixture!.employee.employeeId}/biometric-face-id`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
      .file('photo', VALID_PNG_BUFFER, { filename: VALID_FILE_NAME, contentType: 'image/png' })
    assertPermissionDenied(assert, deniedUpload)

    await grantOnly(actor!.role.roleId, ['upload-face-id'])
    const allowedUpload = await client
      .post(`/api/employees/${fixture!.employee.employeeId}/biometric-face-id`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
      .file('photo', VALID_PNG_BUFFER, { filename: VALID_FILE_NAME, contentType: 'image/png' })
    assertNotPermissionDenied(assert, allowedUpload)

    const allowedReplace = await client
      .put(`/api/employees/${fixture!.employee.employeeId}/biometric-face-id`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
      .file('photo', VALID_PNG_BUFFER, { filename: VALID_FILE_NAME, contentType: 'image/png' })
    assertNotPermissionDenied(assert, allowedReplace)
  })

  test('upload-face-id no alcanza para borrar Face ID', async ({ client, assert }) => {
    const face = await ensureFaceIdFixture(
      fixture!.employee.employeeId,
      actor!.businessUnit.businessUnitId,
      'sep-delete'
    )
    await grantOnly(actor!.role.roleId, ['upload-face-id'])
    const denied = await client
      .delete(`/api/employees/${fixture!.employee.employeeId}/biometric-face-id`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
    assertPermissionDenied(assert, denied)
    const stillThere = await EmployeeBiometricFaceId.query()
      .where('employee_biometric_face_id_id', face.employeeBiometricFaceIdId)
      .whereNull('employee_biometric_face_id_deleted_at')
      .first()
    assert.isNotNull(stillThere)

    await grantOnly(actor!.role.roleId, ['tab-biometricos-delete'])
    const allowed = await client
      .delete(`/api/employees/${fixture!.employee.employeeId}/biometric-face-id`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
    assertNotPermissionDenied(assert, allowed)
  })

  test('upload-fingers permite huellas; upload-face-id no las otorga', async ({ client, assert }) => {
    await ensureBiometricFixture(fixture!.employee.employeeId, actor!.businessUnit.businessUnitId)
    await grantOnly(actor!.role.roleId, ['upload-face-id'])
    const denied = await client
      .put(`/api/employees/${fixture!.employee.employeeId}/biometrics/fingers`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
      .json({ Fingers: [2, 5] })
    assertPermissionDenied(assert, denied)

    await grantOnly(actor!.role.roleId, ['upload-fingers'])
    const allowed = await client
      .put(`/api/employees/${fixture!.employee.employeeId}/biometrics/fingers`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
      .json({ Fingers: [2, 5] })
    assertNotPermissionDenied(assert, allowed)
  })

  test('tab-biometricos-write permite registrar y cambiar Face; upload-fingers no', async ({
    client,
    assert,
  }) => {
    await ensureBiometricFixture(fixture!.employee.employeeId, actor!.businessUnit.businessUnitId)
    const storeFixture = await createEmployeeFixture(actor!.businessUnit.businessUnitId, 'store')
    await grantOnly(actor!.role.roleId, ['upload-fingers'])
    try {
      const deniedStore = await client
        .post(`/api/employees/${storeFixture.employee.employeeId}/biometrics`)
        .loginAs(actor!.user)
        .headers(buHeader(actor!))
        .json({ Fingers: [1], Face: false })
      assertPermissionDenied(assert, deniedStore)

      const deniedFace = await client
        .put(`/api/employees/${fixture!.employee.employeeId}/biometrics/face`)
        .loginAs(actor!.user)
        .headers(buHeader(actor!))
        .json({ Face: true })
      assertPermissionDenied(assert, deniedFace)

      await grantOnly(actor!.role.roleId, ['tab-biometricos-write'])
      const allowedFace = await client
        .put(`/api/employees/${fixture!.employee.employeeId}/biometrics/face`)
        .loginAs(actor!.user)
        .headers(buHeader(actor!))
        .json({ Face: true })
      assertNotPermissionDenied(assert, allowedFace)

      const allowedStore = await client
        .post(`/api/employees/${storeFixture.employee.employeeId}/biometrics`)
        .loginAs(actor!.user)
        .headers(buHeader(actor!))
        .json({ Fingers: [1, 3], Face: true })
      assertNotPermissionDenied(assert, allowedStore)
    } finally {
      await cleanupEmployeeFixture(storeFixture)
    }
  })

  test('tab-dispositivos-write permite status; delete exige tab-dispositivos-delete', async ({
    client,
    assert,
  }) => {
    const device = await ensureDeviceFixture(
      fixture!.employee.employeeId,
      actor!.businessUnit.businessUnitId,
      'sep-device'
    )
    await grantOnly(actor!.role.roleId, ['tab-dispositivos-write'])
    const statusOk = await client
      .put(`/api/employee-devices/${device.employeeDeviceId}/status`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
      .json({ employeeDeviceActive: 0 })
    assertNotPermissionDenied(assert, statusOk)

    const deniedDelete = await client
      .delete(`/api/employee-devices/${device.employeeDeviceId}`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
    assertPermissionDenied(assert, deniedDelete)
    const stillThere = await EmployeeDevice.query()
      .where('employee_device_id', device.employeeDeviceId)
      .whereNull('employee_device_deleted_at')
      .first()
    assert.isNotNull(stillThere)

    await grantOnly(actor!.role.roleId, ['tab-dispositivos-delete'])
    const allowedDelete = await client
      .delete(`/api/employee-devices/${device.employeeDeviceId}`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
    assertNotPermissionDenied(assert, allowedDelete)
  })

  test('sin permisos: las nueve escrituras responden PERM.DENIED', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, [])
    const employeeId = fixture!.employee.employeeId
    const device = await ensureDeviceFixture(employeeId, actor!.businessUnit.businessUnitId, 'nine')
    const face = await ensureFaceIdFixture(employeeId, actor!.businessUnit.businessUnitId, 'nine')
    const biometric = await ensureBiometricFixture(employeeId, actor!.businessUnit.businessUnitId)
    const biometricBefore = {
      biometricId: biometric.employeeBiometricId,
      data: biometric.employeeBiometricData,
      status: biometric.employeeBiometricStatus,
    }

    const ops = [
      client
        .post(`/api/employees/${employeeId}/biometric-face-id`)
        .loginAs(actor!.user)
        .headers(buHeader(actor!))
        .file('photo', VALID_PNG_BUFFER, { filename: VALID_FILE_NAME, contentType: 'image/png' }),
      client
        .put(`/api/employees/${employeeId}/biometric-face-id`)
        .loginAs(actor!.user)
        .headers(buHeader(actor!))
        .file('photo', VALID_PNG_BUFFER, { filename: VALID_FILE_NAME, contentType: 'image/png' }),
      client
        .delete(`/api/employees/${employeeId}/biometric-face-id`)
        .loginAs(actor!.user)
        .headers(buHeader(actor!)),
      client
        .put(`/api/employees/${employeeId}/biometrics/fingers`)
        .loginAs(actor!.user)
        .headers(buHeader(actor!))
        .json({ Fingers: [1] }),
      client
        .post(`/api/employees/${employeeId}/biometrics`)
        .loginAs(actor!.user)
        .headers(buHeader(actor!))
        .json({ Fingers: [1], Face: false }),
      client
        .put(`/api/employees/${employeeId}/biometrics`)
        .loginAs(actor!.user)
        .headers(buHeader(actor!))
        .json({ Fingers: [1], Face: false }),
      client
        .put(`/api/employees/${employeeId}/biometrics/face`)
        .loginAs(actor!.user)
        .headers(buHeader(actor!))
        .json({ Face: false }),
      client
        .put(`/api/employee-devices/${device.employeeDeviceId}/status`)
        .loginAs(actor!.user)
        .headers(buHeader(actor!))
        .json({ employeeDeviceActive: 0 }),
      client
        .delete(`/api/employee-devices/${device.employeeDeviceId}`)
        .loginAs(actor!.user)
        .headers(buHeader(actor!)),
    ]

    for (const pending of ops) {
      const response = await pending
      assertPermissionDenied(assert, response)
    }

    const faceStill = await EmployeeBiometricFaceId.query()
      .where('employee_biometric_face_id_id', face.employeeBiometricFaceIdId)
      .whereNull('employee_biometric_face_id_deleted_at')
      .first()
    assert.isNotNull(faceStill)
    const biometricStill = await EmployeeBiometric.query()
      .where('employee_biometric_id', biometricBefore.biometricId)
      .whereNull('employee_biometric_deleted_at')
      .first()
    assert.isNotNull(biometricStill)
    assert.equal(biometricStill!.employeeBiometricData, biometricBefore.data)
    assert.equal(biometricStill!.employeeBiometricStatus, biometricBefore.status)
    const deviceStill = await EmployeeDevice.query()
      .where('employee_device_id', device.employeeDeviceId)
      .whereNull('employee_device_deleted_at')
      .first()
    assert.isNotNull(deviceStill)
  })
})

test.group('Biometricos/Dispositivos - bypass standard (owner/root)', (group) => {
  let ownerActor: SystemActor | null = null
  let rootActor: SystemActor | null = null
  let ownerFixture: EmployeeFixture | null = null
  let rootFixture: EmployeeFixture | null = null
  let employeesModule: SystemModule
  let ownerGrants: RoleSystemPermission[] = []
  let rootGrants: RoleSystemPermission[] = []

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = true
    await employeesModule.save()

    ownerActor = await createSystemActor('owner', 'bio-owner')
    rootActor = await createSystemActor('root', 'bio-root')
    ownerFixture = await createEmployeeFixture(ownerActor.businessUnit.businessUnitId, 'owner')
    rootFixture = await createEmployeeFixture(rootActor.businessUnit.businessUnitId, 'root')
    await ensureBiometricFixture(ownerFixture.employee.employeeId, ownerActor.businessUnit.businessUnitId)
    await ensureBiometricFixture(rootFixture.employee.employeeId, rootActor.businessUnit.businessUnitId)
  })

  group.teardown(async () => {
    try {
      await restoreEmployeesGrants(rootGrants)
      await restoreEmployeesGrants(ownerGrants)
      await cleanupEmployeeFixture(rootFixture)
      await cleanupEmployeeFixture(ownerFixture)
      await cleanupSystemActor(rootActor)
      await cleanupSystemActor(ownerActor)
    } finally {
      await disableEnforcementAndVerify(employeesModule)
    }
  })

  test('owner y root sin grants no reciben PERM.DENIED en PUT fingers', async ({
    client,
    assert,
  }) => {
    ownerGrants = await snapshotAndClearEmployeesGrants(ownerActor!.roleId)
    rootGrants = await snapshotAndClearEmployeesGrants(rootActor!.roleId)

    for (const systemActor of [
      { actor: ownerActor!, fixture: ownerFixture! },
      { actor: rootActor!, fixture: rootFixture! },
    ]) {
      const response = await client
        .put(`/api/employees/${systemActor.fixture.employee.employeeId}/biometrics/fingers`)
        .loginAs(systemActor.actor.user)
        .headers(buHeader(systemActor.actor))
        .json({ Fingers: [9] })
      assertNotPermissionDenied(assert, response)
    }
  })
})
