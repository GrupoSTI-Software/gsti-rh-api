import type { Assert } from '@japa/assert'
import type { ApiClient } from '@japa/api-client'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { LegalCategory } from '#constants/sensitive_fields'
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
import WorkDisability from '#models/work_disability'
import WorkDisabilityNote from '#models/work_disability_note'
import InsuranceCoverageType from '#models/insurance_coverage_type'
import EmployeeSpouse from '#models/employee_spouse'
import EmployeeEmergencyContact from '#models/employee_emergency_contact'
import EmployeeLactationPeriod from '#models/employee_lactation_period'
import TraumaticEventReport from '#models/traumatic_event_report'
import TraumaticEventType from '#models/traumatic_event_type'
import EmployeeBiometric from '#models/employee_biometric'
import EmployeeBiometricFaceId from '#models/employee_biometric_face_id'
import EmployeeSalaryHistory from '#models/employee_salary_history'
import PositionSalaryRange from '#models/position_salary_range'
import EmpresaContratante from '#models/empresa_contratante'
import UserConsent from '#models/user_consent'
import LegalDocument from '#models/legal_document'
import { TenantContext } from '#utils/tenant_context'
import { blindIndex } from '#utils/blind_index'
import { maskSensitiveValue, MASK_CHAR } from '#helpers/sensitive_mask'
import { normalizeRfc } from '../../../app/shared/validators/rfc.validator.js'

export function countGateLookups(sqls: string[]) {
  const roles = sqls.filter((sql) => /from\s+[`"]?roles[`"]?/i.test(sql)).length
  const grants = sqls.filter((sql) =>
    /from\s+[`"]?role_system_permissions[`"]?/i.test(sql)
  ).length
  return { roles, grants }
}

export async function withSqlLog<T>(work: () => Promise<T>): Promise<{
  result: T
  sqls: string[]
}> {
  const sqls: string[] = []
  const knex = db.connection().getWriteClient()
  const onQuery = (query: { sql?: string }) => {
    if (query.sql) sqls.push(query.sql)
  }
  knex.on('query', onQuery)
  try {
    const result = await work()
    return { result, sqls }
  } finally {
    knex.off('query', onQuery)
  }
}

export const TEST_PASSWORD = 'SensitiveReadByCategoryQa123!'

export async function activateUser(user: User) {
  user.userPasswordSetAt = DateTime.utc()
  await user.save()
}

export async function loginWeb(
  client: ApiClient,
  email: string,
  password: string = TEST_PASSWORD
) {
  return client.post('/api/auth/login').json({
    userEmail: email,
    userPassword: password,
    deviceOrigin: 'web',
  })
}

export function bearerFromLogin(body: Record<string, unknown>): string {
  const data =
    body.data && typeof body.data === 'object'
      ? (body.data as Record<string, unknown>)
      : {}
  const token = data.token
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('Login e2e: data.token no es un string.')
  }
  return token
}

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

export async function grantAdditionally(roleId: number, permissionSlugs: string[]) {
  for (const slug of permissionSlugs) {
    const systemPermissionId = await permissionId(slug)
    await RoleSystemPermission.firstOrCreate(
      { roleId, systemPermissionId },
      { roleId, systemPermissionId }
    )
  }
}

export async function revokeSlugs(roleId: number, permissionSlugs: string[]) {
  const ids = await Promise.all(permissionSlugs.map((slug) => permissionId(slug)))
  await RoleSystemPermission.query()
    .where('role_id', roleId)
    .whereIn('system_permission_id', ids)
    .delete()
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
    payroll_business_unit_id: businessUnitId,
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
  }, 'limpieza fixture lectura sensible')
}

export function buHeader(actor: TenantActor) {
  return actor.businessUnit.businessUnitPublicId
}

export function asRecord(value: unknown): Record<string, unknown> {
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

export function loginUserPerson(body: Record<string, unknown>) {
  const data =
    body.data && typeof body.data === 'object'
      ? (body.data as Record<string, unknown>)
      : {}
  const user =
    data.user && typeof data.user === 'object'
      ? (data.user as Record<string, unknown>)
      : {}
  return user.person && typeof user.person === 'object'
    ? (user.person as Record<string, unknown>)
    : {}
}

export function customerPerson(body: Record<string, unknown>) {
  const data =
    body.data && typeof body.data === 'object'
      ? (body.data as Record<string, unknown>)
      : {}
  const customer =
    data.customer && typeof data.customer === 'object'
      ? (data.customer as Record<string, unknown>)
      : {}
  return customer.person && typeof customer.person === 'object'
    ? (customer.person as Record<string, unknown>)
    : {}
}

export function nestedEmployeePerson(
  body: Record<string, unknown>,
  rootKey: 'pilot' | 'flightAttendant'
) {
  const data =
    body.data && typeof body.data === 'object'
      ? (body.data as Record<string, unknown>)
      : {}
  const root =
    data[rootKey] && typeof data[rootKey] === 'object'
      ? (data[rootKey] as Record<string, unknown>)
      : {}
  const employee =
    root.employee && typeof root.employee === 'object'
      ? (root.employee as Record<string, unknown>)
      : {}
  return employee.person && typeof employee.person === 'object'
    ? (employee.person as Record<string, unknown>)
    : {}
}

export function nestedBanks(body: Record<string, unknown>): Record<string, unknown>[] {
  const data =
    body.data && typeof body.data === 'object'
      ? (body.data as Record<string, unknown>)
      : {}
  const rows = data.data
  if (Array.isArray(rows)) return rows as Record<string, unknown>[]
  if (rows && typeof rows === 'object') {
    const nested = (rows as Record<string, unknown>).data
    if (Array.isArray(nested)) return nested as Record<string, unknown>[]
  }
  return []
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

export const allDenied: Record<LegalCategory, boolean> = {
  identificacion: false,
  contacto: false,
  financiero: false,
  salud: false,
  biometrico: false,
}

export const CLEAR_REMAINING = {
  disabilityDescription: 'nota clinica de incapacidad qa',
  traumaPeople: 'Ana y Luis',
  traumaDescription: 'caida en andamio',
  lactationNotes: 'notas de lactancia qa',
  spouseFirstname: 'ConyugeQa',
  spouseLastname: 'Prueba',
  emergencyFirstname: 'EmerQa',
  emergencyLastname: 'Contacto',
  emergencyRelationship: 'hermano',
  biometricData: 'Finger:1, Finger:4, Face',
  faceToken: 'face-token-qa-xyz',
  facePhotoUrl: 's3://gsti-qa/face.jpg',
  empresaRfc: 'VACW850312J95',
  empresaRazon: 'QA Contratante Sensible SA de CV',
  salaryDaily: 1250.75,
  minSalaryDaily: 1000,
  maxSalaryDaily: 2000,
  consentIp: '203.0.113.10',
  consentUa: 'QaAgent/1.0',
} as const

export interface RemainingSensitiveFixture {
  disability: WorkDisability
  note: WorkDisabilityNote
  spouse: EmployeeSpouse
  emergency: EmployeeEmergencyContact
  lactation: EmployeeLactationPeriod
  trauma: TraumaticEventReport
  biometric: EmployeeBiometric
  faceId: EmployeeBiometricFaceId
  salary: EmployeeSalaryHistory
  range: PositionSalaryRange
  empresa: EmpresaContratante
  consent: UserConsent | null
}

export async function grantModuleAction(
  roleId: number,
  moduleSlug: string,
  actionSlug: string
) {
  const permission = await SystemPermission.query()
    .whereNull('system_permission_deleted_at')
    .where('system_permission_slug', actionSlug)
    .whereHas('systemModule', (query) =>
      query.whereNull('system_module_deleted_at').where('system_module_slug', moduleSlug)
    )
    .first()
  if (!permission) {
    throw new Error(`Se requiere ${moduleSlug}:${actionSlug} en BD para este test.`)
  }
  await RoleSystemPermission.firstOrCreate(
    { roleId, systemPermissionId: permission.systemPermissionId },
    { roleId, systemPermissionId: permission.systemPermissionId }
  )
}

export async function createRemainingSensitiveFixture(
  actor: TenantActor,
  base: SensitiveFixture
): Promise<RemainingSensitiveFixture> {
  const coverage = await InsuranceCoverageType.query()
    .whereNull('insurance_coverage_type_deleted_at')
    .firstOrFail()
  const disability = await WorkDisability.create({
    employeeId: base.employee.employeeId,
    insuranceCoverageTypeId: coverage.insuranceCoverageTypeId,
    workDisabilityUuid: `wd-sens15-${Date.now()}`,
  })
  const note = await WorkDisabilityNote.create({
    workDisabilityId: disability.workDisabilityId,
    workDisabilityNoteDescription: CLEAR_REMAINING.disabilityDescription,
    userId: actor.user.userId,
  })
  const spouse = await EmployeeSpouse.create({
    employeeId: base.employee.employeeId,
    employeeSpouseFirstname: CLEAR_REMAINING.spouseFirstname,
    employeeSpouseLastname: CLEAR_REMAINING.spouseLastname,
    employeeSpouseSecondLastname: 'Qa',
    employeeSpouseOcupation: 'QA',
    employeeSpouseBirthday: '1990-01-15',
    employeeSpousePhone: CLEAR_FIXED.phoneSecondary,
  })
  const emergency = await EmployeeEmergencyContact.create({
    employeeId: base.employee.employeeId,
    employeeEmergencyContactFirstname: CLEAR_REMAINING.emergencyFirstname,
    employeeEmergencyContactLastname: CLEAR_REMAINING.emergencyLastname,
    employeeEmergencyContactSecondLastname: 'Qa',
    employeeEmergencyContactRelationship: CLEAR_REMAINING.emergencyRelationship,
    employeeEmergencyContactPhone: CLEAR_FIXED.phone,
  })
  const lactation = new EmployeeLactationPeriod()
  lactation.employeeId = base.employee.employeeId
  lactation.employeeLactationPeriodStartDate = DateTime.now().startOf('day')
  lactation.employeeLactationPeriodEndDate = DateTime.now().startOf('day').plus({ days: 60 })
  lactation.employeeLactationPeriodType = 'reduced_hour'
  lactation.employeeLactationPeriodReductionApplication = 'end'
  lactation.employeeLactationPeriodNotes = CLEAR_REMAINING.lactationNotes
  await lactation.save()
  const traumaType = await TraumaticEventType.query()
    .whereNull('traumatic_event_type_deleted_at')
    .firstOrFail()
  const trauma = await TraumaticEventReport.create({
    employeeId: base.employee.employeeId,
    traumaticEventTypeId: traumaType.traumaticEventTypeId,
    traumaticEventReportOccurredAt: DateTime.now().startOf('day'),
    traumaticEventReportElaboratedAt: DateTime.now(),
    traumaticEventReportInvolvedPeople: CLEAR_REMAINING.traumaPeople,
    traumaticEventReportDescription: CLEAR_REMAINING.traumaDescription,
    traumaticEventReportOrigin: 'rh',
    traumaticEventReportCapturedByUserId: actor.user.userId,
  })
  const biometric = await EmployeeBiometric.create({
    employeeId: base.employee.employeeId,
    businessUnitId: actor.businessUnit.businessUnitId,
    employeeBiometricData: CLEAR_REMAINING.biometricData,
    employeeBiometricStatus: 'completed_both',
  })
  const faceId = await EmployeeBiometricFaceId.create({
    employeeId: base.employee.employeeId,
    businessUnitId: actor.businessUnit.businessUnitId,
    employeeBiometricFaceIdToken: CLEAR_REMAINING.faceToken,
    employeeBiometricFaceIdPhotoUrl: CLEAR_REMAINING.facePhotoUrl,
  })
  const salary = await EmployeeSalaryHistory.create({
    employeeId: base.employee.employeeId,
    salaryDaily: CLEAR_REMAINING.salaryDaily,
    validFrom: DateTime.now().startOf('day'),
    validTo: null,
    changedBy: actor.user.userId,
    reason: 'qa-orden-31',
  })
  const range = await PositionSalaryRange.create({
    businessUnitId: actor.businessUnit.businessUnitId,
    positionId: base.positionId,
    minSalaryDaily: CLEAR_REMAINING.minSalaryDaily,
    maxSalaryDaily: CLEAR_REMAINING.maxSalaryDaily,
    validFrom: DateTime.now().startOf('day'),
    validTo: null,
    createdBy: actor.user.userId,
  })
  const normalizedRfc = normalizeRfc(CLEAR_REMAINING.empresaRfc)
  const empresa = await EmpresaContratante.create({
    businessUnitId: actor.businessUnit.businessUnitId,
    razonSocial: CLEAR_REMAINING.empresaRazon,
    rfc: CLEAR_REMAINING.empresaRfc,
    rfcHash: blindIndex(normalizedRfc),
    domicilioFiscal: 'Calle QA 1, CDMX',
  })
  const legal = await LegalDocument.query().first()
  let consent: UserConsent | null = null
  if (legal) {
    consent = await UserConsent.create({
      userId: actor.user.userId,
      employeeId: base.employee.employeeId,
      legalDocumentId: legal.legalDocumentId,
      userConsentDocumentVersion: 'qa-1',
      userConsentIp: CLEAR_REMAINING.consentIp,
      userConsentUserAgent: CLEAR_REMAINING.consentUa,
      userConsentAcceptedAt: DateTime.now(),
      userConsentChannel: 'digital',
    })
  }
  return {
    disability,
    note,
    spouse,
    emergency,
    lactation,
    trauma,
    biometric,
    faceId,
    salary,
    range,
    empresa,
    consent,
  }
}

export async function cleanupRemainingSensitiveFixture(
  extra: RemainingSensitiveFixture | null
) {
  if (!extra) return
  if (extra.consent) {
    await UserConsent.query().where('user_consent_id', extra.consent.userConsentId).delete()
  }
  await EmpresaContratante.query()
    .where('empresa_contratante_id', extra.empresa.empresaContratanteId)
    .delete()
  await PositionSalaryRange.query()
    .where('position_salary_range_id', extra.range.positionSalaryRangeId)
    .delete()
  await EmployeeSalaryHistory.query()
    .where('employee_salary_history_id', extra.salary.employeeSalaryHistoryId)
    .delete()
  await EmployeeBiometricFaceId.query()
    .where('employee_biometric_face_id_id', extra.faceId.employeeBiometricFaceIdId)
    .delete()
  await EmployeeBiometric.query()
    .where('employee_biometric_id', extra.biometric.employeeBiometricId)
    .delete()
  await TraumaticEventReport.query()
    .where('traumatic_event_report_id', extra.trauma.traumaticEventReportId)
    .delete()
  await EmployeeLactationPeriod.query()
    .where('employee_lactation_period_id', extra.lactation.employeeLactationPeriodId)
    .delete()
  await EmployeeEmergencyContact.query()
    .where('employee_emergency_contact_id', extra.emergency.employeeEmergencyContactId)
    .delete()
  await EmployeeSpouse.query()
    .where('employee_spouse_id', extra.spouse.employeeSpouseId)
    .delete()
  await WorkDisabilityNote.query()
    .where('work_disability_note_id', extra.note.workDisabilityNoteId)
    .delete()
  await WorkDisability.query()
    .where('work_disability_id', extra.disability.workDisabilityId)
    .delete()
}

export function workDisabilityNoteBody(body: Record<string, unknown>) {
  return asRecord(asRecord(body.data).workDisabilityNote)
}

export function spouseBody(body: Record<string, unknown>) {
  return asRecord(asRecord(body.data).employeeSpouse)
}

export function emergencyBody(body: Record<string, unknown>) {
  return asRecord(asRecord(body.data).employeeEmergencyContact)
}

export function firstSalaryDaily(body: Record<string, unknown>): unknown {
  const data = body.data
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(asRecord(data).data)
      ? (asRecord(data).data as unknown[])
      : []
  const first = asRecord(rows[0])
  return first.salaryDaily
}

export function rangeAmounts(body: Record<string, unknown>): {
  min: unknown
  max: unknown
} {
  const data = body.data
  const rows = Array.isArray(data) ? data : []
  const first = asRecord(rows[0])
  return { min: first.minSalaryDaily, max: first.maxSalaryDaily }
}

export function empresaRfcFromShow(body: Record<string, unknown>): unknown {
  const data = asRecord(body.data)
  const direct = asRecord(data.empresaContratante)
  if (direct.rfc !== undefined) return direct.rfc
  if (data.rfc !== undefined) return data.rfc
  return undefined
}

export function expectMaskedHealth(value: unknown, assert: Assert) {
  assert.equal(value, MASK_CHAR.repeat(5))
}

export function expectAmountNull(value: unknown, assert: Assert) {
  assert.isNull(value)
  assert.notEqual(value, '•••0.75')
}
