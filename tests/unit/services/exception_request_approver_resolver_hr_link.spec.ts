import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import Employee from '#models/employee'
import Person from '#models/person'
import Role from '#models/role'
import User from '#models/user'
import UserResponsibleEmployee from '#models/user_responsible_employee'
import ExceptionRequestApproverResolverService from '#services/exception_request_approver_resolver_service'
import { attachBusinessUnitsWithRole } from '#helpers/attach_business_units_with_role'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { TenantContext } from '#utils/tenant_context'

const stamp = () => `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

test.group('Eslabón de Recursos Humanos por la marca del rol', () => {
  test('CA1 y CA2 el aviso llega a Talento marcado con permiso y no al rol sin marca ni al marcado sin permiso', async ({
    assert,
  }) => {
    const companyA = await unit('A')
    const companyB = await unit('B')
    const talento = await role('talento', companyA.businessUnitId, true)
    const manager = await role('rh-manager', companyA.businessUnitId, false)
    const withoutAccess = await role('rh-sin-acceso', companyA.businessUnitId, true)
    const talentoB = await role('talento-b', companyB.businessUnitId, true)
    await grantRead(talento.roleId)
    await grantRead(manager.roleId)
    await grantRead(talentoB.roleId)

    const marked = await account(talento.roleId, 'talento', companyA.businessUnitId)
    const unmarked = await account(manager.roleId, 'manager', companyA.businessUnitId)
    const noAccess = await account(withoutAccess.roleId, 'sin-acceso', companyA.businessUnitId)
    const foreign = await account(talentoB.roleId, 'talento-b', companyB.businessUnitId)
    await attachBusinessUnitsWithRole(marked.user, [companyA.businessUnitId], talento.roleId)
    await attachBusinessUnitsWithRole(unmarked.user, [companyA.businessUnitId], manager.roleId)
    await attachBusinessUnitsWithRole(noAccess.user, [companyA.businessUnitId], withoutAccess.roleId)
    await attachBusinessUnitsWithRole(foreign.user, [companyB.businessUnitId], talentoB.roleId)

    try {
      const audience = await resolve(companyA.businessUnitId)
      assert.equal(audience?.link, 'hr')
      const ids = audience?.recipients.map((recipient) => recipient.userId) ?? []
      assert.include(ids, marked.user.userId)
      assert.notInclude(ids, unmarked.user.userId)
      assert.notInclude(ids, noAccess.user.userId)
      assert.notInclude(ids, foreign.user.userId)
    } finally {
      await cleanup(
        [marked, unmarked, noAccess, foreign],
        [talento, manager, withoutAccess, talentoB],
        [companyA, companyB]
      )
    }
  })

  test('CA3 manda el rol de la pivote, y el rol de otra empresa no cuenta', async ({ assert }) => {
    const companyA = await unit('pivote-a')
    const companyB = await unit('pivote-b')
    const talento = await role('talento', companyA.businessUnitId, true)
    const talentoB = await role('talento-b', companyB.businessUnitId, true)
    const manager = await role('rh-manager', companyA.businessUnitId, false)
    await grantRead(talento.roleId)
    await grantRead(talentoB.roleId)
    await grantRead(manager.roleId)

    const foreignAccount = await account(talentoB.roleId, 'cuenta-b', companyB.businessUnitId)
    await attachBusinessUnitsWithRole(foreignAccount.user, [companyA.businessUnitId], talentoB.roleId)

    const pivotWins = await account(talento.roleId, 'pivote', companyA.businessUnitId)
    await attachBusinessUnitsWithRole(pivotWins.user, [companyA.businessUnitId], manager.roleId)

    try {
      const audience = await resolve(companyA.businessUnitId)
      const ids = audience?.recipients.map((recipient) => recipient.userId) ?? []
      assert.notInclude(ids, foreignAccount.user.userId)
      assert.notInclude(ids, pivotWins.user.userId)
    } finally {
      await cleanup(
        [foreignAccount, pivotWins],
        [talento, talentoB, manager],
        [companyA, companyB]
      )
    }
  })

  test('CA4 sin Recursos Humanos sube a administración y, si no hay, al dueño', async ({ assert }) => {
    const company = await unit('escala')
    const adminRole = await role('admin', company.businessUnitId, false)
    const ownerRole = await role('owner', company.businessUnitId, false)
    const admin = await account(adminRole.roleId, 'admin', company.businessUnitId)
    const owner = await account(ownerRole.roleId, 'owner', company.businessUnitId)
    await attachBusinessUnitsWithRole(admin.user, [company.businessUnitId], adminRole.roleId)
    await attachBusinessUnitsWithRole(owner.user, [company.businessUnitId], ownerRole.roleId)

    try {
      const withAdmin = await resolve(company.businessUnitId)
      assert.equal(withAdmin?.link, 'admin')
      assert.include(
        withAdmin?.recipients.map((recipient) => recipient.userId) ?? [],
        admin.user.userId
      )

      await db.from('users').where('user_id', admin.user.userId).update({ user_active: 0 })
      const withOwner = await resolve(company.businessUnitId)
      assert.equal(withOwner?.link, 'owner')
      assert.include(
        withOwner?.recipients.map((recipient) => recipient.userId) ?? [],
        owner.user.userId
      )

      await db.from('users').where('user_id', owner.user.userId).update({ user_active: 0 })
      assert.isNull(await resolve(company.businessUnitId))
    } finally {
      await cleanup([admin, owner], [adminRole, ownerRole], [company])
    }
  })

  test('CA5 con jefe directo vivo no se consulta Recursos Humanos', async ({ assert }) => {
    const company = await unit('jefe')
    const talento = await role('talento', company.businessUnitId, true)
    await grantRead(talento.roleId)
    const marked = await account(talento.roleId, 'rh', company.businessUnitId)
    const boss = await account(talento.roleId, 'jefe', company.businessUnitId)
    await attachBusinessUnitsWithRole(marked.user, [company.businessUnitId], talento.roleId)
    const employeeId = await employeeRow(company.businessUnitId, boss.person.personId, null)
    await TenantContext.runUnscoped(
      () =>
        UserResponsibleEmployee.create({
          userId: boss.user.userId,
          employeeId,
          businessUnitId: company.businessUnitId,
          userResponsibleEmployeeReadonly: 0,
          userResponsibleEmployeeDirectBoss: 1,
        }),
      TENANT_UNSCOPED_REASON.TEST_FIXTURE
    )

    try {
      const audience = await resolve(company.businessUnitId, employeeId)
      assert.equal(audience?.link, 'direct-boss')
      const ids = audience?.recipients.map((recipient) => recipient.userId) ?? []
      assert.include(ids, boss.user.userId)
      assert.notInclude(ids, marked.user.userId)
    } finally {
      await db.from('user_responsible_employees').where('employee_id', employeeId).delete()
      await db.from('employees').where('employee_id', employeeId).delete()
      await cleanup([marked, boss], [talento], [company])
    }
  })

  test('CA6 el institucional gana y, si no hay, queda el correo de la cuenta', async ({ assert }) => {
    const company = await unit('correo')
    const talento = await role('talento', company.businessUnitId, true)
    await grantRead(talento.roleId)
    const institutional = await account(talento.roleId, 'institucional', company.businessUnitId)
    const accountOnly = await account(talento.roleId, 'cuenta', company.businessUnitId)
    await attachBusinessUnitsWithRole(institutional.user, [company.businessUnitId], talento.roleId)
    await attachBusinessUnitsWithRole(accountOnly.user, [company.businessUnitId], talento.roleId)
    await db.from('people').where('person_id', accountOnly.person.personId).update({ person_email: null })
    const businessEmail = `trabajo-${stamp()}@empresa.test`
    await employeeRow(company.businessUnitId, institutional.person.personId, businessEmail)

    try {
      const audience = await resolve(company.businessUnitId)
      const byUser = new Map(audience?.recipients.map((recipient) => [recipient.userId, recipient]))
      assert.equal(byUser.get(institutional.user.userId)?.emailKind, 'business')
      assert.equal(byUser.get(institutional.user.userId)?.email, businessEmail)
      assert.equal(byUser.get(accountOnly.user.userId)?.emailKind, 'account')
      assert.equal(byUser.get(accountOnly.user.userId)?.email, accountOnly.user.userEmail)
    } finally {
      await db.from('employees').where('business_unit_id', company.businessUnitId).delete()
      await cleanup([institutional, accountOnly], [talento], [company])
    }
  })
})

function draftEmployee(businessUnitId: number, employeeId = 2_000_000_000): Employee {
  const employee = new Employee()
  employee.employeeId = employeeId
  employee.businessUnitId = businessUnitId
  return employee
}

async function resolve(businessUnitId: number, employeeId?: number) {
  const employee = draftEmployee(businessUnitId, employeeId)
  return TenantContext.runUnscoped(
    () => new ExceptionRequestApproverResolverService().resolveForEmployee(employee),
    TENANT_UNSCOPED_REASON.TEST_FIXTURE
  )
}

async function unit(label: string): Promise<BusinessUnit> {
  const token = stamp()
  return BusinessUnit.create({
    businessUnitName: `Solicitud ${label} ${token}`,
    businessUnitSlug: `solicitud-${label}-${token}`.toLowerCase(),
    businessUnitLegalName: `Solicitud ${label} ${token}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

async function role(slug: string, businessUnitId: number, humanCapital: boolean): Promise<Role> {
  return Role.create({
    roleName: `Rol ${slug} ${stamp()}`,
    roleSlug: slug,
    roleDescription: 'Rol de la cadena de solicitudes',
    roleActive: 1,
    businessUnitId,
    roleHumanCapital: humanCapital,
  })
}

async function account(
  roleId: number,
  label: string,
  businessUnitId: number
): Promise<{ user: User; person: Person }> {
  const token = stamp()
  const person = await Person.create({
    personFirstname: 'Solicitud',
    personLastname: label,
    personSecondLastname: 'Prueba',
    personEmail: `solicitud-${label}-${token}@test.local`,
    businessUnitId,
  })
  const user = await User.create({
    userEmail: `solicitud-${label}-${token}@test.local`,
    userPassword: 'SolicitudRhPrueba123!',
    userActive: 1,
    roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  return { user, person }
}

async function grantRead(roleId: number): Promise<void> {
  const permission = await db
    .from('system_permissions as sp')
    .innerJoin('system_modules as sm', 'sm.system_module_id', 'sp.system_module_id')
    .where('sm.system_module_slug', 'exception-requests')
    .where('sp.system_permission_slug', 'read')
    .whereNull('sp.system_permission_deleted_at')
    .first()
  if (!permission) {
    throw new Error('No está sembrado exception-requests:read')
  }
  const now = new Date()
  await db.table('role_system_permissions').insert({
    role_id: roleId,
    system_permission_id: permission.system_permission_id,
    role_system_permission_created_at: now,
    role_system_permission_updated_at: now,
  })
}

async function employeeRow(
  businessUnitId: number,
  personId: number,
  businessEmail: string | null
): Promise<number> {
  const token = stamp()
  const now = new Date()
  const inserted = await db.table('employees').insert({
    employee_slug: randomUUID(),
    employee_sync_id: `sol-${token}`,
    employee_code: `S${token}`.slice(0, 20),
    employee_first_name: 'Colaborador',
    employee_last_name: 'Prueba',
    employee_second_last_name: 'RH',
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    payroll_business_unit_id: businessUnitId,
    person_id: personId,
    employee_work_schedule: 'Onsite',
    employee_business_email: businessEmail,
    employee_created_at: now,
    employee_updated_at: now,
  })
  return Number(inserted[0])
}

async function cleanup(
  users: Array<{ user: User; person: Person }>,
  roles: Role[],
  units: BusinessUnit[]
): Promise<void> {
  const userIds = users.map((row) => row.user.userId)
  if (userIds.length > 0) {
    await db.from('business_unit_users').whereIn('user_id', userIds).delete()
    await db.from('users').whereIn('user_id', userIds).delete()
    await db.from('people').whereIn('person_id', users.map((row) => row.person.personId)).delete()
  }
  for (const item of roles) {
    await db.from('role_system_permissions').where('role_id', item.roleId).delete()
    await db.from('roles').where('role_id', item.roleId).delete()
  }
  for (const item of units) {
    await db.from('business_units').where('business_unit_id', item.businessUnitId).delete()
  }
}
