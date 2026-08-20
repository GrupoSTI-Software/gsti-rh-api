import { test } from '@japa/runner'
import { maskSensitiveValue } from '#helpers/sensitive_mask'
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
  employeePerson,
  expectNeverDenied,
  grantOnly,
  loginUserPerson,
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

  test('E.1 CA-6: POST /api/auth/login tapa el correo del actor aunque tenga contacto', async ({
    client,
    assert,
  }) => {
    const originalPersonEmail = actor!.person.personEmail
    const originalUserEmail = actor!.user.userEmail
    const actorEmail = `e2e-login-${Date.now()}@empresa.com`
    try {
      actor!.person.personEmail = actorEmail
      actor!.person.personPhone = fixture!.clear.phone
      await actor!.person.save()
      actor!.user.userEmail = actorEmail
      await actor!.user.save()
      await grantOnly(actor!.role.roleId, ['sensitive-contacto-read'])
      const response = await loginWeb(client, actorEmail, TEST_PASSWORD)
      expectNeverDenied(response, assert)
      const person = loginUserPerson(response.body())
      assert.equal(person.personEmail, maskSensitiveValue(actorEmail, 'contacto'))
      assert.equal(person.personPhone, maskSensitiveValue(fixture!.clear.phone, 'contacto'))
      assert.notEqual(person.personEmail, actorEmail)
    } finally {
      actor!.person.personEmail = originalPersonEmail
      await actor!.person.save()
      actor!.user.userEmail = originalUserEmail
      await actor!.user.save()
    }
  })

  test('E.2: ficha con Bearer del login y contacto destapa email del colaborador', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['sensitive-contacto-read'])
    const login = await loginWeb(client, actor!.user.userEmail, TEST_PASSWORD)
    expectNeverDenied(login, assert)
    const token = bearerFromLogin(login.body())
    const response = await client
      .get(`/api/employees/${fixture!.employee.employeeId}`)
      .header('Authorization', `Bearer ${token}`)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectNeverDenied(response, assert)
    const person = employeePerson(response.body())
    assert.equal(person.personEmail, fixture!.clear.email)
    assert.equal(
      person.personCurp,
      maskSensitiveValue(fixture!.clear.curp, 'identificacion')
    )
  })
})
