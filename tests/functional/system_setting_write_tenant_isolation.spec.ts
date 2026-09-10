import { test } from '@japa/runner'
import UploadService from '#services/upload_service'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import SystemSetting from '#models/system_setting'

/**
 * USRH1789018905972 — aislamiento en las cinco vías de escritura restantes
 * sobre system_settings (DELETE, tres interruptores de correo, POST ícono).
 */

const TEST_PASSWORD = 'SystemSettingWrite123!'
const NON_EXISTENT_SYSTEM_SETTING_ID = 2_147_483_647
const MOLD_SYSTEM_SETTING_ID = 1

interface TestActor {
  user: User
  person: Person
}

interface EmailFlagsSnapshot {
  systemSettingBirthdayEmails: number
  systemSettingAnniversaryEmails: number
  systemSettingAttendanceFaultHrEmails: number
}

function buHeader(businessUnit: BusinessUnit) {
  return { 'X-Business-Unit-Id': businessUnit.businessUnitPublicId }
}

function deleteNotFoundBody(systemSettingId: number | string) {
  return {
    type: 'warning',
    title: 'The system setting was not found',
    message: 'The system setting was not found with the entered ID',
    data: { systemSettingId: String(systemSettingId) },
  }
}

function emailToggleNotFoundBody(systemSettingId: number | string) {
  return {
    type: 'warning',
    title: 'System setting not found',
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
    roleName: `System setting write isolation ${stamp}`,
    roleSlug: `system-setting-write-isolation-${stamp}`,
    roleDescription: 'Rol temporal sin alcance root para escrituras de system settings',
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
    personLastname: 'Write',
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

function snapshotEmailFlags(row: SystemSetting): EmailFlagsSnapshot {
  return {
    systemSettingBirthdayEmails: row.systemSettingBirthdayEmails,
    systemSettingAnniversaryEmails: row.systemSettingAnniversaryEmails,
    systemSettingAttendanceFaultHrEmails: row.systemSettingAttendanceFaultHrEmails,
  }
}

test.group('Escrituras system-settings — aislamiento por tenant', (group) => {
  let businessUnitA: BusinessUnit
  let businessUnitB: BusinessUnit
  let businessUnitC: BusinessUnit
  let systemSettingA: SystemSetting
  let systemSettingB: SystemSetting
  let disposableSetting: SystemSetting
  let actorA: TestActor | null = null
  let limitedRole: Role | null = null

  group.setup(async () => {
    const stamp = Date.now()
    limitedRole = await createLimitedRole(String(stamp))

    businessUnitA = await BusinessUnit.create({
      businessUnitName: `Write Settings BU A ${stamp}`,
      businessUnitSlug: `write-settings-bu-a-${stamp}`,
      businessUnitLegalName: `Write Settings BU A Legal ${stamp}`,
      businessUnitActive: 1,
      businessUnitOrigin: 'platform',
    })

    businessUnitB = await BusinessUnit.create({
      businessUnitName: `Write Settings BU B ${stamp}`,
      businessUnitSlug: `write-settings-bu-b-${stamp}`,
      businessUnitLegalName: `Write Settings BU B Legal ${stamp}`,
      businessUnitActive: 1,
      businessUnitOrigin: 'platform',
    })

    businessUnitC = await BusinessUnit.create({
      businessUnitName: `Write Settings BU C ${stamp}`,
      businessUnitSlug: `write-settings-bu-c-${stamp}`,
      businessUnitLegalName: `Write Settings BU C Legal ${stamp}`,
      businessUnitActive: 1,
      businessUnitOrigin: 'platform',
    })

    systemSettingA = await SystemSetting.create({
      businessUnitId: businessUnitA.businessUnitId,
      systemSettingTradeName: `Trade A ${stamp}`,
      systemSettingSidebarColor: '#111111',
      systemSettingActive: 1,
      systemSettingBusinessUnits: businessUnitA.businessUnitSlug,
      systemSettingBirthdayEmails: 0,
      systemSettingAnniversaryEmails: 0,
      systemSettingAttendanceFaultHrEmails: 0,
      systemSettingEmployeeAplicationIcon: `https://cdn.example.test/icon-a-${stamp}.png`,
    })

    systemSettingB = await SystemSetting.create({
      businessUnitId: businessUnitB.businessUnitId,
      systemSettingTradeName: `Trade B ${stamp}`,
      systemSettingSidebarColor: '#222222',
      systemSettingActive: 1,
      systemSettingBusinessUnits: businessUnitB.businessUnitSlug,
      systemSettingBirthdayEmails: 1,
      systemSettingAnniversaryEmails: 1,
      systemSettingAttendanceFaultHrEmails: 1,
      systemSettingEmployeeAplicationIcon: `https://cdn.example.test/icon-b-${stamp}.png`,
    })

    disposableSetting = await SystemSetting.create({
      businessUnitId: businessUnitC.businessUnitId,
      systemSettingTradeName: `Disposable C ${stamp}`,
      systemSettingSidebarColor: '#333333',
      systemSettingActive: 0,
      systemSettingBusinessUnits: businessUnitC.businessUnitSlug,
    })

    actorA = await createActor(
      'write-settings-a',
      [businessUnitA.businessUnitId, businessUnitC.businessUnitId],
      limitedRole
    )
  })

  group.teardown(async () => {
    for (const id of [
      systemSettingA?.systemSettingId,
      systemSettingB?.systemSettingId,
      disposableSetting?.systemSettingId,
    ]) {
      if (id) {
        await SystemSetting.query().withTrashed().where('system_setting_id', id).delete()
      }
    }
    if (businessUnitA?.businessUnitId) {
      await cleanupBusinessUnit(businessUnitA.businessUnitId)
    }
    if (businessUnitB?.businessUnitId) {
      await cleanupBusinessUnit(businessUnitB.businessUnitId)
    }
    if (businessUnitC?.businessUnitId) {
      await cleanupBusinessUnit(businessUnitC.businessUnitId)
    }
    await cleanupActor(actorA)
    if (limitedRole?.roleId) {
      await Role.query().where('role_id', limitedRole.roleId).delete()
    }
  })

  test('CA-1: interruptor propio de cumpleaños responde 200 y persiste', async ({ client, assert }) => {
    const response = await client
      .put(`/api/system-settings/${systemSettingA.systemSettingId}/birthday-emails`)
      .json({ systemSettingBirthdayEmails: true })
      .loginAs(actorA!.user)
      .headers(buHeader(businessUnitA))

    response.assertStatus(200)
    assert.equal(response.body().title, 'Birthday emails status updated')

    const reloaded = await SystemSetting.query()
      .where('system_setting_id', systemSettingA.systemSettingId)
      .firstOrFail()
    assert.equal(reloaded.systemSettingBirthdayEmails, 1)
  })

  test('CA-1: borrado propio responde 200 y soft-deletea la ficha', async ({ client, assert }) => {
    const response = await client
      .delete(`/api/system-settings/${disposableSetting.systemSettingId}`)
      .loginAs(actorA!.user)
      .headers(buHeader(businessUnitC))

    response.assertStatus(200)
    assert.include(response.body().message, 'settinglot was deleted successfully')

    const trashed = await SystemSetting.query()
      .withTrashed()
      .where('system_setting_id', disposableSetting.systemSettingId)
      .firstOrFail()
    assert.isNotNull(trashed.deletedAt)
  })

  test('CA-2: DELETE ajeno comparte el mismo sobre 404 que id inexistente', async ({
    client,
    assert,
  }) => {
    const foreign = await client
      .delete(`/api/system-settings/${systemSettingB.systemSettingId}`)
      .loginAs(actorA!.user)
      .headers(buHeader(businessUnitA))

    const missing = await client
      .delete(`/api/system-settings/${NON_EXISTENT_SYSTEM_SETTING_ID}`)
      .loginAs(actorA!.user)
      .headers(buHeader(businessUnitA))

    foreign.assertStatus(404)
    missing.assertStatus(404)
    foreign.assertBody(deleteNotFoundBody(systemSettingB.systemSettingId))
    missing.assertBody(deleteNotFoundBody(NON_EXISTENT_SYSTEM_SETTING_ID))
    assert.deepEqual(notFoundEnvelope(missing.body()), notFoundEnvelope(foreign.body()))
  })

  test('CA-2: interruptor ajeno comparte el mismo sobre 404 que id inexistente', async ({
    client,
    assert,
  }) => {
    const foreign = await client
      .put(`/api/system-settings/${systemSettingB.systemSettingId}/anniversary-emails`)
      .json({ systemSettingAnniversaryEmails: false })
      .loginAs(actorA!.user)
      .headers(buHeader(businessUnitA))

    const missing = await client
      .put(`/api/system-settings/${NON_EXISTENT_SYSTEM_SETTING_ID}/anniversary-emails`)
      .json({ systemSettingAnniversaryEmails: false })
      .loginAs(actorA!.user)
      .headers(buHeader(businessUnitA))

    foreign.assertStatus(404)
    missing.assertStatus(404)
    foreign.assertBody(emailToggleNotFoundBody(systemSettingB.systemSettingId))
    missing.assertBody(emailToggleNotFoundBody(NON_EXISTENT_SYSTEM_SETTING_ID))
    assert.deepEqual(notFoundEnvelope(missing.body()), notFoundEnvelope(foreign.body()))
    assert.notProperty(foreign.body().data, 'systemSetting')
  })

  test('CA-3: tras DELETE ajeno la ficha B sigue viva', async ({ client, assert }) => {
    const response = await client
      .delete(`/api/system-settings/${systemSettingB.systemSettingId}`)
      .loginAs(actorA!.user)
      .headers(buHeader(businessUnitA))

    response.assertStatus(404)

    const stillAlive = await SystemSetting.query()
      .where('system_setting_id', systemSettingB.systemSettingId)
      .whereNull('system_setting_deleted_at')
      .first()

    assert.isNotNull(stillAlive)
  })

  test('CA-3: tras interruptor ajeno los flags de B no cambian', async ({ client, assert }) => {
    const before = snapshotEmailFlags(
      await SystemSetting.query().where('system_setting_id', systemSettingB.systemSettingId).firstOrFail()
    )

    const response = await client
      .put(`/api/system-settings/${systemSettingB.systemSettingId}/attendance-fault-hr-emails`)
      .json({ systemSettingAttendanceFaultHrEmails: false })
      .loginAs(actorA!.user)
      .headers(buHeader(businessUnitA))

    response.assertStatus(404)

    const after = snapshotEmailFlags(
      await SystemSetting.query().where('system_setting_id', systemSettingB.systemSettingId).firstOrFail()
    )

    assert.deepEqual(after, before)
  })

  test('CA-4: POST ícono ajeno responde 404 sin borrar el archivo previo', async ({
    client,
    assert,
  }) => {
    let deleteCalls = 0
    const originalDeleteFile = UploadService.prototype.deleteFile
    UploadService.prototype.deleteFile = async () => {
      deleteCalls += 1
      return { status: 200, message: 'ok' } as Awaited<ReturnType<UploadService['deleteFile']>>
    }

    try {
      const iconBefore = systemSettingB.systemSettingEmployeeAplicationIcon

      const response = await client
        .post(`/api/system-settings/${systemSettingB.systemSettingId}/employee-application-icon`)
        .loginAs(actorA!.user)
        .headers(buHeader(businessUnitA))

      response.assertStatus(404)
      response.assertBody(deleteNotFoundBody(systemSettingB.systemSettingId))
      assert.equal(deleteCalls, 0)

      const reloaded = await SystemSetting.query()
        .where('system_setting_id', systemSettingB.systemSettingId)
        .firstOrFail()
      assert.equal(reloaded.systemSettingEmployeeAplicationIcon, iconBefore)
    } finally {
      UploadService.prototype.deleteFile = originalDeleteFile
    }
  })

  test('CA-6: ficha molde responde 404 en las cinco vías', async ({ client }) => {
    const actor = actorA!.user
    const headers = buHeader(businessUnitA)

    const deleteResponse = await client
      .delete(`/api/system-settings/${MOLD_SYSTEM_SETTING_ID}`)
      .loginAs(actor)
      .headers(headers)
    deleteResponse.assertStatus(404)
    deleteResponse.assertBody(deleteNotFoundBody(MOLD_SYSTEM_SETTING_ID))

    const birthdayResponse = await client
      .put(`/api/system-settings/${MOLD_SYSTEM_SETTING_ID}/birthday-emails`)
      .json({ systemSettingBirthdayEmails: true })
      .loginAs(actor)
      .headers(headers)
    birthdayResponse.assertStatus(404)
    birthdayResponse.assertBody(emailToggleNotFoundBody(MOLD_SYSTEM_SETTING_ID))

    const anniversaryResponse = await client
      .put(`/api/system-settings/${MOLD_SYSTEM_SETTING_ID}/anniversary-emails`)
      .json({ systemSettingAnniversaryEmails: true })
      .loginAs(actor)
      .headers(headers)
    anniversaryResponse.assertStatus(404)
    anniversaryResponse.assertBody(emailToggleNotFoundBody(MOLD_SYSTEM_SETTING_ID))

    const attendanceResponse = await client
      .put(`/api/system-settings/${MOLD_SYSTEM_SETTING_ID}/attendance-fault-hr-emails`)
      .json({ systemSettingAttendanceFaultHrEmails: true })
      .loginAs(actor)
      .headers(headers)
    attendanceResponse.assertStatus(404)
    attendanceResponse.assertBody(emailToggleNotFoundBody(MOLD_SYSTEM_SETTING_ID))

    const iconResponse = await client
      .post(`/api/system-settings/${MOLD_SYSTEM_SETTING_ID}/employee-application-icon`)
      .loginAs(actor)
      .headers(headers)
    iconResponse.assertStatus(404)
    iconResponse.assertBody(deleteNotFoundBody(MOLD_SYSTEM_SETTING_ID))
  })

  test('CA-7: sin header responde 400 BU.VAL.000', async ({ client, assert }) => {
    const response = await client
      .put(`/api/system-settings/${systemSettingA.systemSettingId}/birthday-emails`)
      .json({ systemSettingBirthdayEmails: true })
      .loginAs(actorA!.user)

    response.assertStatus(400)
    assert.equal(response.body().key, 'BU.VAL.000')
  })

  test('CA-9: attendance-fault-hr-emails propio responde 200 por HTTP', async ({ client, assert }) => {
    const response = await client
      .put(`/api/system-settings/${systemSettingA.systemSettingId}/attendance-fault-hr-emails`)
      .json({ systemSettingAttendanceFaultHrEmails: true })
      .loginAs(actorA!.user)
      .headers(buHeader(businessUnitA))

    response.assertStatus(200)
    assert.include(response.body().title, 'notificaciones')
  })

  test('CA-9: attendance-fault-hr-emails ajeno responde 404 por HTTP', async ({ client, assert }) => {
    const response = await client
      .put(`/api/system-settings/${systemSettingB.systemSettingId}/attendance-fault-hr-emails`)
      .json({ systemSettingAttendanceFaultHrEmails: false })
      .loginAs(actorA!.user)
      .headers(buHeader(businessUnitA))

    response.assertStatus(404)
    response.assertBody(emailToggleNotFoundBody(systemSettingB.systemSettingId))
    assert.notProperty(response.body().data, 'systemSetting')
  })

  test('CA-9: attendance-fault-hr-emails sin header responde 400 BU.VAL.000', async ({
    client,
    assert,
  }) => {
    const response = await client
      .put(`/api/system-settings/${systemSettingA.systemSettingId}/attendance-fault-hr-emails`)
      .json({ systemSettingAttendanceFaultHrEmails: true })
      .loginAs(actorA!.user)

    response.assertStatus(400)
    assert.equal(response.body().key, 'BU.VAL.000')
  })
})
