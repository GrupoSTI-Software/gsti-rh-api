import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import SystemModule from '#models/system_module'
import {
  buHeader,
  cleanupActor,
  cleanupSensitiveFixture,
  createActor,
  createSensitiveFixture,
  employeePerson,
  expectNeverDenied,
  extractEmployeeRows,
  grantOnly,
  type SensitiveFixture,
  type TenantActor,
} from './sensitive_read_by_category_support.js'

/**
 * CA-1 (USRH1787433076994): `Employee.dailySalary` en `GET /api/employees/:id`
 * y en el listado. Sin `sensitive-financiero-read` debe entregarse `null`
 * (nunca `0`, nunca cadena enmascarada).
 *
 * Desde USRH1789328027048 el permiso financiero ya no entrega el importe en
 * GET/listado: `sensitiveSerializeNumeric` devuelve `null` siempre; el claro
 * sale por `GET /api/v1/pii/reveal` (USRH1788478865952).
 */
const DAILY_SALARY = 850.5

test.group('CA-1 — Employee.dailySalary oculto en GET y listado', (group) => {
  let employeesModule: SystemModule
  let actor: TenantActor | null = null
  let fixture: SensitiveFixture | null = null

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
    actor = await createActor('sens-read-ca1-salary')
    await grantOnly(actor.role.roleId, [])
    fixture = await createSensitiveFixture(actor.businessUnit.businessUnitId, 'sens-ca1-salary')
    await db
      .from('employees')
      .where('employee_id', fixture.employee.employeeId)
      .update({ daily_salary: DAILY_SALARY })
  })

  group.teardown(async () => {
    try {
      await cleanupSensitiveFixture(fixture)
      await cleanupActor(actor)
    } finally {
      employeesModule.systemModulePermissionEnforcementActive = false
      await employeesModule.save()
    }
  })

  test('CA-1: GET /api/employees/:id sin sensitive-financiero-read entrega dailySalary null', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-trabajo-read'])
    const response = await client
      .get(`/api/employees/${fixture!.employee.employeeId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))

    expectNeverDenied(response, assert)
    const employee = response.body().data.employee as Record<string, unknown>
    assert.isNull(employee.dailySalary)
    assert.notEqual(employee.dailySalary, 0)
    assert.notTypeOf(employee.dailySalary, 'string')
  })

  test('CA-1: GET /api/employees/:id con sensitive-financiero-read sigue entregando dailySalary null', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-trabajo-read', 'sensitive-financiero-read'])
    const response = await client
      .get(`/api/employees/${fixture!.employee.employeeId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))

    expectNeverDenied(response, assert)
    const employee = response.body().data.employee as Record<string, unknown>
    assert.isNull(employee.dailySalary)
    assert.notEqual(employee.dailySalary, 0)
    assert.notTypeOf(employee.dailySalary, 'string')
  })

  test('CA-1: listado de empleados sin sensitive-financiero-read entrega dailySalary null', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-trabajo-read', 'full-employee-assigned'])
    const response = await client
      .get(`/api/employees/?search=${encodeURIComponent(fixture!.searchToken)}&limit=100`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))

    expectNeverDenied(response, assert)
    const rows = extractEmployeeRows(response.body())
    const row = rows.find(
      (item) => Number(item.employeeId ?? item.employee_id) === fixture!.employee.employeeId
    )
    assert.exists(row)
    assert.isNull(row!.dailySalary)
    assert.notEqual(row!.dailySalary, 0)
    assert.notTypeOf(row!.dailySalary, 'string')
  })

  test('CA-1: listado de empleados con sensitive-financiero-read sigue entregando dailySalary null', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [
      'tab-trabajo-read',
      'full-employee-assigned',
      'sensitive-financiero-read',
    ])
    const response = await client
      .get(`/api/employees/?search=${encodeURIComponent(fixture!.searchToken)}&limit=100`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))

    expectNeverDenied(response, assert)
    const rows = extractEmployeeRows(response.body())
    const row = rows.find(
      (item) => Number(item.employeeId ?? item.employee_id) === fixture!.employee.employeeId
    )
    assert.exists(row)
    assert.isNull(row!.dailySalary)
    assert.notEqual(row!.dailySalary, 0)
    assert.notTypeOf(row!.dailySalary, 'string')
  })

  test('humo: la persona anidada sigue en claro (no se rompió el resto de la ficha)', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-trabajo-read'])
    const response = await client
      .get(`/api/employees/${fixture!.employee.employeeId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectNeverDenied(response, assert)
    const person = employeePerson(response.body())
    assert.equal(person.personFirstname, fixture!.person.personFirstname)
  })
})
