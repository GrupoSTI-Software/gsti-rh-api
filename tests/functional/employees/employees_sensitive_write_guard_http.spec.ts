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

/**
 * Revisión final de sensitive-write-by-category — Important 3: prueba con una
 * petición HTTP real que la denegación de categoría sensible (`EMP.SENS.WRITE.
 * FORBIDDEN`) llega hasta el cliente como 403, y que el registro subyacente NO
 * se modifica (ni se destruye el objeto anterior en S3 en el caso biométrico,
 * ver Critical 2).
 */

const TEST_PASSWORD = 'SensitiveWriteGuardHttp123!'

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
    businessUnitName: `Sensitive Guard HTTP ${stamp}`,
    businessUnitSlug: `sensitive-guard-http-${stamp}`,
    businessUnitLegalName: `Sensitive Guard HTTP Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const role = await Role.create({
    roleName: `Sensitive Guard HTTP ${stamp}`,
    roleSlug: `sensitive-guard-http-${stamp}`,
    roleDescription: 'Rol temporal para probar el 403 HTTP del guard de datos sensibles',
    roleActive: 1,
    roleBusinessAccess: businessUnit.businessUnitSlug,
    roleManagementDays: 10,
  })
  const person = await Person.create({
    personFirstname: 'SensitiveGuardHttp',
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
  const stamp = await uniqueStamp()
  const now = new Date()
  const person = await Person.create({
    personFirstname: 'Empleado',
    personLastname: 'SensitiveGuardHttp',
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
    employee_last_name: 'SensitiveGuardHttp',
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
  await db.from('employee_banks').where('employee_id', employeeId).delete()
  await db.from('employee_biometric_face_ids').where('employee_id', employeeId).delete()
  await Employee.query().where('employee_id', employeeId).delete()
  await db.from('positions').where('position_id', fixture.positionId).delete()
  await db.from('departments').where('department_id', fixture.departmentId).delete()
  await Person.query().where('person_id', fixture.person.personId).delete()
}

async function createBankFixture(employeeId: number, businessUnitId: number, suffix: number) {
  const now = new Date()
  const clabe = `012180001234567${String(suffix).padStart(3, '0')}`
  const insert = await db.table('employee_banks').insert({
    employee_bank_account_clabe: clabe,
    employee_bank_account_clabe_last_numbers: clabe.slice(-4),
    employee_bank_account_number: null,
    employee_bank_account_number_last_numbers: null,
    employee_bank_account_currency_type: 'MXN',
    employee_id: employeeId,
    business_unit_id: businessUnitId,
    bank_id: 1,
    employee_bank_created_at: now,
  })
  return { employeeBankId: Number(insert[0]), clabe }
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

function assertSensitiveWriteForbidden(assert: any, response: any) {
  response.assertStatus(403)
  assert.equal(response.body()?.key, 'sin-permiso-para-modificar-datos-sensibles')
  assert.equal(response.body()?.code, 'EMP.SENS.WRITE.FORBIDDEN')
}

/**
 * Espía de `UploadService.prototype.deleteFile`: delega en la implementación
 * real (segura aquí porque las fotos de prueba no existen en S3 — `headObject`
 * responde 404 y no borra nada real) pero registra cada invocación, para
 * probar que Critical 2 (guardar antes de borrar) evita el borrado cuando el
 * guardado es denegado.
 */
const originalDeleteFile = UploadService.prototype.deleteFile
let deleteFileCalls: string[] = []

function installDeleteFileSpy() {
  deleteFileCalls = []
  UploadService.prototype.deleteFile = async function (this: UploadService, fileUrlOrKey = '') {
    deleteFileCalls.push(fileUrlOrKey)
    return originalDeleteFile.call(this, fileUrlOrKey)
  }
}

function restoreDeleteFileSpy() {
  UploadService.prototype.deleteFile = originalDeleteFile
}

test.group('Sensitive write guard — 403 HTTP real (Important 3)', (group) => {
  let employeesModule: SystemModule
  let actor: TenantActor | null = null
  let fixture: EmployeeFixture | null = null

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = true
    await employeesModule.save()
    actor = await createActor('sensitive-guard-http')
    fixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'sensitive-guard-http')
  })

  group.teardown(async () => {
    let enforcementLeftDisabled = false
    try {
      await cleanupEmployeeFixture(fixture)
      await cleanupActor(actor)
    } finally {
      employeesModule.systemModulePermissionEnforcementActive = false
      await employeesModule.save()
      const reloaded = await SystemModule.findOrFail(employeesModule.systemModuleId)
      enforcementLeftDisabled = reloaded.systemModulePermissionEnforcementActive === false
    }
    if (!enforcementLeftDisabled) {
      throw new Error('La exigencia de permisos de empleados debe quedar apagada tras el suite.')
    }
  })

  test('PUT /api/employee-banks/:id con tab-bancos-write pero sin sensitive-financiero-write responde 403 y no modifica la CLABE', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-bancos-write'])
    const { employeeBankId, clabe: originalClabe } = await createBankFixture(
      fixture!.employee.employeeId,
      actor!.businessUnit.businessUnitId,
      501
    )

    const response = await client
      .put(`/api/employee-banks/${employeeBankId}`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
      .json({
        employeeBankAccountClabe: '012180009999999999',
        employeeBankAccountCurrencyType: 'MXN',
      })

    assertSensitiveWriteForbidden(assert, response)

    const persisted = await db
      .from('employee_banks')
      .where('employee_bank_id', employeeBankId)
      .first()
    assert.equal(persisted.employee_bank_account_clabe, originalClabe)
  })

  test('PUT /api/employees/:employeeId/biometric-face-id con upload-face-id pero sin sensitive-biometrico-write responde 403 y no borra la foto anterior', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['upload-face-id'])
    const face = await createFaceIdFixture(
      fixture!.employee.employeeId,
      actor!.businessUnit.businessUnitId,
      'sens-guard'
    )
    const originalPhotoUrl = face.employeeBiometricFaceIdPhotoUrl

    installDeleteFileSpy()
    try {
      const response = await client
        .put(`/api/employees/${fixture!.employee.employeeId}/biometric-face-id`)
        .loginAs(actor!.user)
        .headers(buHeader(actor!))
        .file('photo', VALID_PNG_BUFFER, { filename: VALID_FILE_NAME, contentType: 'image/png' })

      assertSensitiveWriteForbidden(assert, response)
      assert.lengthOf(deleteFileCalls, 0)

      const reloaded = await EmployeeBiometricFaceId.query()
        .where('employee_biometric_face_id_id', face.employeeBiometricFaceIdId)
        .firstOrFail()
      assert.equal(reloaded.employeeBiometricFaceIdPhotoUrl, originalPhotoUrl)
    } finally {
      restoreDeleteFileSpy()
    }
  })
})
