import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import Employee from '#models/employee'
import { opaqueEmployeeSlug } from '#tests/helpers/employee_fixture'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { TenantContext } from '#utils/tenant_context'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import RoleSystemPermission from '#models/role_system_permission'
import SystemPermission from '#models/system_permission'
import { USER_ACCESS_EMAIL_ERROR_CODES } from '#constants/user_access_email_error_codes'
import { MASK_CHAR } from '#helpers/sensitive_mask'
import { permissionId as employeesPermissionId } from './employees/sensitive_read_by_category_support.js'

/**
 * USRH1789328027034 — barrera API contra correo de acceso enmascarado (CA-1 a CA-5).
 */

const TEST_PASSWORD = 'UserAccessEmailMaskGuard123!'
const MASK_FIXED = MASK_CHAR.repeat(5)

type UsersPermissionSlug = 'create' | 'update'

interface ActorFixture {
  businessUnit: BusinessUnit
  role: Role
  user: User
  person: Person
}

interface PersonalUserFixture {
  user: User
  person: Person
}

interface InstitutionalUserFixture {
  user: User
  person: Person
  employee: Employee
}

interface ForeignUserFixture {
  user: User
  person: Person
  businessUnit: BusinessUnit
}

interface TestFixtures {
  actor: ActorFixture
  personalUser: PersonalUserFixture
  institutionalUser: InstitutionalUserFixture
  foreignUser: ForeignUserFixture
  preparedPerson: Person
}

let fixtures: TestFixtures | null = null

async function uniqueStamp() {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

function maskEmailLegacy(realEmail: string): string {
  const atIdx = realEmail.indexOf('@')
  if (atIdx < 0) return MASK_FIXED
  return `${realEmail[0]}${MASK_CHAR.repeat(3)}${realEmail.slice(atIdx)}`
}

function buHeader(businessUnit: BusinessUnit) {
  return { 'X-Business-Unit-Id': businessUnit.businessUnitPublicId }
}

async function usersPermissionId(slug: UsersPermissionSlug): Promise<number> {
  const permission = await SystemPermission.query()
    .whereNull('system_permission_deleted_at')
    .where('system_permission_slug', slug)
    .whereHas('systemModule', (query) =>
      query.whereNull('system_module_deleted_at').where('system_module_slug', 'users')
    )
    .first()

  if (!permission) {
    throw new Error(`Se requiere el permiso "users:${slug}" en BD para este test.`)
  }

  return permission.systemPermissionId
}

async function grantUsersPermissions(roleId: number, slugs: UsersPermissionSlug[]) {
  await RoleSystemPermission.query()
    .where('role_id', roleId)
    .whereHas('systemPermissions', (permissionQuery) =>
      permissionQuery.whereHas('systemModule', (moduleQuery) =>
        moduleQuery.whereNull('system_module_deleted_at').where('system_module_slug', 'users')
      )
    )
    .delete()

  for (const slug of slugs) {
    await RoleSystemPermission.create({
      roleId,
      systemPermissionId: await usersPermissionId(slug),
    })
  }
}

async function appendEmployeesPermission(roleId: number, slug: string) {
  const permissionId = await employeesPermissionId(slug)
  const existing = await RoleSystemPermission.query()
    .where('role_id', roleId)
    .where('system_permission_id', permissionId)
    .whereNull('role_system_permission_deleted_at')
    .first()

  if (!existing) {
    await RoleSystemPermission.create({
      roleId,
      systemPermissionId: permissionId,
    })
  }
}

async function createBusinessUnit(label: string): Promise<BusinessUnit> {
  const stamp = await uniqueStamp()
  return BusinessUnit.create({
    businessUnitName: `${label} ${stamp}`,
    businessUnitSlug: `${label.toLowerCase().replace(/\s+/g, '-')}-${stamp}`,
    businessUnitLegalName: `${label} Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

async function createPerson(emailPrefix: string, email?: string, businessUnitId?: number): Promise<Person> {
  const stamp = await uniqueStamp()
  return Person.create({
    personFirstname: 'AccessEmail',
    personLastname: 'MaskGuard',
    personSecondLastname: emailPrefix,
    personEmail: email ?? `${emailPrefix}-${stamp}@gsti-tests.local`,
    // USRH1789698261609: sin marca la persona es invisible con `businessScope`.
    businessUnitId: businessUnitId ?? null,
  })
}

async function createUserForPerson(
  person: Person,
  roleId: number,
  businessUnitIds: number[],
  options?: { userEmail?: string; userEmailType?: 'personal' | 'institutional' }
): Promise<User> {
  const user = await User.create({
    userEmail: options?.userEmail ?? person.personEmail!,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    roleId,
    personId: person.personId,
    userEmailType: options?.userEmailType ?? 'institutional',
  })

  if (businessUnitIds.length > 0) {
    await user.related('businessUnits').attach(businessUnitIds)
  }

  return user
}

async function createEmployeeForPerson(
  person: Person,
  businessUnitId: number,
  businessEmail: string
): Promise<Employee> {
  const stamp = await uniqueStamp()
  const now = new Date()
  const departmentInsert = await db.table('departments').insert({
    department_sync_id: stamp,
    department_code: `DEP-${stamp}`,
    department_name: `Dept mask guard ${stamp}`,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    department_active: 1,
    department_created_at: now,
  })
  const positionInsert = await db.table('positions').insert({
    position_sync_id: stamp,
    position_code: `POS-${stamp}`,
    position_name: `Pos mask guard ${stamp}`,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    position_active: 1,
    position_created_at: now,
  })
  const employeeInsert = await db.table('employees').insert({
    employee_slug: opaqueEmployeeSlug(),
    employee_sync_id: `EMP-${stamp}`,
    employee_code: `EMP-${stamp}`,
    employee_first_name: person.personFirstname,
    employee_last_name: person.personLastname,
    employee_second_last_name: person.personSecondLastname,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    payroll_business_unit_id: businessUnitId,
    department_id: Number(departmentInsert[0]),
    position_id: Number(positionInsert[0]),
    person_id: person.personId,
    employee_type_id: 1,
    employee_work_schedule: 'Onsite',
    employee_business_email: businessEmail,
    employee_created_at: now,
  })

  return TenantContext.runUnscoped(
    () => Employee.findOrFail(Number(employeeInsert[0])),
    TENANT_UNSCOPED_REASON.TEST_FIXTURE
  )
}

function assertMaskedEmailRejected(body: Record<string, unknown>, assert: Assert) {
  assert.equal(body.code, USER_ACCESS_EMAIL_ERROR_CODES.MASKED)
  assert.equal(body.key, 'no-fue-posible-guardar-el-correo-de-acceso')
  assert.equal(body.title, 'No fue posible guardar el correo de acceso')
  assert.isString(body.detail)
  assert.notInclude(JSON.stringify(body), MASK_CHAR)
}

async function buildFixtures(): Promise<TestFixtures> {
  const stamp = await uniqueStamp()
  const realPersonalEmail = `ana.lopez-${stamp}@correo.com`
  const realInstitutionalEmail = `work-${stamp}@empresa.com`

  const tenantBu = await createBusinessUnit('Access email mask A')
  const foreignBu = await createBusinessUnit('Access email mask B')

  const role = await Role.create({
    roleName: `Access email mask role ${stamp}`,
    roleSlug: `access-email-mask-${stamp}`,
    roleDescription: 'Rol temporal para barrera de correo enmascarado',
    roleActive: 1,
  })
  await grantUsersPermissions(role.roleId, ['create', 'update'])

  const actorPerson = await createPerson('mask-guard-actor', undefined, tenantBu.businessUnitId)
  const actorUser = await createUserForPerson(actorPerson, role.roleId, [tenantBu.businessUnitId])

  const personalPerson = await createPerson('mask-guard-personal', realPersonalEmail, tenantBu.businessUnitId)
  const personalUser = await createUserForPerson(
    personalPerson,
    role.roleId,
    [tenantBu.businessUnitId],
    { userEmail: realPersonalEmail, userEmailType: 'personal' }
  )

  const institutionalPerson = await createPerson('mask-guard-institutional', undefined, tenantBu.businessUnitId)
  const institutionalEmployee = await createEmployeeForPerson(
    institutionalPerson,
    tenantBu.businessUnitId,
    realInstitutionalEmail
  )
  const institutionalUser = await createUserForPerson(
    institutionalPerson,
    role.roleId,
    [tenantBu.businessUnitId],
    { userEmail: realInstitutionalEmail, userEmailType: 'institutional' }
  )

  const foreignPerson = await createPerson('mask-guard-foreign', undefined, foreignBu.businessUnitId)
  const foreignUser = await createUserForPerson(foreignPerson, role.roleId, [foreignBu.businessUnitId])

  const preparedPerson = await createPerson('mask-guard-prepared', `prepared-${stamp}@correo.com`, tenantBu.businessUnitId)

  return {
    actor: {
      businessUnit: tenantBu,
      role,
      user: actorUser,
      person: actorPerson,
    },
    personalUser: {
      user: personalUser,
      person: personalPerson,
    },
    institutionalUser: {
      user: institutionalUser,
      person: institutionalPerson,
      employee: institutionalEmployee,
    },
    foreignUser: {
      user: foreignUser,
      person: foreignPerson,
      businessUnit: foreignBu,
    },
    preparedPerson,
  }
}

async function cleanupFixtures(data: TestFixtures | null) {
  if (!data) return

  const userIds = [
    data.actor.user.userId,
    data.personalUser.user.userId,
    data.institutionalUser.user.userId,
    data.foreignUser.user.userId,
  ]

  await BusinessUnitUser.query().whereIn('user_id', userIds).delete()
  await User.query().whereIn('user_id', userIds).delete()
  await Employee.query()
    .where('employee_id', data.institutionalUser.employee.employeeId)
    .delete()
  const departmentId = data.institutionalUser.employee.departmentId
  const positionId = data.institutionalUser.employee.positionId
  if (departmentId !== null) {
    await db.from('departments').where('department_id', departmentId).delete()
  }
  if (positionId !== null) {
    await db.from('positions').where('position_id', positionId).delete()
  }

  const personIds = [
    data.actor.person.personId,
    data.personalUser.person.personId,
    data.institutionalUser.person.personId,
    data.foreignUser.person.personId,
    data.preparedPerson.personId,
  ]
  await Person.query().whereIn('person_id', personIds).delete()

  await RoleSystemPermission.query().where('role_id', data.actor.role.roleId).delete()
  await Role.query().where('role_id', data.actor.role.roleId).delete()
  await BusinessUnit.query()
    .whereIn('business_unit_id', [
      data.actor.businessUnit.businessUnitId,
      data.foreignUser.businessUnit.businessUnitId,
    ])
    .delete()
}

test.group('Users — correo de acceso sin máscara (USRH1789328027034)', (group) => {
  group.setup(async () => {
    fixtures = await buildFixtures()
  })

  group.teardown(async () => {
    await cleanupFixtures(fixtures)
    fixtures = null
  })

  test('CA-1: POST con máscara fija rechaza 422 y no crea usuario ni altera personEmail', async ({
    client,
    assert,
  }) => {
    const fx = fixtures!
    const person = fx.preparedPerson
    const emailBefore = person.personEmail

    const response = await client
      .post('/api/users')
      .loginAs(fx.actor.user)
      .headers(buHeader(fx.actor.businessUnit))
      .json({
        userEmail: MASK_FIXED,
        userActive: true,
        roleId: fx.actor.role.roleId,
        personId: person.personId,
        userEmailType: 'personal',
      })

    response.assertStatus(422)
    assertMaskedEmailRejected(response.body(), assert)

    const created = await User.query()
      .where('person_id', person.personId)
      .whereNull('user_deleted_at')
      .first()
    assert.isNull(created)

    const reloaded = await Person.findOrFail(person.personId)
    assert.equal(reloaded.personEmail, emailBefore)
  })

  test('CA-2: PUT personal con máscara heredada rechaza 422 sin alterar user ni personEmail', async ({
    client,
    assert,
  }) => {
    const fx = fixtures!
    const target = fx.personalUser
    const maskedEmail = maskEmailLegacy(target.person.personEmail!)
    const userEmailBefore = target.user.userEmail
    const personEmailBefore = target.person.personEmail

    const response = await client
      .put(`/api/users/${target.user.userId}`)
      .loginAs(fx.actor.user)
      .headers(buHeader(fx.actor.businessUnit))
      .json({
        userEmail: maskedEmail,
        userActive: true,
        roleId: target.user.roleId,
        personId: target.person.personId,
        userEmailType: 'personal',
      })

    response.assertStatus(422)
    assertMaskedEmailRejected(response.body(), assert)

    const reloadedUser = await User.findOrFail(target.user.userId)
    const reloadedPerson = await Person.findOrFail(target.person.personId)
    assert.equal(reloadedUser.userEmail, userEmailBefore)
    assert.equal(reloadedPerson.personEmail, personEmailBefore)
  })

  test('CA-3: PUT institutional con máscara fija rechaza 422 sin alterar user ni employeeBusinessEmail', async ({
    client,
    assert,
  }) => {
    const fx = fixtures!
    const target = fx.institutionalUser
    const userEmailBefore = target.user.userEmail
    const businessEmailBefore = target.employee.employeeBusinessEmail
    const personEmailBefore = target.person.personEmail

    const response = await client
      .put(`/api/users/${target.user.userId}`)
      .loginAs(fx.actor.user)
      .headers(buHeader(fx.actor.businessUnit))
      .json({
        userEmail: MASK_FIXED,
        userActive: true,
        roleId: target.user.roleId,
        personId: target.person.personId,
        userEmailType: 'institutional',
      })

    response.assertStatus(422)
    assertMaskedEmailRejected(response.body(), assert)

    const reloadedUser = await User.findOrFail(target.user.userId)
    const reloadedEmployee = await TenantContext.runUnscoped(
      () => Employee.findOrFail(target.employee.employeeId),
      TENANT_UNSCOPED_REASON.TEST_FIXTURE
    )
    assert.equal(reloadedUser.userEmail, userEmailBefore)
    assert.equal(reloadedEmployee.employeeBusinessEmail, businessEmailBefore)
    const reloadedPerson = await Person.findOrFail(target.person.personId)
    assert.equal(reloadedPerson.personEmail, personEmailBefore)
  })

  test('CA-4: PUT con correo real y escritura de contacto sincroniza userEmail y personEmail', async ({
    client,
    assert,
  }) => {
    const fx = fixtures!
    const target = fx.personalUser
    const newEmail = `ana.nueva-${await uniqueStamp()}@correo.com`

    await appendEmployeesPermission(fx.actor.role.roleId, 'sensitive-contacto-write')

    const response = await client
      .put(`/api/users/${target.user.userId}`)
      .loginAs(fx.actor.user)
      .headers(buHeader(fx.actor.businessUnit))
      .json({
        userEmail: newEmail,
        userActive: true,
        roleId: target.user.roleId,
        personId: target.person.personId,
        userEmailType: 'personal',
      })

    response.assertStatus(201)

    const reloadedUser = await User.findOrFail(target.user.userId)
    const reloadedPerson = await Person.findOrFail(target.person.personId)
    assert.equal(reloadedUser.userEmail, newEmail)
    assert.equal(reloadedPerson.personEmail, newEmail)
  })

  test('CA-5: PUT ajeno con máscara responde 404 de alcance y no 422', async ({ client, assert }) => {
    const fx = fixtures!
    const foreign = fx.foreignUser

    const response = await client
      .put(`/api/users/${foreign.user.userId}`)
      .loginAs(fx.actor.user)
      .headers(buHeader(fx.actor.businessUnit))
      .json({
        userEmail: MASK_FIXED,
        userActive: true,
        roleId: foreign.user.roleId,
        personId: foreign.person.personId,
        userEmailType: 'personal',
      })

    response.assertStatus(404)
    assert.notEqual(response.body()?.code, USER_ACCESS_EMAIL_ERROR_CODES.MASKED)
  })
})
