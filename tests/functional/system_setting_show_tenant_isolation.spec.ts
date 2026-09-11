import { test } from '@japa/runner'
import { LogStore } from '#models/MongoDB/log_store'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import SystemSetting from '#models/system_setting'

/**
 * USRH1789018905950 — `GET /api/system-settings/:systemSettingId` exige auth +
 * scope de empresa. Cubre CA-1 a CA-6 del spec (401, 400/404 de middleware,
 * lectura propia, 404 uniforme ajeno/inexistente/molde, log best-effort).
 */

const TEST_PASSWORD = 'SystemSettingShow123!'
const NON_EXISTENT_SYSTEM_SETTING_ID = 2_147_483_647
const MOLD_SYSTEM_SETTING_ID = 1
const INVALID_UUID = 'not-a-valid-uuid-v4'

interface TestActor {
  user: User
  person: Person
}

function buHeader(businessUnit: BusinessUnit) {
  return { 'X-Business-Unit-Id': businessUnit.businessUnitPublicId }
}

function notFoundBody(systemSettingId: number | string) {
  return {
    type: 'warning',
    title: 'The system setting was not found',
    message: 'The system setting was not found with the entered ID',
    data: { systemSettingId: String(systemSettingId) },
  }
}

function notFoundEnvelope(body: Record<string, unknown>) {
  return {
    type: body.type,
    title: body.title,
    message: body.message,
  }
}

async function createLimitedRole(stamp: string): Promise<Role> {
  return Role.create({
    roleName: `System setting show isolation ${stamp}`,
    roleSlug: `system-setting-show-isolation-${stamp}`,
    roleDescription: 'Rol temporal sin alcance root para aislamiento de system settings',
    roleActive: 1,
  })
}

async function createActor(
  emailPrefix: string,
  businessUnitIds: number[],
  role: Role
): Promise<TestActor> {
  const stamp = Date.now()

  const person = await Person.create({
    personFirstname: 'SystemSetting',
    personLastname: 'Show',
    personSecondLastname: emailPrefix,
    personEmail: `${emailPrefix}-${stamp}@gsti-tests.local`,
  })

  const user = await User.create({
    userEmail: person.personEmail!,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })

  if (businessUnitIds.length > 0) {
    await user.related('businessUnits').attach(businessUnitIds)
  }

  return { user, person }
}

async function cleanupActor(actor: TestActor | null) {
  if (!actor) return
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

async function cleanupBusinessUnit(businessUnitId: number) {
  await BusinessUnitUser.query().where('business_unit_id', businessUnitId).delete()
  await BusinessUnit.query().where('business_unit_id', businessUnitId).delete()
}

test.group('GET /api/system-settings/:systemSettingId — aislamiento por tenant', (group) => {
  let businessUnitA: BusinessUnit
  let businessUnitB: BusinessUnit
  let systemSettingA: SystemSetting
  let systemSettingB: SystemSetting
  let actorA: TestActor | null = null
  let limitedRole: Role | null = null

  group.setup(async () => {
    const stamp = Date.now()
    limitedRole = await createLimitedRole(String(stamp))

    businessUnitA = await BusinessUnit.create({
      businessUnitName: `Show Settings BU A ${stamp}`,
      businessUnitSlug: `show-settings-bu-a-${stamp}`,
      businessUnitLegalName: `Show Settings BU A Legal ${stamp}`,
      businessUnitActive: 1,
      businessUnitOrigin: 'platform',
    })

    businessUnitB = await BusinessUnit.create({
      businessUnitName: `Show Settings BU B ${stamp}`,
      businessUnitSlug: `show-settings-bu-b-${stamp}`,
      businessUnitLegalName: `Show Settings BU B Legal ${stamp}`,
      businessUnitActive: 1,
      businessUnitOrigin: 'platform',
    })

    systemSettingA = await SystemSetting.create({
      businessUnitId: businessUnitA.businessUnitId,
      systemSettingTradeName: `Trade A ${stamp}`,
      systemSettingSidebarColor: '#111111',
      systemSettingActive: 1,
      systemSettingBusinessUnits: businessUnitA.businessUnitSlug,
      systemSettingMonthlyConversionFactor: 30.4,
    })

    systemSettingB = await SystemSetting.create({
      businessUnitId: businessUnitB.businessUnitId,
      systemSettingTradeName: `Trade B ${stamp}`,
      systemSettingSidebarColor: '#222222',
      systemSettingActive: 1,
      systemSettingBusinessUnits: businessUnitB.businessUnitSlug,
      systemSettingMonthlyConversionFactor: 30.4,
    })

    actorA = await createActor('show-settings-a', [businessUnitA.businessUnitId], limitedRole)
  })

  group.teardown(async () => {
    if (systemSettingA?.systemSettingId) {
      await SystemSetting.query().where('system_setting_id', systemSettingA.systemSettingId).delete()
    }
    if (systemSettingB?.systemSettingId) {
      await SystemSetting.query().where('system_setting_id', systemSettingB.systemSettingId).delete()
    }
    if (businessUnitA?.businessUnitId) {
      await cleanupBusinessUnit(businessUnitA.businessUnitId)
    }
    if (businessUnitB?.businessUnitId) {
      await cleanupBusinessUnit(businessUnitB.businessUnitId)
    }
    await cleanupActor(actorA)
    if (limitedRole?.roleId) {
      await Role.query().where('role_id', limitedRole.roleId).delete()
    }
  })

  test('CA-1: sin Authorization responde 401 y no entrega la ficha', async ({ client, assert }) => {
    const response = await client
      .get(`/api/system-settings/${systemSettingA.systemSettingId}`)
      .header('X-Business-Unit-Id', businessUnitA.businessUnitPublicId)

    response.assertStatus(401)
    assert.notInclude(JSON.stringify(response.body()), systemSettingA.systemSettingTradeName)
  })

  test('CA-2: autenticado sin X-Business-Unit-Id responde 400 BU.VAL.000', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/system-settings/${systemSettingA.systemSettingId}`)
      .loginAs(actorA!.user)

    response.assertStatus(400)
    assert.equal(response.body().key, 'BU.VAL.000')
  })

  test('CA-2: header UUID inválido responde 404 BU.NOT.001', async ({ client, assert }) => {
    const response = await client
      .get(`/api/system-settings/${systemSettingA.systemSettingId}`)
      .loginAs(actorA!.user)
      .header('X-Business-Unit-Id', INVALID_UUID)

    response.assertStatus(404)
    assert.equal(response.body().key, 'BU.NOT.001')
  })

  test('CA-2: header de empresa fuera de alcance responde 404 BU.NOT.001', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/system-settings/${systemSettingA.systemSettingId}`)
      .loginAs(actorA!.user)
      .header('X-Business-Unit-Id', businessUnitB.businessUnitPublicId)

    response.assertStatus(404)
    assert.equal(response.body().key, 'BU.NOT.001')
  })

  test('CA-3: usuario de A con A seleccionada obtiene su ficha (200)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/system-settings/${systemSettingA.systemSettingId}`)
      .loginAs(actorA!.user)
      .headers(buHeader(businessUnitA))

    response.assertStatus(200)
    assert.equal(response.body().type, 'success')
    assert.equal(response.body().title, 'System settings')
    assert.equal(response.body().message, 'The system setting was found successfully')
    assert.equal(
      response.body().data.systemSetting.systemSettingId,
      systemSettingA.systemSettingId
    )
    assert.equal(
      response.body().data.systemSetting.systemSettingTradeName,
      systemSettingA.systemSettingTradeName
    )
    assert.isArray(response.body().data.systemSetting.systemSettingPayrollConfigs)
  })

  test('CA-4: ficha ajena responde 404 idéntico al id inexistente', async ({ client, assert }) => {
    const foreignResponse = await client
      .get(`/api/system-settings/${systemSettingB.systemSettingId}`)
      .loginAs(actorA!.user)
      .headers(buHeader(businessUnitA))

    const missingResponse = await client
      .get(`/api/system-settings/${NON_EXISTENT_SYSTEM_SETTING_ID}`)
      .loginAs(actorA!.user)
      .headers(buHeader(businessUnitA))

    foreignResponse.assertStatus(404)
    missingResponse.assertStatus(404)

    foreignResponse.assertBody(notFoundBody(systemSettingB.systemSettingId))
    missingResponse.assertBody(notFoundBody(NON_EXISTENT_SYSTEM_SETTING_ID))
    assert.deepEqual(
      notFoundEnvelope(missingResponse.body()),
      notFoundEnvelope(foreignResponse.body())
    )
  })

  test('CA-5: ficha molde (id=1) responde el mismo 404 uniforme', async ({ client, assert }) => {
    const moldResponse = await client
      .get(`/api/system-settings/${MOLD_SYSTEM_SETTING_ID}`)
      .loginAs(actorA!.user)
      .headers(buHeader(businessUnitA))

    const missingResponse = await client
      .get(`/api/system-settings/${NON_EXISTENT_SYSTEM_SETTING_ID}`)
      .loginAs(actorA!.user)
      .headers(buHeader(businessUnitA))

    moldResponse.assertStatus(404)
    moldResponse.assertBody(notFoundBody(MOLD_SYSTEM_SETTING_ID))
    assert.deepEqual(
      notFoundEnvelope(missingResponse.body()),
      notFoundEnvelope(moldResponse.body())
    )
  })
})

test.group('GET /api/system-settings/:systemSettingId — log de rechazos (CA-6)', (group) => {
  let businessUnitA: BusinessUnit
  let businessUnitB: BusinessUnit
  let systemSettingB: SystemSetting
  let actorA: TestActor | null = null
  let limitedRole: Role | null = null
  let originalSet: typeof LogStore.set

  group.each.setup(() => {
    originalSet = LogStore.set
  })

  group.each.teardown(() => {
    LogStore.set = originalSet
  })

  group.setup(async () => {
    const stamp = Date.now()
    limitedRole = await createLimitedRole(`${stamp}-log`)

    businessUnitA = await BusinessUnit.create({
      businessUnitName: `Show Log BU A ${stamp}`,
      businessUnitSlug: `show-log-bu-a-${stamp}`,
      businessUnitLegalName: `Show Log BU A Legal ${stamp}`,
      businessUnitActive: 1,
      businessUnitOrigin: 'platform',
    })

    businessUnitB = await BusinessUnit.create({
      businessUnitName: `Show Log BU B ${stamp}`,
      businessUnitSlug: `show-log-bu-b-${stamp}`,
      businessUnitLegalName: `Show Log BU B Legal ${stamp}`,
      businessUnitActive: 1,
      businessUnitOrigin: 'platform',
    })

    systemSettingB = await SystemSetting.create({
      businessUnitId: businessUnitB.businessUnitId,
      systemSettingTradeName: `Trade Log B ${stamp}`,
      systemSettingSidebarColor: '#333333',
      systemSettingActive: 1,
      systemSettingBusinessUnits: businessUnitB.businessUnitSlug,
      systemSettingMonthlyConversionFactor: 30.4,
    })

    actorA = await createActor('show-settings-log', [businessUnitA.businessUnitId], limitedRole)
  })

  group.teardown(async () => {
    if (systemSettingB?.systemSettingId) {
      await SystemSetting.query().where('system_setting_id', systemSettingB.systemSettingId).delete()
    }
    if (businessUnitA?.businessUnitId) {
      await cleanupBusinessUnit(businessUnitA.businessUnitId)
    }
    if (businessUnitB?.businessUnitId) {
      await cleanupBusinessUnit(businessUnitB.businessUnitId)
    }
    await cleanupActor(actorA)
    if (limitedRole?.roleId) {
      await Role.query().where('role_id', limitedRole.roleId).delete()
    }
  })

  test('CA-6: rechazo emite ScopeDeniedLogService con los seis campos', async ({
    client,
    assert,
  }) => {
    let capturedCollection = ''
    let capturedPayload: Record<string, unknown> = {}

    LogStore.set = async (collectionName: string, logData: Record<string, unknown>) => {
      capturedCollection = collectionName
      capturedPayload = logData
    }

    const response = await client
      .get(`/api/system-settings/${systemSettingB.systemSettingId}`)
      .loginAs(actorA!.user)
      .headers(buHeader(businessUnitA))

    response.assertStatus(404)
    response.assertBody(notFoundBody(systemSettingB.systemSettingId))

    assert.equal(capturedCollection, 'log_scope_denied')
    assert.equal(capturedPayload.domain, 'system_setting')
    assert.equal(capturedPayload.action, 'show')
    assert.equal(capturedPayload.requested_id, String(systemSettingB.systemSettingId))
    assert.equal(capturedPayload.actor_user_id, actorA!.user.userId)
    assert.deepEqual(capturedPayload.business_unit_scope, [businessUnitA.businessUnitId])
    assert.isString(capturedPayload.date)
  })

  test('CA-6: si el log falla la respuesta 404 se mantiene igual', async ({ client }) => {
    LogStore.set = async () => {
      throw new Error('Mongo no disponible')
    }

    const response = await client
      .get(`/api/system-settings/${systemSettingB.systemSettingId}`)
      .loginAs(actorA!.user)
      .headers(buHeader(businessUnitA))

    response.assertStatus(404)
    response.assertBody(notFoundBody(systemSettingB.systemSettingId))
  })
})
