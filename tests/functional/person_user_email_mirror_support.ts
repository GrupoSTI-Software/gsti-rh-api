import type { Assert } from '@japa/assert'
import db from '@adonisjs/lucid/services/db'
import mail from '@adonisjs/mail/services/main'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import Person from '#models/person'
import Role from '#models/role'
import User from '#models/user'
import { LogStore } from '#models/MongoDB/log_store'
import { attachBusinessUnitsWithRole } from '#helpers/attach_business_units_with_role'
import type { UserEmailTypeValue } from '#constants/user_email_type'
import {
  addRoleModulePermissions,
  cleanupTenantActor,
  createTenantActor,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * Montaje compartido de USRH1789698261612 (espejo correo ↔ credencial).
 *
 * Dos actores, cada uno con su empresa:
 *  - `full`: usuarios (create, update, credential-change) + empleados (tab-trabajo-write,
 *    tab-persona-write, sensitive-contacto-write, sensitive-financiero-write).
 *  - `limited`: solo usuarios (create, update, credential-change). Sin `sensitive-contacto-write`:
 *    es el actor de los casos de abuso (CA-12, CA-13).
 * Todo lo que crea un caso se anota en el registro y se borra en el teardown.
 */

const TEST_PASSWORD = 'EspejoCorreoCredencial123!'

export const FULL_EMPLOYEES_GRANTS = [
  'tab-trabajo-write',
  'tab-persona-write',
  'sensitive-contacto-write',
  'sensitive-financiero-write',
] as const

export interface MirrorRegistry {
  userIds: number[]
  personIds: number[]
  employeeIds: number[]
  businessUnitIds: number[]
}

export interface MirrorWorld {
  full: TenantActor
  limited: TenantActor
  registry: MirrorRegistry
  restoreLogStore: () => void
}

export function stamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

export function businessUnitHeader(businessUnit: BusinessUnit) {
  return { 'X-Business-Unit-Id': businessUnit.businessUnitPublicId }
}

export async function createMirrorWorld(): Promise<MirrorWorld> {
  mail.fake()
  const originalLogStoreSet = LogStore.set
  LogStore.set = async () => {}
  const full = await createTenantActor('espejo-full')
  await addRoleModulePermissions(full.role, 'users', ['create', 'update', 'credential-change'])
  await addRoleModulePermissions(full.role, 'employees', [...FULL_EMPLOYEES_GRANTS])
  const limited = await createTenantActor('espejo-limited')
  await addRoleModulePermissions(limited.role, 'users', ['create', 'update', 'credential-change'])
  return {
    full,
    limited,
    registry: { userIds: [], personIds: [], employeeIds: [], businessUnitIds: [] },
    restoreLogStore: () => {
      LogStore.set = originalLogStoreSet
    },
  }
}

export async function cleanupMirrorWorld(world: MirrorWorld | null): Promise<void> {
  mail.restore()
  if (!world) return
  world.restoreLogStore()
  const { registry } = world
  if (registry.userIds.length > 0) {
    await BusinessUnitUser.query().whereIn('user_id', registry.userIds).delete()
    await User.query().whereIn('user_id', registry.userIds).delete()
  }
  if (registry.employeeIds.length > 0) {
    await db.from('employee_salary_history').whereIn('employee_id', registry.employeeIds).delete()
    await Employee.query().withTrashed().whereIn('employee_id', registry.employeeIds).delete()
  }
  if (registry.personIds.length > 0) {
    await Person.query().withTrashed().whereIn('person_id', registry.personIds).delete()
  }
  await cleanupTenantActor(world.full)
  await cleanupTenantActor(world.limited)
  if (registry.businessUnitIds.length > 0) {
    await BusinessUnit.query().whereIn('business_unit_id', registry.businessUnitIds).delete()
  }
}

/** Empresa extra (para los casos de alcance). */
export async function createForeignBusinessUnit(registry: MirrorRegistry): Promise<BusinessUnit> {
  const s = stamp()
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Espejo ajena ${s}`,
    businessUnitSlug: `espejo-ajena-${s}`,
    businessUnitLegalName: `Espejo ajena legal ${s}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  registry.businessUnitIds.push(businessUnit.businessUnitId)
  return businessUnit
}

/** Persona marcada con la empresa (609): sin marca sería invisible con `businessScope`. */
export async function createPersonIn(
  registry: MirrorRegistry,
  businessUnit: BusinessUnit,
  personEmail: string | null
): Promise<Person> {
  const person = await Person.create({
    personFirstname: 'Espejo',
    personLastname: 'Correo',
    personSecondLastname: stamp(),
    personEmail,
    businessUnitId: businessUnit.businessUnitId,
  })
  registry.personIds.push(person.personId)
  return person
}

export async function createUserFor(
  registry: MirrorRegistry,
  person: Person,
  role: Role,
  businessUnits: BusinessUnit[],
  options: { userEmail: string; userEmailType: UserEmailTypeValue }
): Promise<User> {
  const user = await User.create({
    userEmail: options.userEmail,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: options.userEmailType,
  })
  registry.userIds.push(user.userId)
  await attachBusinessUnitsWithRole(
    user,
    businessUnits.map((unit) => unit.businessUnitId),
    role.roleId
  )
  return user
}

/** Empleado sin departamento ni puesto: la edición lo permite (USRH1788466831270). */
export async function createEmployeeFor(
  registry: MirrorRegistry,
  person: Person,
  businessUnit: BusinessUnit,
  businessEmail: string
): Promise<Employee> {
  const s = stamp()
  const employee = new Employee()
  employee.employeeSyncId = Date.now() + Math.floor(Math.random() * 1000)
  employee.employeeCode = `ESP-${s}`
  employee.employeeFirstName = 'Espejo'
  employee.employeeLastName = 'Correo'
  employee.employeeSecondLastName = s.slice(0, 20)
  employee.employeePayrollNum = `ESP-${s}`
  employee.employeeBusinessEmail = businessEmail
  employee.companyId = businessUnit.businessUnitId
  employee.personId = person.personId
  employee.businessUnitId = businessUnit.businessUnitId
  employee.payrollBusinessUnitId = businessUnit.businessUnitId
  employee.employeeTypeId = 1
  employee.departmentId = null
  employee.positionId = null
  employee.employeeTerminatedDate = null
  await employee.save()
  registry.employeeIds.push(employee.employeeId)
  return employee
}

export async function readUserRow(userId: number) {
  return db
    .from('users')
    .where('user_id', userId)
    .select(['user_email', 'user_email_type', 'person_id'])
    .first()
}

/** Descifrado por el modelo; fuera de `TenantContext` no hay filtro de empresa. */
export async function readPersonEmail(personId: number): Promise<string | null> {
  const person = await Person.query().where('person_id', personId).firstOrFail()
  return person.personEmail
}

export async function readPersonFirstname(personId: number): Promise<string> {
  const person = await Person.query().where('person_id', personId).firstOrFail()
  return person.personFirstname
}

export async function readEmployeeRow(employeeId: number) {
  return db
    .from('employees')
    .where('employee_id', employeeId)
    .select(['employee_business_email', 'employee_first_name'])
    .first()
}

export async function countSalaryHistory(employeeId: number): Promise<number> {
  const row = await db
    .from('employee_salary_history')
    .where('employee_id', employeeId)
    .count('* as total')
    .first()
  return Number(row?.total ?? 0)
}

export function personBody(person: Person, overrides: Record<string, unknown> = {}) {
  return {
    personFirstname: person.personFirstname,
    personLastname: person.personLastname,
    personSecondLastname: person.personSecondLastname,
    personGender: 'Mujer',
    personBirthday: null,
    personEmail: person.personEmail,
    ...overrides,
  }
}

export function employeeBody(employee: Employee, overrides: Record<string, unknown> = {}) {
  return {
    employeeCode: String(employee.employeeCode),
    employeeFirstName: employee.employeeFirstName ?? '',
    employeeLastName: employee.employeeLastName ?? '',
    employeeSecondLastName: employee.employeeSecondLastName ?? '',
    companyId: employee.companyId,
    departmentId: employee.departmentId,
    positionId: employee.positionId,
    employeeTypeId: employee.employeeTypeId,
    businessUnitId: employee.businessUnitId,
    payrollBusinessUnitId: employee.payrollBusinessUnitId,
    employeeBusinessEmail: employee.employeeBusinessEmail,
    employeeWorkSchedule: 'Onsite',
    employeeWorkScheduleHybridConfig: null,
    ...overrides,
  }
}

export function userBody(user: User, overrides: Record<string, unknown> = {}) {
  return {
    userEmail: user.userEmail,
    userActive: true,
    roleId: user.roleId,
    personId: user.personId,
    ...overrides,
  }
}

/** CA-8 / SEC-6: el cuerpo no identifica al dueño del dato en conflicto. */
export function assertNoDisclosure(
  assert: Assert,
  body: unknown,
  forbidden: ReadonlyArray<string | number>
): void {
  const raw = JSON.stringify(body)
  for (const value of forbidden) {
    assert.notInclude(raw, String(value))
  }
  assert.notInclude(raw, 'ER_DUP_ENTRY')
  assert.notInclude(raw, 'users_email_active_unique')
  assert.notInclude(raw, 'userPassword')
}

export type CapturedLog = { collection: string; payload: Record<string, unknown> }

/** Reemplaza `LogStore.set` durante el caso (mismo molde que employee_store_transactional). */
export function captureLogStore(cleanup: (fn: () => void) => void): CapturedLog[] {
  const original = LogStore.set
  const captured: CapturedLog[] = []
  LogStore.set = async (collectionName: string, logData: Record<string, unknown>) => {
    captured.push({ collection: collectionName, payload: logData })
  }
  cleanup(() => {
    LogStore.set = original
  })
  return captured
}
