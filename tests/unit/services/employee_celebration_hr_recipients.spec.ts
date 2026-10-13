import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import Employee from '#models/employee'
import Person from '#models/person'
import Role from '#models/role'
import User from '#models/user'
import {
  EMPLOYEE_CELEBRATION_EMAIL_KIND,
  EMPLOYEE_CELEBRATION_RUN_UNSCOPED_REASONS,
} from '#constants/employee_celebration_email'
import EmployeeCelebrationEmailService from '#services/employee_celebration_email_service'
import type { HumanCapitalReminderRecipient } from '#services/employee_celebration_email_service'
import { TenantContext } from '#utils/tenant_context'

const stamp = () => `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
const unscopedReason =
  EMPLOYEE_CELEBRATION_RUN_UNSCOPED_REASONS[EMPLOYEE_CELEBRATION_EMAIL_KIND.BIRTHDAY_HR_REMINDER]

test.group('Recordatorios a Recursos Humanos por la marca del rol', () => {
  test('E1 el rol marcado entra con su persona y rh-manager sin marca o sin correo no', async ({
    assert,
  }) => {
    const company = await unit('e1')
    const talento = await role('Talento', company.businessUnitId, true)
    const manager = await role('rh-manager', company.businessUnitId, false)
    const blankRole = await role('talento-sin-correo', company.businessUnitId, true)
    const marked = await user(talento.roleId, 'talento')
    const unmarked = await user(manager.roleId, 'manager')
    const blank = await user(blankRole.roleId, 'vacio')
    await pivot(company.businessUnitId, marked.user.userId, talento.roleId)
    await pivot(company.businessUnitId, unmarked.user.userId, manager.roleId)
    await pivot(company.businessUnitId, blank.user.userId, blankRole.roleId)
    await db.from('users').where('user_id', blank.user.userId).update({ user_email: '   ' })

    try {
      const recipients = await fetchHr([company.businessUnitSlug])
      const ids = recipients.map((recipient) => recipient.user.userId)
      assert.include(ids, marked.user.userId)
      assert.notInclude(ids, unmarked.user.userId)
      assert.notInclude(ids, blank.user.userId)
      const found = recipients.find((recipient) => recipient.user.userId === marked.user.userId)
      assert.equal(found?.user.person.personId, marked.person.personId)
      assert.deepEqual(found?.businessUnitIds, [company.businessUnitId])
    } finally {
      await cleanup([marked, unmarked, blank], [talento, manager, blankRole], [company])
    }
  })

  test('E2 quien es Recursos Humanos en dos empresas sale una vez con las dos', async ({ assert }) => {
    const companyA = await unit('e2-a')
    const companyB = await unit('e2-b')
    const roleA = await role('talento-a', companyA.businessUnitId, true)
    const roleB = await role('talento-b', companyB.businessUnitId, true)
    const account = await user(roleA.roleId, 'ambas')
    await pivot(companyA.businessUnitId, account.user.userId, roleA.roleId)
    await pivot(companyB.businessUnitId, account.user.userId, roleB.roleId)

    try {
      const recipients = await fetchHr([companyA.businessUnitSlug, companyB.businessUnitSlug])
      const own = recipients.filter((recipient) => recipient.user.userId === account.user.userId)
      assert.lengthOf(own, 1)
      assert.deepEqual(
        own[0]?.businessUnitIds,
        [companyA.businessUnitId, companyB.businessUnitId].sort((left, right) => left - right)
      )
    } finally {
      await cleanup([account], [roleA, roleB], [companyA, companyB])
    }
  })

  test('E3 slugs vacíos o desconocidos no devuelven destinatarios', async ({ assert }) => {
    assert.deepEqual(await fetchHr([]), [])
    assert.deepEqual(await fetchHr(['   ']), [])
    assert.deepEqual(await fetchHr([`empresa-inexistente-${stamp()}`]), [])
  })

  test('E4 cada destinatario recibe solo los colaboradores de sus empresas', ({ assert }) => {
    const service = new EmployeeCelebrationEmailService()
    const ofA = employeeOf(10, 1)
    const ofB = employeeOf(20, 2)
    const recipientA = recipientOf([10])
    const recipientB = recipientOf([20])
    const recipientNone = recipientOf([30])
    const recipientBoth = recipientOf([20, 10])

    const batches = service.buildHrReminderBatches(
      [recipientA, recipientB, recipientNone, recipientBoth],
      [ofA, ofB]
    )

    assert.lengthOf(batches, 3)
    assert.deepEqual(idsOf(batches[0]?.employees ?? []), [1])
    assert.deepEqual(idsOf(batches[1]?.employees ?? []), [2])
    assert.deepEqual(idsOf(batches[2]?.employees ?? []), [1, 2])
  })
})

function employeeOf(businessUnitId: number, employeeId: number): Employee {
  const employee = new Employee()
  employee.businessUnitId = businessUnitId
  employee.employeeId = employeeId
  return employee
}

function recipientOf(businessUnitIds: number[]): HumanCapitalReminderRecipient {
  return { user: new User(), businessUnitIds }
}

function idsOf(employees: Employee[]): number[] {
  return employees.map((employee) => employee.employeeId)
}

async function fetchHr(slugs: string[]) {
  return TenantContext.runUnscoped(
    () => new EmployeeCelebrationEmailService().fetchHrUsers(slugs),
    unscopedReason
  )
}

async function unit(label: string): Promise<BusinessUnit> {
  const token = stamp()
  return BusinessUnit.create({
    businessUnitName: `Celebracion ${label} ${token}`,
    businessUnitSlug: `celebracion-${label}-${token}`.toLowerCase(),
    businessUnitLegalName: `Celebracion ${label} ${token}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

async function role(slug: string, businessUnitId: number, humanCapital: boolean): Promise<Role> {
  return Role.create({
    roleName: `Rol ${slug} ${stamp()}`,
    roleSlug: slug,
    roleDescription: 'Rol del recordatorio',
    roleActive: 1,
    businessUnitId,
    roleHumanCapital: humanCapital,
  })
}

async function user(roleId: number, label: string): Promise<{ user: User; person: Person }> {
  const token = stamp()
  const person = await Person.create({
    personFirstname: 'Celebracion',
    personLastname: label,
    personSecondLastname: token,
    personEmail: `celebracion-${label}-${token}@test.local`,
  })
  const created = await User.create({
    userEmail: `celebracion-${label}-${token}@test.local`,
    userPassword: 'CelebracionPrueba123!',
    userActive: 1,
    roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  return { user: created, person }
}

async function pivot(businessUnitId: number, userId: number, roleId: number): Promise<void> {
  const now = new Date()
  await db.table('business_unit_users').insert({
    business_unit_id: businessUnitId,
    user_id: userId,
    role_id: roleId,
    business_unit_user_created_at: now,
    business_unit_user_updated_at: now,
  })
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
    await db.from('roles').where('role_id', item.roleId).delete()
  }
  for (const item of units) {
    await db.from('business_units').where('business_unit_id', item.businessUnitId).delete()
  }
}
