import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import ExceptionRequest from '#models/exception_request'
import ExceptionType from '#models/exception_type'
import Person from '#models/person'
import Role from '#models/role'
import User from '#models/user'
import UserResponsibleEmployee from '#models/user_responsible_employee'
import { attachBusinessUnitsWithRole } from '#helpers/attach_business_units_with_role'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { TenantContext } from '#utils/tenant_context'
import {
  addRoleModulePermissions,
  assertPermissionDenied,
  businessUnitHeaders,
  cleanupTenantActor,
  createTenantActor,
  grantModulePermissions,
  grantRoleModulePermissions,
  setModuleEnforcement,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

const stamp = () => `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

test.group('Vista y marca de Recursos Humanos por el flag del rol', (group) => {
  let previousEmployeesEnforcement: boolean | null = null

  group.setup(async () => {
    previousEmployeesEnforcement = await setModuleEnforcement('employees', true)
  })

  group.teardown(async () => {
    if (previousEmployeesEnforcement !== null) {
      await setModuleEnforcement('employees', previousEmployeesEnforcement)
    }
  })

  test('CA7 quien tiene la marca y el permiso ve solo las solicitudes sin jefe directo', async ({
    client,
    assert,
  }) => {
    const actor = await rhActor('vista', true, true)
    const sinJefe = await employeeOf(actor.businessUnit.businessUnitId, 'sin-jefe')
    const conJefe = await employeeOf(actor.businessUnit.businessUnitId, 'con-jefe')
    const boss = await spareUser(actor.businessUnit.businessUnitId, actor.role.roleId, 'jefe')
    await TenantContext.runUnscoped(
      () =>
        UserResponsibleEmployee.create({
          userId: boss.user.userId,
          employeeId: conJefe.employeeId,
          businessUnitId: actor.businessUnit.businessUnitId,
          userResponsibleEmployeeReadonly: 0,
          userResponsibleEmployeeDirectBoss: 1,
        }),
      TENANT_UNSCOPED_REASON.TEST_FIXTURE
    )
    const abierta = await requestOf(sinJefe.employeeId, actor.user.userId, '2032-04-01')
    const asignada = await requestOf(conJefe.employeeId, actor.user.userId, '2032-04-02')

    try {
      const all = await client
        .get('/api/exception-requests/all')
        .loginAs(actor.user)
        .headers(businessUnitHeaders(actor))
        .qs({ limit: 100 })
      assert.equal(all.status(), 200, JSON.stringify(all.body()))
      const allIds = idsOf(all.body())
      assert.include(allIds, abierta)
      assert.notInclude(allIds, asignada)

      const unread = await client
        .get('/api/exception-requests/unread')
        .loginAs(actor.user)
        .headers(businessUnitHeaders(actor))
      assert.equal(unread.status(), 200, JSON.stringify(unread.body()))
      const unreadIds = idsOf(unread.body())
      assert.include(unreadIds, abierta)
      assert.notInclude(unreadIds, asignada)
    } finally {
      await dropRequests([abierta, asignada])
      await db.from('user_responsible_employees').where('employee_id', conJefe.employeeId).delete()
      await dropEmployees([sinJefe.employeeId, conJefe.employeeId])
      await db.from('business_unit_users').where('user_id', boss.user.userId).delete()
      await db.from('users').where('user_id', boss.user.userId).delete()
      await dropPeople([sinJefe.personId, conJefe.personId, boss.person.personId])
      await cleanupTenantActor(actor)
    }
  })

  test('CA8 sin la marca o sin el permiso la vista queda vacía', async ({ client, assert }) => {
    const company = await rhActor('vacia', false, true)
    company.role.roleSlug = 'rh-manager'
    await company.role.save()
    const restricted = await Role.create({
      roleName: `Sin acceso ${stamp()}`,
      roleSlug: 'rh-sin-acceso',
      roleDescription: 'Marcado sin permiso de solicitudes',
      roleActive: 1,
      businessUnitId: company.businessUnit.businessUnitId,
      roleHumanCapital: true,
    })
    await grantRoleModulePermissions(restricted, 'employees', ['tab-trabajo-read'])
    const sinAcceso = await spareUser(company.businessUnit.businessUnitId, restricted.roleId, 'sin-acceso')

    const employee = await employeeOf(company.businessUnit.businessUnitId, 'sola')
    const requestId = await requestOf(employee.employeeId, company.user.userId, '2032-05-01')

    try {
      const unmarked = await client
        .get('/api/exception-requests/all')
        .loginAs(company.user)
        .headers(businessUnitHeaders(company))
        .qs({ limit: 100 })
      assert.equal(unmarked.status(), 200, JSON.stringify(unmarked.body()))
      assert.notInclude(idsOf(unmarked.body()), requestId)

      const noPermission = await client
        .get('/api/exception-requests/all')
        .loginAs(sinAcceso.user)
        .headers(businessUnitHeaders(company))
        .qs({ limit: 100 })
      assert.equal(noPermission.status(), 200, JSON.stringify(noPermission.body()))
      assert.notInclude(idsOf(noPermission.body()), requestId)
    } finally {
      await dropRequests([requestId])
      await dropEmployees([employee.employeeId])
      await db.from('business_unit_users').where('user_id', sinAcceso.user.userId).delete()
      await db.from('users').where('user_id', sinAcceso.user.userId).delete()
      await dropPeople([employee.personId, sinAcceso.person.personId])
      await db.from('role_system_permissions').where('role_id', restricted.roleId).delete()
      await db.from('roles').where('role_id', restricted.roleId).delete()
      await cleanupTenantActor(company)
    }
  })

  test('CA9 capturar para otro deja la solicitud como creada por RH solo si la marca y el permiso coinciden', async ({
    client,
    assert,
  }) => {
    const marked = await rhActor('captura', true, true)
    await addRoleModulePermissions(marked.role, 'employees', ['exception-request'])
    const unmarked = await rhActor('captura-off', false, true)
    await addRoleModulePermissions(unmarked.role, 'employees', ['exception-request'])
    unmarked.role.roleSlug = 'rh-manager'
    await unmarked.role.save()
    const employeeA = await employeeOf(marked.businessUnit.businessUnitId, 'captura-a')
    const employeeB = await employeeOf(unmarked.businessUnit.businessUnitId, 'captura-b')

    try {
      const byRh = await postRequest(client, marked, employeeA.employeeId, '2032-06-01')
      assert.equal(byRh.status(), 201, JSON.stringify(byRh.body()))
      const savedRh = await latestRequest(employeeA.employeeId)
      assert.equal(savedRh.exceptionRequestRhRead, 1)
      assert.equal(savedRh.exceptionRequestGerencialRead, 0)

      const byManager = await postRequest(client, unmarked, employeeB.employeeId, '2032-06-02')
      assert.equal(byManager.status(), 201, JSON.stringify(byManager.body()))
      const savedManager = await latestRequest(employeeB.employeeId)
      assert.equal(savedManager.exceptionRequestRhRead, 0)
      assert.equal(savedManager.exceptionRequestGerencialRead, 1)
    } finally {
      await db.from('exception_requests').whereIn('employee_id', [employeeA.employeeId, employeeB.employeeId]).delete()
      await dropEmployees([employeeA.employeeId, employeeB.employeeId])
      await dropPeople([employeeA.personId, employeeB.personId])
      await cleanupTenantActor(marked)
      await cleanupTenantActor(unmarked)
    }
  })

  test('CA10 la vista y la marca siguen al rol de la empresa de la cabecera', async ({
    client,
    assert,
  }) => {
    const actor = await rhActor('cabecera-a', false, false)
    actor.role.roleSlug = 'admin'
    await actor.role.save()
    await addRoleModulePermissions(actor.role, 'employees', ['exception-request'])

    const companyB = await BusinessUnit.create({
      businessUnitName: `Solicitud B ${stamp()}`,
      businessUnitSlug: `solicitud-b-${stamp()}`.toLowerCase(),
      businessUnitLegalName: `Solicitud B ${stamp()}`,
      businessUnitActive: 1,
      businessUnitOrigin: 'platform',
    })
    const talentoB = await Role.create({
      roleName: `Talento B ${stamp()}`,
      roleSlug: `talento-b-${stamp()}`,
      roleDescription: 'RH de la empresa B',
      roleActive: 1,
      businessUnitId: companyB.businessUnitId,
      roleHumanCapital: true,
    })
    await grantRoleModulePermissions(talentoB, 'employees', ['tab-trabajo-read', 'exception-request'])
    await addRoleModulePermissions(talentoB, 'exception-requests', ['read'])
    await attachBusinessUnitsWithRole(actor.user, [companyB.businessUnitId], talentoB.roleId)

    const employeeA = await employeeOf(actor.businessUnit.businessUnitId, 'empresa-a')
    const employeeB = await employeeOf(companyB.businessUnitId, 'empresa-b')
    const requestA = await requestOf(employeeA.employeeId, actor.user.userId, '2032-07-01')
    const requestB = await requestOf(employeeB.employeeId, actor.user.userId, '2032-07-02')

    try {
      const inA = await client
        .get('/api/exception-requests/all')
        .loginAs(actor.user)
        .headers(businessUnitHeaders(actor))
        .qs({ limit: 100 })
      assert.equal(inA.status(), 200, JSON.stringify(inA.body()))
      assert.notInclude(idsOf(inA.body()), requestA)

      const inB = await client
        .get('/api/exception-requests/all')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', companyB.businessUnitPublicId)
        .qs({ limit: 100 })
      assert.equal(inB.status(), 200, JSON.stringify(inB.body()))
      assert.include(idsOf(inB.body()), requestB)

      const capturedA = await postRequest(client, actor, employeeA.employeeId, '2032-07-03')
      assert.equal(capturedA.status(), 201, JSON.stringify(capturedA.body()))
      const savedA = await latestRequest(employeeA.employeeId)
      assert.equal(savedA.exceptionRequestRhRead, 0)
      assert.equal(savedA.exceptionRequestGerencialRead, 1)

      const capturedB = await postRequest(
        client,
        { ...actor, businessUnit: companyB },
        employeeB.employeeId,
        '2032-07-04'
      )
      assert.equal(capturedB.status(), 201, JSON.stringify(capturedB.body()))
      const savedB = await latestRequest(employeeB.employeeId)
      assert.equal(savedB.exceptionRequestRhRead, 1)
      assert.equal(savedB.exceptionRequestGerencialRead, 0)
    } finally {
      await db
        .from('exception_requests')
        .whereIn('employee_id', [employeeA.employeeId, employeeB.employeeId])
        .delete()
      await dropEmployees([employeeA.employeeId, employeeB.employeeId])
      await dropPeople([employeeA.personId, employeeB.personId])
      await db.from('business_unit_users').where('business_unit_id', companyB.businessUnitId).delete()
      await db.from('role_system_permissions').where('role_id', talentoB.roleId).delete()
      await db.from('roles').where('role_id', talentoB.roleId).delete()
      await db.from('business_units').where('business_unit_id', companyB.businessUnitId).delete()
      await cleanupTenantActor(actor)
    }
  })

  test('CA11 la marca no abre el listado sin permiso de consultar', async ({ client, assert }) => {
    const actor = await createTenantActor('sin-bandeja')
    actor.role.roleHumanCapital = true
    await actor.role.save()
    await grantModulePermissions(actor, 'exception-requests', ['read'])

    try {
      const response = await client
        .get('/api/exception-requests/all')
        .loginAs(actor.user)
        .headers(businessUnitHeaders(actor))
      assertPermissionDenied(assert, response)
    } finally {
      await cleanupTenantActor(actor)
    }
  })
})

async function rhActor(label: string, humanCapital: boolean, withRead: boolean): Promise<TenantActor> {
  const actor = await createTenantActor(label)
  actor.role.roleHumanCapital = humanCapital
  await actor.role.save()
  await grantModulePermissions(actor, 'employees', ['tab-trabajo-read'])
  if (withRead) {
    await addRoleModulePermissions(actor.role, 'exception-requests', ['read'])
  }
  return actor
}

async function spareUser(businessUnitId: number, roleId: number, label: string) {
  const token = stamp()
  const person = await Person.create({
    personFirstname: 'Extra',
    personLastname: label,
    personSecondLastname: 'Prueba',
    personEmail: `extra-${label}-${token}@test.local`,
    businessUnitId,
  })
  const user = await User.create({
    userEmail: `extra-${label}-${token}@test.local`,
    userPassword: 'SolicitudRhPrueba123!',
    userActive: 1,
    roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  await attachBusinessUnitsWithRole(user, [businessUnitId], roleId)
  return { user, person }
}

async function employeeOf(businessUnitId: number, label: string) {
  const token = stamp()
  const person = await Person.create({
    personFirstname: 'Colaborador',
    personLastname: label,
    personSecondLastname: 'Prueba',
    personEmail: `col-${label}-${token}@test.local`,
    businessUnitId,
  })
  const now = new Date()
  const inserted = await db.table('employees').insert({
    employee_slug: randomUUID(),
    employee_sync_id: `rh-${token}`,
    employee_code: `R${token}`.slice(0, 20),
    employee_first_name: 'Colaborador',
    employee_last_name: label.slice(0, 25),
    employee_second_last_name: 'RH',
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    payroll_business_unit_id: businessUnitId,
    person_id: person.personId,
    employee_work_schedule: 'Onsite',
    employee_created_at: now,
    employee_updated_at: now,
  })
  return { employeeId: Number(inserted[0]), personId: person.personId }
}

async function requestOf(employeeId: number, userId: number, requestedDate: string): Promise<number> {
  const exceptionType = await ExceptionType.query().whereNull('exception_type_deleted_at').firstOrFail()
  const created = await TenantContext.runUnscoped(
    () =>
      ExceptionRequest.create({
        employeeId,
        exceptionTypeId: exceptionType.exceptionTypeId,
        exceptionRequestStatus: 'pending',
        exceptionRequestDescription: 'Solicitud de la vista de RH',
        exceptionRequestCheckInTime: null,
        exceptionRequestCheckOutTime: null,
        exceptionRequestPeriodInHours: 0,
        requestedDate,
        exceptionRequestRhRead: 0,
        exceptionRequestGerencialRead: 0,
        userId,
      }),
    TENANT_UNSCOPED_REASON.TEST_FIXTURE
  )
  return created.exceptionRequestId
}

async function postRequest(
  client: ApiClient,
  actor: TenantActor,
  employeeId: number,
  requestedDate: string
) {
  const exceptionType = await ExceptionType.query().whereNull('exception_type_deleted_at').firstOrFail()
  return client
    .post('/api/exception-requests')
    .loginAs(actor.user)
    .headers(businessUnitHeaders(actor))
    .json({
      employeeId,
      exceptionTypeId: exceptionType.exceptionTypeId,
      exceptionRequestStatus: 'pending',
      exceptionRequestDescription: 'Captura de Recursos Humanos',
      requestedDate,
      daysToApply: 1,
    })
}

async function latestRequest(employeeId: number): Promise<ExceptionRequest> {
  return TenantContext.runUnscoped(
    () =>
      ExceptionRequest.query()
        .where('employee_id', employeeId)
        .orderBy('exception_request_id', 'desc')
        .firstOrFail(),
    TENANT_UNSCOPED_REASON.TEST_FIXTURE
  )
}

function idsOf(body: { data?: { data?: Array<{ exceptionRequestId?: number }> } }): number[] {
  const list = body?.data?.data
  if (!Array.isArray(list)) return []
  return list
    .map((item) => item.exceptionRequestId)
    .filter((id): id is number => typeof id === 'number')
}

async function dropRequests(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  await db.from('exception_requests').whereIn('exception_request_id', ids).delete()
}

async function dropEmployees(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  await db.from('employees').whereIn('employee_id', ids).delete()
}

async function dropPeople(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  await db.from('people').whereIn('person_id', ids).delete()
}
