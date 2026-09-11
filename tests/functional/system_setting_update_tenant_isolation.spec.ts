import { test } from '@japa/runner'
import { LogStore } from '#models/MongoDB/log_store'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import SystemSetting from '#models/system_setting'

/**
 * USRH1789018905961 — `PUT /api/system-settings/:systemSettingId` exige que la
 * ficha pertenezca al scope antes de escribir campos o tocar archivos de marca.
 */

const TEST_PASSWORD = 'SystemSettingUpdate123!'
const NON_EXISTENT_SYSTEM_SETTING_ID = 2_147_483_647
const MOLD_SYSTEM_SETTING_ID = 1
const MOLD_CSV = 'gsti-rh'

interface TestActor {
  user: User
  person: Person
}

interface SettingSnapshot {
  systemSettingTradeName: string
  systemSettingSidebarColor: string
  systemSettingBusinessUnits: string
  systemSettingLogo: string | null
  systemSettingBanner: string | null
  systemSettingFavicon: string | null
  systemSettingEmployeeAplicationIcon: string | null
  systemSettingActive: number
  systemSettingToleranceCountPerAbsence: number | null
}

function buHeader(businessUnit: BusinessUnit) {
  return { 'X-Business-Unit-Id': businessUnit.businessUnitPublicId }
}

function notFoundEnvelope(body: Record<string, unknown>) {
  return {
    type: body.type,
    title: body.title,
    message: body.message,
  }
}

function snapshotSetting(row: SystemSetting): SettingSnapshot {
  return {
    systemSettingTradeName: row.systemSettingTradeName,
    systemSettingSidebarColor: row.systemSettingSidebarColor,
    systemSettingBusinessUnits: row.systemSettingBusinessUnits,
    systemSettingLogo: row.systemSettingLogo,
    systemSettingBanner: row.systemSettingBanner,
    systemSettingFavicon: row.systemSettingFavicon,
    systemSettingEmployeeAplicationIcon: row.systemSettingEmployeeAplicationIcon,
    systemSettingActive: row.systemSettingActive,
    systemSettingToleranceCountPerAbsence: row.systemSettingToleranceCountPerAbsence,
  }
}

async function createLimitedRole(stamp: string): Promise<Role> {
  return Role.create({
    roleName: `System setting update isolation ${stamp}`,
    roleSlug: `system-setting-update-isolation-${stamp}`,
    roleDescription: 'Rol temporal sin alcance root para PUT de system settings',
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
    personLastname: 'Update',
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

function maliciousUpdateFields(stamp: string) {
  return {
    systemSettingTradeName: `Hacked Trade ${stamp}`,
    systemSettingSidebarColor: '#DEADBE',
    systemSettingActive: '1',
    systemSettingToleranceCountPerAbsence: '99',
    systemSettingRestrictFutureVacation: '0',
    systemSettingPeriodAbsencesBeforeAttendanceLock: 'weekly',
    systemSettingPeriodLateArrivalsBeforeAttendanceLock: 'weekly',
  }
}

async function applyUpdateFields(
  client: { put: (url: string) => ReturnType<import('@japa/api-client').ApiClient['put']> },
  url: string,
  actor: User,
  businessUnit: BusinessUnit,
  fields: Record<string, string>
) {
  let request = client.put(url).loginAs(actor).headers(buHeader(businessUnit))
  for (const [key, value] of Object.entries(fields)) {
    request = request.field(key, value)
  }
  return request
}

test.group('PUT /api/system-settings/:systemSettingId — aislamiento por tenant', (group) => {
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
      businessUnitName: `Update Settings BU A ${stamp}`,
      businessUnitSlug: `update-settings-bu-a-${stamp}`,
      businessUnitLegalName: `Update Settings BU A Legal ${stamp}`,
      businessUnitActive: 1,
      businessUnitOrigin: 'platform',
    })

    businessUnitB = await BusinessUnit.create({
      businessUnitName: `Update Settings BU B ${stamp}`,
      businessUnitSlug: `update-settings-bu-b-${stamp}`,
      businessUnitLegalName: `Update Settings BU B Legal ${stamp}`,
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
      systemSettingLogo: `https://cdn.example.test/system-settings/logo-a-${stamp}.png`,
      systemSettingBanner: `https://cdn.example.test/system-settings/banner-a-${stamp}.png`,
      systemSettingFavicon: `https://cdn.example.test/system-settings/favicon-a-${stamp}.png`,
      systemSettingEmployeeAplicationIcon: `https://cdn.example.test/system-settings/icon-a-${stamp}.png`,
    })

    systemSettingB = await SystemSetting.create({
      businessUnitId: businessUnitB.businessUnitId,
      systemSettingTradeName: `Trade B ${stamp}`,
      systemSettingSidebarColor: '#222222',
      systemSettingActive: 1,
      systemSettingBusinessUnits: businessUnitB.businessUnitSlug,
      systemSettingMonthlyConversionFactor: 30.4,
      systemSettingLogo: `https://cdn.example.test/system-settings/logo-b-${stamp}.png`,
      systemSettingBanner: `https://cdn.example.test/system-settings/banner-b-${stamp}.png`,
      systemSettingFavicon: `https://cdn.example.test/system-settings/favicon-b-${stamp}.png`,
      systemSettingEmployeeAplicationIcon: `https://cdn.example.test/system-settings/icon-b-${stamp}.png`,
    })

    actorA = await createActor('update-settings-a', [businessUnitA.businessUnitId], limitedRole)
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

  test('CA-1: guardado propio sin color en el payload conserva el sidebar vigente', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now()
    const newTradeName = `Solo nombre ${stamp}`
    const colorBefore = systemSettingA.systemSettingSidebarColor

    const response = await applyUpdateFields(
      client,
      `/api/system-settings/${systemSettingA.systemSettingId}`,
      actorA!.user,
      businessUnitA,
      {
        systemSettingTradeName: newTradeName,
        systemSettingActive: '1',
        systemSettingRestrictFutureVacation: '1',
        systemSettingPeriodAbsencesBeforeAttendanceLock: 'monthly',
        systemSettingPeriodLateArrivalsBeforeAttendanceLock: 'monthly',
      }
    )

    response.assertStatus(200)

    const reloaded = await SystemSetting.query()
      .where('system_setting_id', systemSettingA.systemSettingId)
      .firstOrFail()

    assert.equal(reloaded.systemSettingTradeName, newTradeName)
    assert.equal(reloaded.systemSettingSidebarColor, colorBefore)
  })

  test('CA-1: guardado propio responde 200 y persiste los cambios', async ({ client, assert }) => {
    const stamp = Date.now()
    const newTradeName = `Updated Trade A ${stamp}`
    const newColor = '#ABCDEF'

    const response = await applyUpdateFields(
      client,
      `/api/system-settings/${systemSettingA.systemSettingId}`,
      actorA!.user,
      businessUnitA,
      {
        systemSettingTradeName: newTradeName,
        systemSettingSidebarColor: newColor,
        systemSettingActive: '1',
        systemSettingToleranceCountPerAbsence: '5',
        systemSettingRestrictFutureVacation: '1',
        systemSettingPeriodAbsencesBeforeAttendanceLock: 'monthly',
        systemSettingPeriodLateArrivalsBeforeAttendanceLock: 'monthly',
      }
    )

    response.assertStatus(200)
    assert.equal(response.body().type, 'success')

    const reloaded = await SystemSetting.query()
      .where('system_setting_id', systemSettingA.systemSettingId)
      .firstOrFail()

    assert.equal(reloaded.systemSettingTradeName, newTradeName)
    assert.equal(reloaded.systemSettingSidebarColor, newColor)
    assert.equal(reloaded.systemSettingBusinessUnits, businessUnitA.businessUnitSlug)
    assert.equal(reloaded.systemSettingToleranceCountPerAbsence, 5)
  })

  test('CA-2/CA-5: ficha ajena e id inexistente comparten el mismo sobre 404', async ({
    client,
    assert,
  }) => {
    const fields = maliciousUpdateFields(String(Date.now()))

    const foreignResponse = await applyUpdateFields(
      client,
      `/api/system-settings/${systemSettingB.systemSettingId}`,
      actorA!.user,
      businessUnitA,
      fields
    )

    const missingResponse = await applyUpdateFields(
      client,
      `/api/system-settings/${NON_EXISTENT_SYSTEM_SETTING_ID}`,
      actorA!.user,
      businessUnitA,
      fields
    )

    foreignResponse.assertStatus(404)
    missingResponse.assertStatus(404)
    assert.deepEqual(
      notFoundEnvelope(missingResponse.body()),
      notFoundEnvelope(foreignResponse.body())
    )
  })

  test('CA-3: tras rechazo ajeno la ficha B no cambió (campos, CSV ni rutas de imagen)', async ({
    client,
    assert,
  }) => {
    const before = snapshotSetting(
      await SystemSetting.query().where('system_setting_id', systemSettingB.systemSettingId).firstOrFail()
    )

    const response = await applyUpdateFields(
      client,
      `/api/system-settings/${systemSettingB.systemSettingId}`,
      actorA!.user,
      businessUnitA,
      maliciousUpdateFields(String(Date.now()))
    )

    response.assertStatus(404)

    const after = snapshotSetting(
      await SystemSetting.query().where('system_setting_id', systemSettingB.systemSettingId).firstOrFail()
    )

    assert.deepEqual(after, before)
  })

  test('CA-4: ficha molde responde 404 y conserva su CSV', async ({ client, assert }) => {
    const moldBefore = await SystemSetting.query()
      .where('system_setting_id', MOLD_SYSTEM_SETTING_ID)
      .first()

    if (!moldBefore) {
      assert.fail('Se requiere la ficha molde (system_setting_id = 1) en BD para este test')
      return
    }

    const csvBefore = moldBefore.systemSettingBusinessUnits

    const response = await applyUpdateFields(
      client,
      `/api/system-settings/${MOLD_SYSTEM_SETTING_ID}`,
      actorA!.user,
      businessUnitA,
      maliciousUpdateFields(String(Date.now()))
    )

    response.assertStatus(404)

    const moldAfter = await SystemSetting.query()
      .where('system_setting_id', MOLD_SYSTEM_SETTING_ID)
      .firstOrFail()

    assert.equal(moldAfter.systemSettingBusinessUnits, csvBefore)
    assert.include(moldAfter.systemSettingBusinessUnits, MOLD_CSV)
  })
})

test.group('PUT /api/system-settings/:systemSettingId — log de rechazos (CA-6)', (group) => {
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
      businessUnitName: `Update Log BU A ${stamp}`,
      businessUnitSlug: `update-log-bu-a-${stamp}`,
      businessUnitLegalName: `Update Log BU A Legal ${stamp}`,
      businessUnitActive: 1,
      businessUnitOrigin: 'platform',
    })

    businessUnitB = await BusinessUnit.create({
      businessUnitName: `Update Log BU B ${stamp}`,
      businessUnitSlug: `update-log-bu-b-${stamp}`,
      businessUnitLegalName: `Update Log BU B Legal ${stamp}`,
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

    actorA = await createActor('update-settings-log', [businessUnitA.businessUnitId], limitedRole)
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

    const response = await applyUpdateFields(
      client,
      `/api/system-settings/${systemSettingB.systemSettingId}`,
      actorA!.user,
      businessUnitA,
      maliciousUpdateFields(String(Date.now()))
    )

    response.assertStatus(404)

    assert.equal(capturedCollection, 'log_scope_denied')
    assert.equal(capturedPayload.domain, 'system_setting')
    assert.equal(capturedPayload.action, 'update')
    assert.equal(capturedPayload.requested_id, String(systemSettingB.systemSettingId))
    assert.equal(capturedPayload.actor_user_id, actorA!.user.userId)
    assert.deepEqual(capturedPayload.business_unit_scope, [businessUnitA.businessUnitId])
    assert.isString(capturedPayload.date)
  })

  test('CA-6: si el log falla la respuesta 404 se mantiene igual', async ({ client, assert }) => {
    LogStore.set = async () => {
      throw new Error('Mongo no disponible')
    }

    const response = await applyUpdateFields(
      client,
      `/api/system-settings/${systemSettingB.systemSettingId}`,
      actorA!.user,
      businessUnitA,
      maliciousUpdateFields(String(Date.now()))
    )

    response.assertStatus(404)
    assert.equal(response.body().type, 'warning')
  })
})
