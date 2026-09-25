/**
 * Fixtures reutilizables para la suite de alcance completo de empleados
 * (USRH1788466831312). Proporciona una empresa con dos departamentos, tres
 * empleados (uno sin departamento), y cuatro tipos de actor.
 *
 * Diseño:
 *  - `createFixtures()` crea todo en la BD; `cleanup()` lo borra.
 *  - El fixture es stateless: cada suite crea el suyo propio.
 *  - `owner` se crea con `ensureRole('owner')` y no recibe el permiso
 *    `full-employee-assigned` (edición aditiva respecto a lo que dejó 01).
 */
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import { opaqueEmployeeSlug } from '#tests/helpers/employee_fixture'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { TenantContext } from '#utils/tenant_context'
import RoleDepartment from '#models/role_department'
import RoleSystemPermission from '#models/role_system_permission'
import SystemPermission from '#models/system_permission'
import UserResponsibleEmployee from '#models/user_responsible_employee'
import { ensureRole } from '#tests/helpers/ensure_role'

export const TEST_PASSWORD = 'FullEmployeeScope123!'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface ScopeTenant {
  businessUnit: BusinessUnit
  /** Id del departamento DA1 */
  da1Id: number
  /** Id del departamento DA2 */
  da2Id: number
}

export interface ScopeEmployee {
  employee: Employee
  personId: number
}

export interface ScopeActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
  role: Role
}

export interface EmployeeScopeFixtures {
  /** Empresa principal A */
  tenantA: ScopeTenant
  /** Empresa secundaria B (para validar aislamiento) */
  tenantB: ScopeTenant
  /** E1: empleado en DA1 */
  e1: ScopeEmployee
  /** E2: empleado en DA2 */
  e2: ScopeEmployee
  /** E0: empleado sin departamento en empresa A */
  e0: ScopeEmployee
  /** EB0: empleado sin departamento en empresa B */
  eb0: ScopeEmployee
  /** UC: actor con acceso completo (`full-employee-assigned`) de empresa A, responsable solo de E1 */
  uc: ScopeActor
  /** UR: actor restringido de empresa A con `role_departments = [DA1]` */
  ur: ScopeActor
  /** UO: actor con rol `owner` de empresa A, sin `full-employee-assigned`, responsable de E1 */
  uo: ScopeActor
}

// ─── Helpers internos ────────────────────────────────────────────────────────

async function fullEmployeePermissionId(): Promise<number> {
  const perm = await SystemPermission.query()
    .whereNull('system_permission_deleted_at')
    .where('system_permission_slug', 'full-employee-assigned')
    .first()
  if (!perm) {
    throw new Error(
      '[employee_scope_fixtures] No existe el permiso "full-employee-assigned" en BD. Correr "migration:fresh --seed".'
    )
  }
  return perm.systemPermissionId
}

async function createTenant(label: string): Promise<ScopeTenant> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
  const now = new Date()

  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Scope ${label} ${stamp}`,
    businessUnitSlug: `scope-${label}-${stamp}`,
    businessUnitLegalName: `Scope ${label} legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })

  const [da1] = await db.table('departments').insert({
    department_sync_id: `${stamp}-da1`,
    department_code: `DA1-${stamp}`,
    department_name: `DA1-${label}`,
    company_id: businessUnit.businessUnitId,
    business_unit_id: businessUnit.businessUnitId,
    department_active: 1,
    department_created_at: now,
  })

  const [da2] = await db.table('departments').insert({
    department_sync_id: `${stamp}-da2`,
    department_code: `DA2-${stamp}`,
    department_name: `DA2-${label}`,
    company_id: businessUnit.businessUnitId,
    business_unit_id: businessUnit.businessUnitId,
    department_active: 1,
    department_created_at: now,
  })

  return { businessUnit, da1Id: Number(da1), da2Id: Number(da2) }
}

async function createEmployee(
  businessUnitId: number,
  label: string,
  departmentId: number | null
): Promise<ScopeEmployee> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
  const now = new Date()

  const [positionId] = await db.table('positions').insert({
    position_sync_id: `${stamp}-${label}`,
    position_code: `POS-${stamp}-${label}`,
    position_name: `Puesto ${label}`,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    position_active: 1,
    position_created_at: now,
  })

  const personRecord = await Person.create({
    personFirstname: 'Empleado',
    personLastname: label,
    personSecondLastname: stamp,
    personEmail: `emp-${label}-${stamp}@scope-tests.local`,
  })

  // El insert crudo se salta el hook `beforeCreate` que asigna el slug opaco.
  const [employeeId] = await db.table('employees').insert({
    employee_slug: randomUUID(),
    employee_sync_id: `EMP-${stamp}-${label}`,
    employee_code: `EMP-${stamp}-${label}`,
    employee_first_name: 'Empleado',
    employee_last_name: label,
    employee_second_last_name: stamp,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    payroll_business_unit_id: businessUnitId,
    department_id: departmentId,
    position_id: Number(positionId),
    person_id: personRecord.personId,
    employee_type_id: 1,
    employee_work_schedule: 'Onsite',
    employee_business_email: `emp-work-${label}-${stamp}@scope-tests.local`,
    employee_created_at: now,
  })

  return {
    employee: await TenantContext.runUnscoped(
      () => Employee.findOrFail(Number(employeeId)),
      TENANT_UNSCOPED_REASON.TEST_FIXTURE
    ),
    personId: personRecord.personId,
  }
}

async function createActor(
  emailPrefix: string,
  businessUnit: BusinessUnit,
  roleSlug: 'custom' | 'owner',
  stamp: string
): Promise<ScopeActor> {
  let role: Role
  if (roleSlug === 'owner') {
    role = await ensureRole('owner')
  } else {
    role = await Role.create({
      roleName: `Scope ${emailPrefix} ${stamp}`,
      roleSlug: `scope-${emailPrefix}-${stamp}`,
      roleDescription: 'Rol temporal de alcance de empleados',
      roleActive: 1,
      businessUnitId: businessUnit.businessUnitId,
      roleManagementDays: 10,
    })
  }

  const person = await Person.create({
    personFirstname: 'Actor',
    personLastname: emailPrefix,
    personSecondLastname: stamp,
    personEmail: `${emailPrefix}-${stamp}@scope-tests.local`,
  })
  const user = await User.create({
    userEmail: `${emailPrefix}-${stamp}@scope-tests.local`,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  await user.related('businessUnits').attach([businessUnit.businessUnitId])

  return { user, person, businessUnit, role }
}

// ─── API pública ─────────────────────────────────────────────────────────────

/**
 * Crea todas las entidades necesarias para la suite de alcance completo.
 * Cada llamada produce una instancia aislada de todo.
 */
export async function createEmployeeScopeFixtures(): Promise<EmployeeScopeFixtures> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
  const permId = await fullEmployeePermissionId()

  const tenantA = await createTenant('A')
  const tenantB = await createTenant('B')

  const e1 = await createEmployee(tenantA.businessUnit.businessUnitId, 'E1', tenantA.da1Id)
  const e2 = await createEmployee(tenantA.businessUnit.businessUnitId, 'E2', tenantA.da2Id)
  const e0 = await createEmployee(tenantA.businessUnit.businessUnitId, 'E0', null)
  const eb0 = await createEmployee(tenantB.businessUnit.businessUnitId, 'EB0', null)

  // UC: acceso completo — rol propio con full-employee-assigned
  const uc = await createActor('uc', tenantA.businessUnit, 'custom', stamp)
  await RoleSystemPermission.create({ roleId: uc.role.roleId, systemPermissionId: permId })
  // UC es responsable solo de E1
  await UserResponsibleEmployee.create({
    userId: uc.user.userId,
    employeeId: e1.employee.employeeId,
  })

  // UR: restringido — rol propio con solo DA1
  const ur = await createActor('ur', tenantA.businessUnit, 'custom', stamp)
  await RoleDepartment.create({ roleId: ur.role.roleId, departmentId: tenantA.da1Id })

  // UO: owner sin full-employee-assigned, responsable de E1
  const uo = await createActor('uo', tenantA.businessUnit, 'owner', stamp)
  await UserResponsibleEmployee.create({
    userId: uo.user.userId,
    employeeId: e1.employee.employeeId,
  })

  return { tenantA, tenantB, e1, e2, e0, eb0, uc, ur, uo }
}

/**
 * Borra todas las entidades creadas por `createEmployeeScopeFixtures`.
 */
export async function cleanupEmployeeScopeFixtures(fixtures: EmployeeScopeFixtures): Promise<void> {
  // Limpiar responsables
  await UserResponsibleEmployee.query().where('user_id', fixtures.uc.user.userId).delete()
  await UserResponsibleEmployee.query().where('user_id', fixtures.uo.user.userId).delete()

  // Limpiar empleados (y sus posiciones)
  for (const { employee } of [fixtures.e0, fixtures.e1, fixtures.e2, fixtures.eb0]) {
    await db.from('shift_exceptions').where('employee_id', employee.employeeId).delete()
    await db.from('employee_contracts').where('employee_id', employee.employeeId).delete()
    await db.from('employee_proceeding_files').where('employee_id', employee.employeeId).delete()
    // Borrado físico: `Employee` usa soft deletes y la fila viva bloquearía el
    // borrado del puesto por la llave foránea `employees_position_id_foreign`.
    await db.from('employees').where('employee_id', employee.employeeId).delete()
    await db.from('positions').where('position_id', employee.positionId ?? 0).delete()
  }

  // Limpiar personas de empleados
  for (const { personId } of [fixtures.e0, fixtures.e1, fixtures.e2, fixtures.eb0]) {
    await Person.query().where('person_id', personId).delete()
  }

  // Limpiar actores
  for (const actor of [fixtures.uc, fixtures.ur]) {
    await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
    await RoleDepartment.query().where('role_id', actor.role.roleId).delete()
    await RoleSystemPermission.query().where('role_id', actor.role.roleId).delete()
    await User.query().where('user_id', actor.user.userId).delete()
    await Person.query().where('person_id', actor.person.personId).delete()
    await Role.query().where('role_id', actor.role.roleId).delete()
  }
  // UO usa rol global `owner` — solo limpia usuario y persona
  await BusinessUnitUser.query().where('user_id', fixtures.uo.user.userId).delete()
  await User.query().where('user_id', fixtures.uo.user.userId).delete()
  await Person.query().where('person_id', fixtures.uo.person.personId).delete()

  // Limpiar departamentos y empresas
  for (const tenant of [fixtures.tenantA, fixtures.tenantB]) {
    await db.from('departments').where('department_id', tenant.da1Id).delete()
    await db.from('departments').where('department_id', tenant.da2Id).delete()
    await BusinessUnit.query().where('business_unit_id', tenant.businessUnit.businessUnitId).delete()
  }
}

/**
 * Encabezado `X-Business-Unit-Id` de la empresa A.
 */
export function businessUnitHeaderA(fixtures: EmployeeScopeFixtures): string {
  return fixtures.tenantA.businessUnit.businessUnitPublicId
}

/**
 * Extrae los ids de empleado de una respuesta `data.employees`.
 */
export function extractEmployeeIds(employees: { employeeId?: number; employee_id?: number }[]): number[] {
  return employees.map((e) => e.employeeId ?? e.employee_id ?? 0)
}

/**
 * Crea un contrato por vencer para el empleado dado.
 *
 * @param employeeId - Id del empleado.
 * @param endDate - Fecha de vencimiento (`YYYY-MM-DD`).
 * @param overrides - Opciones adicionales (p. ej. otro `businessUnitId` para datos sucios).
 */
export async function createExpiringContract(
  employeeId: number,
  businessUnitId: number,
  endDate: string,
  overrides: { contractBusinessUnitId?: number } = {}
): Promise<number> {
  const now = new Date()
  const start = new Date(endDate)
  start.setFullYear(start.getFullYear() - 1)
  const startStr = start.toISOString().split('T')[0]

  const positionRow = await db.from('employees').where('employee_id', employeeId).first()
  const contractBusinessUnitId = overrides.contractBusinessUnitId ?? businessUnitId
  // `employee_contracts.department_id` es NOT NULL y estos casos prueban empleados
  // sin departamento: el contrato toma un departamento de su propia empresa.
  const fallbackDepartment = await db
    .from('departments')
    .where('business_unit_id', contractBusinessUnitId)
    .first()
  const contractDepartment = positionRow?.department_id ?? fallbackDepartment?.department_id
  const [id] = await db.table('employee_contracts').insert({
    employee_id: employeeId,
    employee_contract_folio: `FOLIO-${employeeId}-${Date.now()}`,
    employee_contract_type_id: 1, // 'permanent' (siempre existe)
    employee_contract_monthly_net_salary: 10000,
    employee_contract_active: 1,
    employee_contract_start_date: startStr,
    employee_contract_end_date: endDate,
    business_unit_id: contractBusinessUnitId,
    payroll_business_unit_id: contractBusinessUnitId,
    department_id: contractDepartment,
    position_id: positionRow?.position_id ?? null,
    employee_contract_created_at: now,
    employee_contract_updated_at: now,
  })
  return Number(id)
}

/**
 * Crea una excepción de turno de tipo vacación para el empleado dado.
 */
export async function createVacationException(
  employeeId: number,
  date: string,
  vacationExceptionTypeId: number
): Promise<number> {
  const now = new Date()
  const employeeRow = await db.from('employees').where('employee_id', employeeId).first()
  const [id] = await db.table('shift_exceptions').insert({
    employee_id: employeeId,
    business_unit_id: employeeRow?.business_unit_id,
    exception_type_id: vacationExceptionTypeId,
    shift_exceptions_date: date,
    shift_exceptions_description: 'Vacación test scope',
    shift_exceptions_created_at: now,
    shift_exceptions_updated_at: now,
  })
  return Number(id)
}
