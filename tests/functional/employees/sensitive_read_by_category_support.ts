import type { Assert } from '@japa/assert'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import EmployeeBank from '#models/employee_bank'
import EmployeeMedicalCondition from '#models/employee_medical_condition'
import MedicalConditionType from '#models/medical_condition_type'
import Bank from '#models/bank'
import RoleSystemPermission from '#models/role_system_permission'
import SystemPermission from '#models/system_permission'
import { TenantContext } from '#utils/tenant_context'
import { maskSensitiveValue } from '#helpers/sensitive_mask'

export const TEST_PASSWORD = 'SensitiveReadByCategoryQa123!'

export const CLEAR_FIXED = {
  curp: 'ABCD123456MDFABC01',
  rfc: 'VACW850312J95',
  nss: '12345678901',
  phone: '5512345678',
  phoneSecondary: '5587654321',
  clabe: '012345678901234567',
  account: '123456789012',
  card: '4111111111111201',
  diagnosis: 'gripe ocupacional',
  notes: 'notas clinicas de prueba',
  firstname: 'SensRead',
} as const

export interface ClearPii {
  email: string
  curp: string
  rfc: string
  nss: string
  phone: string
  phoneSecondary: string
  clabe: string
  account: string
  card: string
  diagnosis: string
  notes: string
  firstname: string
}

export interface TenantActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
  role: Role
}

export interface SystemActor {
  user: User
  person: Person
  roleId: number
}

export interface SensitiveFixture {
  employee: Employee
  person: Person
  departmentId: number
  positionId: number
  bank: EmployeeBank
  medical: EmployeeMedicalCondition
  medicalConditionType: MedicalConditionType
  clear: ClearPii
  searchToken: string
}

export async function permissionId(permissionSlug: string): Promise<number> {
  const permission = await SystemPermission.query()
    .whereNull('system_permission_deleted_at')
    .where('system_permission_slug', permissionSlug)
    .whereHas('systemModule', (query) =>
      query.whereNull('system_module_deleted_at').where('system_module_slug', 'employees')
    )
    .first()
  if (!permission) {
    throw new Error(`Se requiere employees:${permissionSlug} en BD para este test.`)
  }
  return permission.systemPermissionId
}

export async function grantOnly(roleId: number, permissionSlugs: string[]) {
  await RoleSystemPermission.query().where('role_id', roleId).delete()
  for (const slug of permissionSlugs) {
    await RoleSystemPermission.create({
      roleId,
      systemPermissionId: await permissionId(slug),
    })
  }
}

export async function createActor(emailPrefix: string): Promise<TenantActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Sens read QA ${stamp}`,
    businessUnitSlug: `sens-read-qa-${stamp}`,
    businessUnitLegalName: `Sens read QA legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const role = await Role.create({
    roleName: `Sens read QA ${stamp}`,
    roleSlug: `sens-read-qa-${stamp}`,
    roleDescription: 'Rol temporal de lectura sensible por categoría',
    roleActive: 1,
    roleBusinessAccess: businessUnit.businessUnitSlug,
    roleManagementDays: 10,
  })
  const person = await Person.create({
    personFirstname: 'ActorSens',
    personLastname: 'Qa',
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

export async function cleanupActor(actor: TenantActor | null) {
  if (!actor) return
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await RoleSystemPermission.query().where('role_id', actor.role.roleId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await Role.query().where('role_id', actor.role.roleId).delete()
  await BusinessUnit.query()
    .where('business_unit_id', actor.businessUnit.businessUnitId)
    .delete()
}

export async function createSystemActor(
  roleSlug: string,
  emailPrefix: string,
  businessUnitId: number
): Promise<SystemActor> {
  const role = await Role.query()
    .whereNull('role_deleted_at')
    .where('role_slug', roleSlug)
    .firstOrFail()
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const person = await Person.create({
    personFirstname: 'SistemaSens',
    personLastname: 'Qa',
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
  await user.related('businessUnits').attach([businessUnitId])
  return { user, person, roleId: role.roleId }
}

export async function cleanupSystemActor(actor: SystemActor | null) {
  if (!actor) return
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

export async function activeEmployeesGrants(roleId: number) {
  return RoleSystemPermission.query()
    .where('role_id', roleId)
    .whereNull('role_system_permission_deleted_at')
    .whereHas('systemPermissions', (permissionQuery) =>
      permissionQuery
        .whereNull('system_permission_deleted_at')
        .whereHas('systemModule', (moduleQuery) =>
          moduleQuery
            .whereNull('system_module_deleted_at')
            .where('system_module_slug', 'employees')
        )
    )
}

export async function snapshotAndClearEmployeesGrants(roleId: number) {
  const grants = await activeEmployeesGrants(roleId)
  for (const grant of grants) await grant.delete()
  return grants
}

export async function restoreEmployeesGrants(grants: RoleSystemPermission[]) {
  for (const grant of grants) await grant.restore()
}

export async function createSensitiveFixture(
  businessUnitId: number,
  prefix: string,
  sharedSearchToken?: string
): Promise<SensitiveFixture> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  // employee_second_last_name es VARCHAR(25); el stamp completo no cabe.
  const compactToken = `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1296)
    .toString(36)
    .padStart(2, '0')}`
  const searchToken = (sharedSearchToken ?? compactToken).slice(0, 25)
  const now = new Date()
  const clear: ClearPii = {
    ...CLEAR_FIXED,
    email: `juan-${stamp}@empresa.com`,
  }
  const person = await Person.create({
    personFirstname: CLEAR_FIXED.firstname,
    personLastname: 'Colaborador',
    personSecondLastname: searchToken,
    personEmail: clear.email,
    personPhone: clear.phone,
    personPhoneSecondary: clear.phoneSecondary,
    personCurp: clear.curp,
    personRfc: clear.rfc,
    personImssNss: clear.nss,
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
    employee_first_name: CLEAR_FIXED.firstname,
    employee_last_name: 'Colaborador',
    employee_second_last_name: searchToken,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    department_id: departmentId,
    position_id: positionId,
    person_id: person.personId,
    employee_type_id: 1,
    employee_work_schedule: 'Onsite',
    employee_business_email: `work-${prefix}-${stamp}@gsti-tests.local`,
    employee_created_at: now,
  })
  const employee = await Employee.findOrFail(Number(employeeInsert[0]))
  const bankRow = await Bank.query().whereNull('bank_deleted_at').firstOrFail()
  const bank = await EmployeeBank.create({
    employeeBankAccountClabe: clear.clabe,
    employeeBankAccountClabeLastNumbers: clear.clabe.slice(-4),
    employeeBankAccountNumber: clear.account,
    employeeBankAccountNumberLastNumbers: clear.account.slice(-4),
    employeeBankAccountCardNumber: clear.card,
    employeeBankAccountCardNumberLastNumbers: clear.card.slice(-4),
    employeeBankAccountCurrencyType: 'MXN',
    employeeId: employee.employeeId,
    bankId: bankRow.bankId,
  })
  const medicalConditionType = await TenantContext.run([businessUnitId], async () => {
    const type = new MedicalConditionType()
    type.medicalConditionTypeName = `TEST-MCT-SENS-${stamp}`
    type.medicalConditionTypeDescription = 'fixture lectura sensible'
    type.medicalConditionTypeActive = 1
    await type.save()
    return type
  })
  const medical = await EmployeeMedicalCondition.create({
    employeeId: employee.employeeId,
    medicalConditionTypeId: medicalConditionType.medicalConditionTypeId,
    employeeMedicalConditionDiagnosis: clear.diagnosis,
    employeeMedicalConditionNotes: clear.notes,
    employeeMedicalConditionActive: 1,
  })
  return {
    employee,
    person,
    departmentId,
    positionId,
    bank,
    medical,
    medicalConditionType,
    clear,
    searchToken,
  }
}

export async function cleanupSensitiveFixture(fixture: SensitiveFixture | null) {
  if (!fixture) return
  await EmployeeMedicalCondition.query()
    .where('employee_medical_condition_id', fixture.medical.employeeMedicalConditionId)
    .delete()
  await EmployeeBank.query()
    .where('employee_bank_id', fixture.bank.employeeBankId)
    .delete()
  await Employee.query().where('employee_id', fixture.employee.employeeId).delete()
  await db.from('positions').where('position_id', fixture.positionId).delete()
  await db.from('departments').where('department_id', fixture.departmentId).delete()
  await Person.query().where('person_id', fixture.person.personId).delete()
  await TenantContext.runUnscoped(async () => {
    await MedicalConditionType.query()
      .where('medical_condition_type_id', fixture.medicalConditionType.medicalConditionTypeId)
      .delete()
  })
}

export function buHeader(actor: TenantActor) {
  return actor.businessUnit.businessUnitPublicId
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

export function employeePerson(body: Record<string, unknown>) {
  return asRecord(asRecord(asRecord(body.data).employee).person)
}

export function employeeBankBody(body: Record<string, unknown>) {
  return asRecord(asRecord(body.data).employeeBank)
}

export function medicalConditionBody(body: Record<string, unknown>) {
  return asRecord(asRecord(body.data).showEmployeeMedicalCondition)
}

export function personShowBody(body: Record<string, unknown>) {
  return asRecord(asRecord(body.data).person)
}

export function sessionPerson(body: Record<string, unknown>) {
  const direct = asRecord(body.person)
  if (Object.keys(direct).length > 0) return direct
  return asRecord(asRecord(asRecord(body.data).user).person)
}

export function extractEmployeeRows(body: Record<string, unknown>): Record<string, unknown>[] {
  const employees = asRecord(body.data).employees
  if (Array.isArray(employees)) return employees as Record<string, unknown>[]
  const nested = asRecord(employees).data
  return Array.isArray(nested) ? (nested as Record<string, unknown>[]) : []
}

export function expectNeverDenied(
  response: { status: () => number; body: () => { key?: string } | undefined },
  assert: Assert
) {
  assert.equal(response.status(), 200)
  assert.notEqual(response.body()?.key, 'PERM.DENIED')
}

export function expectPersonContactoClear(person: Record<string, unknown>, clear: ClearPii, assert: Assert) {
  assert.equal(person.personEmail, clear.email)
  assert.equal(person.personPhone, clear.phone)
  assert.equal(person.personPhoneSecondary, clear.phoneSecondary)
}

export function expectPersonContactoMasked(person: Record<string, unknown>, clear: ClearPii, assert: Assert) {
  assert.equal(person.personEmail, maskSensitiveValue(clear.email, 'contacto'))
  assert.equal(person.personPhone, maskSensitiveValue(clear.phone, 'contacto'))
  assert.equal(
    person.personPhoneSecondary,
    maskSensitiveValue(clear.phoneSecondary, 'contacto')
  )
}

export function expectPersonIdentificacionClear(
  person: Record<string, unknown>,
  clear: ClearPii,
  assert: Assert
) {
  assert.equal(person.personCurp, clear.curp)
  assert.equal(person.personRfc, clear.rfc)
  assert.equal(person.personImssNss, clear.nss)
}

export function expectPersonIdentificacionMasked(
  person: Record<string, unknown>,
  clear: ClearPii,
  assert: Assert
) {
  assert.equal(person.personCurp, maskSensitiveValue(clear.curp, 'identificacion'))
  assert.equal(person.personRfc, maskSensitiveValue(clear.rfc, 'identificacion'))
  assert.equal(person.personImssNss, maskSensitiveValue(clear.nss, 'identificacion'))
}

export function expectBankClear(bank: Record<string, unknown>, clear: ClearPii, assert: Assert) {
  assert.equal(bank.employeeBankAccountClabe, clear.clabe)
  assert.equal(bank.employeeBankAccountNumber, clear.account)
  assert.equal(bank.employeeBankAccountCardNumber, clear.card)
}

export function expectBankMasked(bank: Record<string, unknown>, clear: ClearPii, assert: Assert) {
  assert.equal(
    bank.employeeBankAccountClabe,
    maskSensitiveValue(clear.clabe, 'financiero')
  )
  assert.equal(
    bank.employeeBankAccountNumber,
    maskSensitiveValue(clear.account, 'financiero')
  )
  assert.equal(
    bank.employeeBankAccountCardNumber,
    maskSensitiveValue(clear.card, 'financiero')
  )
}

export function expectMedicalClear(
  medical: Record<string, unknown>,
  clear: ClearPii,
  assert: Assert
) {
  assert.equal(medical.employeeMedicalConditionDiagnosis, clear.diagnosis)
  assert.equal(medical.employeeMedicalConditionNotes, clear.notes)
}

export function expectMedicalMasked(
  medical: Record<string, unknown>,
  clear: ClearPii,
  assert: Assert
) {
  assert.equal(
    medical.employeeMedicalConditionDiagnosis,
    maskSensitiveValue(clear.diagnosis, 'salud')
  )
  assert.equal(
    medical.employeeMedicalConditionNotes,
    maskSensitiveValue(clear.notes, 'salud')
  )
}

export function expectNonSensitiveIntact(
  person: Record<string, unknown>,
  employee: Record<string, unknown>,
  assert: Assert
) {
  assert.equal(person.personFirstname, CLEAR_FIXED.firstname)
  assert.isString(String(employee.employeeCode ?? ''))
  assert.notEqual(String(employee.employeeCode ?? ''), '')
}

export function expectElevenMasked(
  person: Record<string, unknown>,
  bank: Record<string, unknown>,
  medical: Record<string, unknown>,
  clear: ClearPii,
  assert: Assert
) {
  expectPersonContactoMasked(person, clear, assert)
  expectPersonIdentificacionMasked(person, clear, assert)
  expectBankMasked(bank, clear, assert)
  expectMedicalMasked(medical, clear, assert)
}

export function expectElevenClear(
  person: Record<string, unknown>,
  bank: Record<string, unknown>,
  medical: Record<string, unknown>,
  clear: ClearPii,
  assert: Assert
) {
  expectPersonContactoClear(person, clear, assert)
  expectPersonIdentificacionClear(person, clear, assert)
  expectBankClear(bank, clear, assert)
  expectMedicalClear(medical, clear, assert)
}

export function expectContactoClearIdentificacionMasked(
  person: Record<string, unknown>,
  clear: ClearPii,
  assert: Assert
) {
  expectPersonContactoClear(person, clear, assert)
  expectPersonIdentificacionMasked(person, clear, assert)
}
