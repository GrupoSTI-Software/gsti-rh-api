import { test } from '@japa/runner'
import SystemModule from '#models/system_module'
import {
  TEST_PASSWORD,
  activateUser,
  bearerFromLogin,
  buHeader,
  cleanupActor,
  cleanupSensitiveFixture,
  createActor,
  createSensitiveFixture,
  grantOnly,
  loginWeb,
  type SensitiveFixture,
  type TenantActor,
} from '../functional/employees/sensitive_read_by_category_support.js'

test.group('Lectura sensible por categoría — E2E Japa', (group) => {
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
    actor = await createActor('sens-e2e')
    await activateUser(actor.user)
    await grantOnly(actor.role.roleId, [])
    fixture = await createSensitiveFixture(actor.businessUnit.businessUnitId, 'e2e')
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

  test('humo: POST /api/auth/login con cuenta activada responde 200 y token string', async ({
    client,
    assert,
  }) => {
    const response = await loginWeb(client, actor!.user.userEmail, TEST_PASSWORD)
    assert.equal(response.status(), 200)
    const token = bearerFromLogin(response.body())
    assert.isAbove(token.length, 10)
  })
})
