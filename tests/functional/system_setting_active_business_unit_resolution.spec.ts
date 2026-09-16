import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import SystemSetting from '#models/system_setting'

/**
 * Tests funcionales — `GET /api/system-settings-active` y
 * `GET /api/system-settings-get-payroll-config` (USRH1783712837584 +
 * USRH1789018905983).
 *
 * Con header `X-Business-Unit-Id` + sesión autenticada, resuelve la
 * configuración de ESA empresa vía `resolveByBusinessUnitId` (fail-closed).
 * Sin credencial responde 401. Autenticado sin header devuelve siempre la
 * ficha base (`business_unit_id` NULL), nunca la de un cliente sembrado.
 *
 * Convenciones: sin transacción de test; identificadores únicos por
 * timestamp; cleanup explícito en `group.teardown`.
 */

const TEST_PASSWORD = 'ActiveSettings123!'

interface TestActor {
  user: User
  person: Person
}

async function createLimitedRole(stamp: string): Promise<Role> {
  return Role.create({
    roleName: `Active settings isolation ${stamp}`,
    roleSlug: `active-settings-isolation-${stamp}`,
    roleDescription: 'Rol temporal sin alcance root para system-settings-active',
    roleActive: 1,
  })
}

async function createActor(
  email: string,
  businessUnitId: number,
  role: Role
): Promise<TestActor> {

  const person = new Person()
  person.personFirstname = 'Active'
  person.personLastname = 'Settings'
  person.personSecondLastname = 'Test'
  person.personEmail = email
  await person.save()

  const user = new User()
  user.userEmail = email
  user.userPassword = TEST_PASSWORD
  user.userActive = 1
  user.roleId = role.roleId
  user.personId = person.personId
  user.userEmailType = 'institutional'
  await user.save()

  await user.related('businessUnits').attach([businessUnitId])

  return { user, person }
}

async function cleanupActor(actor: TestActor | null) {
  if (!actor) return
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

test.group('GET /api/system-settings-active — resolución por business_unit_id', (group) => {
  let businessUnitA: BusinessUnit
  let businessUnitB: BusinessUnit
  let businessUnitWithoutSettings: BusinessUnit
  let systemSettingA: SystemSetting
  let systemSettingB: SystemSetting
  let actorA: TestActor | null = null
  let actorB: TestActor | null = null
  let actorWithoutSettings: TestActor | null = null
  let limitedRole: Role | null = null

  group.setup(async () => {
    const stamp = Date.now()
    limitedRole = await createLimitedRole(String(stamp))

    businessUnitA = new BusinessUnit()
    businessUnitA.businessUnitName = `Active Settings BU A ${stamp}`
    businessUnitA.businessUnitSlug = `active-settings-bu-a-${stamp}`
    businessUnitA.businessUnitLegalName = `Active Settings BU A Legal ${stamp}`
    businessUnitA.businessUnitActive = 1
    await businessUnitA.save()

    businessUnitB = new BusinessUnit()
    businessUnitB.businessUnitName = `Active Settings BU B ${stamp}`
    businessUnitB.businessUnitSlug = `active-settings-bu-b-${stamp}`
    businessUnitB.businessUnitLegalName = `Active Settings BU B Legal ${stamp}`
    businessUnitB.businessUnitActive = 1
    await businessUnitB.save()

    businessUnitWithoutSettings = new BusinessUnit()
    businessUnitWithoutSettings.businessUnitName = `Active Settings BU Sin Config ${stamp}`
    businessUnitWithoutSettings.businessUnitSlug = `active-settings-bu-sin-config-${stamp}`
    businessUnitWithoutSettings.businessUnitLegalName = `Active Settings BU Sin Config Legal ${stamp}`
    businessUnitWithoutSettings.businessUnitActive = 1
    await businessUnitWithoutSettings.save()

    systemSettingA = new SystemSetting()
    systemSettingA.businessUnitId = businessUnitA.businessUnitId
    systemSettingA.systemSettingTradeName = `Trade A ${stamp}`
    systemSettingA.systemSettingSidebarColor = '#111111'
    systemSettingA.systemSettingActive = 1
    systemSettingA.systemSettingBusinessUnits = businessUnitA.businessUnitSlug
    systemSettingA.systemSettingMonthlyConversionFactor = 30.4
    await systemSettingA.save()

    systemSettingB = new SystemSetting()
    systemSettingB.businessUnitId = businessUnitB.businessUnitId
    systemSettingB.systemSettingTradeName = `Trade B ${stamp}`
    systemSettingB.systemSettingSidebarColor = '#222222'
    systemSettingB.systemSettingActive = 1
    systemSettingB.systemSettingBusinessUnits = businessUnitB.businessUnitSlug
    systemSettingB.systemSettingMonthlyConversionFactor = 30.4
    await systemSettingB.save()

    actorA = await createActor(
      `active-settings-a-${stamp}@gsti-tests.local`,
      businessUnitA.businessUnitId,
      limitedRole
    )
    actorB = await createActor(
      `active-settings-b-${stamp}@gsti-tests.local`,
      businessUnitB.businessUnitId,
      limitedRole
    )
    actorWithoutSettings = await createActor(
      `active-settings-sin-config-${stamp}@gsti-tests.local`,
      businessUnitWithoutSettings.businessUnitId,
      limitedRole
    )
  })

  group.teardown(async () => {
    await cleanupActor(actorA)
    await cleanupActor(actorB)
    await cleanupActor(actorWithoutSettings)
    if (limitedRole?.roleId) {
      await Role.query().where('role_id', limitedRole.roleId).delete()
    }

    const businessUnitIds = [
      businessUnitA?.businessUnitId,
      businessUnitB?.businessUnitId,
      businessUnitWithoutSettings?.businessUnitId,
    ].filter((id): id is number => !!id)

    if (businessUnitIds.length > 0) {
      await SystemSetting.query().withTrashed().whereIn('business_unit_id', businessUnitIds).delete()
      await BusinessUnit.query().whereIn('business_unit_id', businessUnitIds).delete()
    }
  })

  test('sin Authorization: system-settings-active responde 401', async ({ client }) => {
    const response = await client.get('/api/system-settings-active')
    response.assertStatus(401)
  })

  test('sin Authorization: get-payroll-config responde 401', async ({ client }) => {
    const response = await client.get('/api/system-settings-get-payroll-config')
    response.assertStatus(401)
  })

  test('autenticado sin header: devuelve la ficha base, no la de un cliente sembrado', async ({
    client,
    assert,
  }) => {
    if (!actorA) {
      assert.fail('El setup del grupo no preparó al actor de la empresa A')
      return
    }

    const response = await client.get('/api/system-settings-active').loginAs(actorA.user)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.type, 'success')
    assert.isNull(body.data?.systemSetting?.businessUnitId)
    assert.notEqual(body.data?.systemSetting?.systemSettingId, systemSettingA.systemSettingId)
    assert.notEqual(body.data?.systemSetting?.systemSettingId, systemSettingB.systemSettingId)
  })

  test('con header + sesión de la empresa A: devuelve exactamente la configuración de A', async ({
    client,
    assert,
  }) => {
    if (!actorA) {
      assert.fail('El setup del grupo no preparó al actor de la empresa A')
      return
    }

    const response = await client
      .get('/api/system-settings-active')
      .loginAs(actorA.user)
      .header('X-Business-Unit-Id', businessUnitA.businessUnitPublicId)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.type, 'success')
    assert.equal(body.data?.systemSetting?.systemSettingId, systemSettingA.systemSettingId)
    assert.equal(body.data?.systemSetting?.systemSettingTradeName, systemSettingA.systemSettingTradeName)
  })

  test('con header + sesión de la empresa B: devuelve exactamente la configuración de B (sin cruce con A)', async ({
    client,
    assert,
  }) => {
    if (!actorB) {
      assert.fail('El setup del grupo no preparó al actor de la empresa B')
      return
    }

    const response = await client
      .get('/api/system-settings-active')
      .loginAs(actorB.user)
      .header('X-Business-Unit-Id', businessUnitB.businessUnitPublicId)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.type, 'success')
    assert.equal(body.data?.systemSetting?.systemSettingId, systemSettingB.systemSettingId)
    assert.notEqual(body.data?.systemSetting?.systemSettingId, systemSettingA.systemSettingId)
  })

  test('con header ajeno: system-settings-active responde 404 BU.NOT.001', async ({
    client,
    assert,
  }) => {
    if (!actorA) {
      assert.fail('El setup del grupo no preparó al actor de la empresa A')
      return
    }

    const response = await client
      .get('/api/system-settings-active')
      .loginAs(actorA.user)
      .header('X-Business-Unit-Id', businessUnitB.businessUnitPublicId)

    response.assertStatus(404)
    assert.equal(response.body().key, 'BU.NOT.001')
  })

  test('con header propio: get-payroll-config responde 200', async ({ client, assert }) => {
    if (!actorA) {
      assert.fail('El setup del grupo no preparó al actor de la empresa A')
      return
    }

    const response = await client
      .get('/api/system-settings-get-payroll-config')
      .loginAs(actorA.user)
      .header('X-Business-Unit-Id', businessUnitA.businessUnitPublicId)

    response.assertStatus(200)
    assert.equal(response.body().type, 'success')
  })

  test('con header ajeno: get-payroll-config responde 404 BU.NOT.001', async ({ client, assert }) => {
    if (!actorA) {
      assert.fail('El setup del grupo no preparó al actor de la empresa A')
      return
    }

    const response = await client
      .get('/api/system-settings-get-payroll-config')
      .loginAs(actorA.user)
      .header('X-Business-Unit-Id', businessUnitB.businessUnitPublicId)

    response.assertStatus(404)
    assert.equal(response.body().key, 'BU.NOT.001')
  })

  test('con header + sesión de una empresa sin configuración propia: responde 404 fail-closed tipado', async ({
    client,
    assert,
  }) => {
    if (!actorWithoutSettings) {
      assert.fail('El setup del grupo no preparó al actor sin configuración')
      return
    }

    const response = await client
      .get('/api/system-settings-active')
      .loginAs(actorWithoutSettings.user)
      .header('X-Business-Unit-Id', businessUnitWithoutSettings.businessUnitPublicId)

    response.assertStatus(404)
    const body = response.body()
    assert.equal(body.type, 'error')
    assert.equal(body.code, 'SETTINGS.RESOLVE.NOT_FOUND_TENANT')
  })
})
