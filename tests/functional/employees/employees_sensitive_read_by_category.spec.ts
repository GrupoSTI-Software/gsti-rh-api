import { test } from '@japa/runner'
import SystemModule from '#models/system_module'
import {
  buHeader,
  cleanupActor,
  cleanupSensitiveFixture,
  createActor,
  createSensitiveFixture,
  employeePerson,
  expectNeverDenied,
  expectNonSensitiveIntact,
  grantOnly,
  type SensitiveFixture,
  type TenantActor,
} from './sensitive_read_by_category_support.js'

test.group('Lectura sensible por categoría — HTTP', (group) => {
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
    actor = await createActor('sens-read-http')
    await grantOnly(actor.role.roleId, [])
    fixture = await createSensitiveFixture(actor.businessUnit.businessUnitId, 'sens-http')
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

  test('humo: GET ficha sin grants sensibles responde 200 y deja el nombre en claro', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/employees/${fixture!.employee.employeeId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))

    expectNeverDenied(response, assert)
    const body = response.body()
    const person = employeePerson(body)
    expectNonSensitiveIntact(person, body.data.employee, assert)
  })
})
