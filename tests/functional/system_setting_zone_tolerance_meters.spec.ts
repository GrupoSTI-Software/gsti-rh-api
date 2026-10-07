import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import SystemSetting from '#models/system_setting'
import RoleSystemPermission from '#models/role_system_permission'
import { grantRoleModulePermissions } from '#tests/helpers/tenant_actor'
import { SYSTEM_SETTING_ZONE_TOLERANCE_METERS_DEFAULT } from '#constants/system_setting_defaults'

/**
 * VLRH-H1790812613753 — margen de tolerancia de la zona de asistencia por empresa.
 *
 * Fija el contrato del campo `systemSettingZoneToleranceMeters` en
 * `POST /api/system-settings` y `PUT /api/system-settings/:systemSettingId`:
 * valor base 50, rango entero 0..200, 400 `SYS.CNFG.VAL.019` fuera de contrato
 * sin escribir nada, conservación del vigente cuando el campo no viaja y
 * aislamiento entre empresas.
 */

const SYSTEM_SETTINGS_MODULE = 'system-settings'
const TEST_PASSWORD = 'ZoneTolerance123!'
const INVALID_KEY = 'margen-tolerancia-zona-invalido'
const INVALID_CODE = 'SYS.CNFG.VAL.019'

interface TestActor {
  user: User
  person: Person
}

function buHeader(businessUnit: BusinessUnit) {
  return { 'X-Business-Unit-Id': businessUnit.businessUnitPublicId }
}

async function createBusinessUnit(label: string, stamp: number): Promise<BusinessUnit> {
  return BusinessUnit.create({
    businessUnitName: `Zone Tolerance ${label} ${stamp}`,
    businessUnitSlug: `zone-tolerance-${label.toLowerCase()}-${stamp}`,
    businessUnitLegalName: `Zone Tolerance ${label} Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

async function createSetting(businessUnit: BusinessUnit, stamp: number): Promise<SystemSetting> {
  return SystemSetting.create({
    businessUnitId: businessUnit.businessUnitId,
    systemSettingTradeName: `Trade ${businessUnit.businessUnitId} ${stamp}`,
    systemSettingSidebarColor: '#111111',
    systemSettingActive: 1,
    systemSettingMonthlyConversionFactor: 30.4,
  })
}

async function createActor(businessUnitIds: number[], role: Role): Promise<TestActor> {
  const stamp = Date.now()
  const person = await Person.create({
    personFirstname: 'Zone',
    personLastname: 'Tolerance',
    personSecondLastname: 'Spec',
    personEmail: `zone-tolerance-${stamp}@gsti-tests.local`,
  })
  const user = await User.create({
    userEmail: person.personEmail!,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  await user.related('businessUnits').attach(businessUnitIds)
  return { user, person }
}

/** Escalares que el BO reenvía en cada guardado de la ficha. */
function baseFields(row: SystemSetting): Record<string, string> {
  return {
    systemSettingTradeName: row.systemSettingTradeName,
    systemSettingSidebarColor: row.systemSettingSidebarColor,
    systemSettingActive: '1',
    systemSettingRestrictFutureVacation: '1',
    systemSettingPeriodAbsencesBeforeAttendanceLock: 'monthly',
    systemSettingPeriodLateArrivalsBeforeAttendanceLock: 'monthly',
  }
}

function sendFields(
  request: ReturnType<import('@japa/api-client').ApiClient['put']>,
  fields: Record<string, string>
) {
  let built = request
  for (const [key, value] of Object.entries(fields)) {
    built = built.field(key, value)
  }
  return built
}

async function reloadSetting(systemSettingId: number): Promise<SystemSetting> {
  return SystemSetting.query().where('system_setting_id', systemSettingId).firstOrFail()
}

async function setMargin(row: SystemSetting, meters: number) {
  await SystemSetting.query()
    .where('system_setting_id', row.systemSettingId)
    .update({ system_setting_zone_tolerance_meters: meters })
}

test.group('Ajustes Generales — margen de tolerancia de zona (VLRH-H1790812613753)', (group) => {
  let stamp: number
  let businessUnitA: BusinessUnit
  let businessUnitB: BusinessUnit
  let businessUnitC: BusinessUnit
  let settingA: SystemSetting
  let settingB: SystemSetting
  let actor: TestActor | null = null
  let role: Role | null = null

  group.setup(async () => {
    stamp = Date.now()
    role = await Role.create({
      roleName: `Zone tolerance ${stamp}`,
      roleSlug: `zone-tolerance-${stamp}`,
      roleDescription: 'Rol temporal para el margen de tolerancia de zona',
      roleActive: 1,
    })
    await grantRoleModulePermissions(role, SYSTEM_SETTINGS_MODULE, ['read', 'create', 'update'])

    businessUnitA = await createBusinessUnit('A', stamp)
    businessUnitB = await createBusinessUnit('B', stamp)
    businessUnitC = await createBusinessUnit('C', stamp)
    settingA = await createSetting(businessUnitA, stamp)
    settingB = await createSetting(businessUnitB, stamp)

    actor = await createActor(
      [businessUnitA.businessUnitId, businessUnitB.businessUnitId, businessUnitC.businessUnitId],
      role
    )
  })

  group.each.setup(async () => {
    await setMargin(settingA, SYSTEM_SETTING_ZONE_TOLERANCE_METERS_DEFAULT)
    await setMargin(settingB, SYSTEM_SETTING_ZONE_TOLERANCE_METERS_DEFAULT)
    await SystemSetting.query().where('business_unit_id', businessUnitC.businessUnitId).delete()
  })

  group.teardown(async () => {
    const businessUnitIds = [businessUnitA, businessUnitB, businessUnitC]
      .filter((bu) => bu?.businessUnitId)
      .map((bu) => bu.businessUnitId)
    await SystemSetting.query().whereIn('business_unit_id', businessUnitIds).delete()
    await BusinessUnitUser.query().whereIn('business_unit_id', businessUnitIds).delete()
    if (actor) {
      await User.query().where('user_id', actor.user.userId).delete()
      await Person.query().where('person_id', actor.person.personId).delete()
    }
    await BusinessUnit.query().whereIn('business_unit_id', businessUnitIds).delete()
    if (role?.roleId) {
      await RoleSystemPermission.query().where('role_id', role.roleId).delete()
      await Role.query().where('role_id', role.roleId).delete()
    }
  })

  test('CA-1: la fila existente nace en 50 y la lectura lo devuelve', async ({ client, assert }) => {
    const reloaded = await reloadSetting(settingA.systemSettingId)
    assert.equal(reloaded.systemSettingZoneToleranceMeters, 50)

    const response = await client
      .get(`/api/system-settings/${settingA.systemSettingId}`)
      .loginAs(actor!.user)
      .headers(buHeader(businessUnitA))

    response.assertStatus(200)
    assert.equal(response.body().data.systemSetting.systemSettingZoneToleranceMeters, 50)
  })

  test('CA-4: los bordes 0 y 200 y un valor intermedio se guardan tal cual', async ({
    client,
    assert,
  }) => {
    for (const meters of [0, 80, 200]) {
      const response = await sendFields(
        client
          .put(`/api/system-settings/${settingA.systemSettingId}`)
          .loginAs(actor!.user)
          .headers(buHeader(businessUnitA)),
        { ...baseFields(settingA), systemSettingZoneToleranceMeters: String(meters) }
      )
      response.assertStatus(200)
      const reloaded = await reloadSetting(settingA.systemSettingId)
      assert.equal(reloaded.systemSettingZoneToleranceMeters, meters)
    }
  })

  test('CA-3: fuera de contrato responde 400 tipado y no escribe ningún campo', async ({
    client,
    assert,
  }) => {
    await setMargin(settingA, 120)
    const before = await reloadSetting(settingA.systemSettingId)

    for (const invalid of ['201', '-1', '2.5', 'abc', '1000']) {
      const response = await sendFields(
        client
          .put(`/api/system-settings/${settingA.systemSettingId}`)
          .loginAs(actor!.user)
          .headers(buHeader(businessUnitA)),
        {
          ...baseFields(settingA),
          systemSettingTradeName: `No se guarda ${invalid} ${stamp}`,
          systemSettingZoneToleranceMeters: invalid,
        }
      )

      response.assertStatus(400)
      assert.equal(response.body().code, INVALID_CODE, `código para ${invalid}`)
      assert.equal(response.body().key, INVALID_KEY)
      assert.isString(response.body().title)
      assert.isString(response.body().detail)

      const after = await reloadSetting(settingA.systemSettingId)
      assert.equal(after.systemSettingZoneToleranceMeters, 120)
      assert.equal(after.systemSettingTradeName, before.systemSettingTradeName)
    }
  })

  test('CA-6: sin el campo, vacío o "null" conserva el margen vigente', async ({ client, assert }) => {
    await setMargin(settingA, 120)

    const variants: Record<string, string>[] = [
      baseFields(settingA),
      { ...baseFields(settingA), systemSettingZoneToleranceMeters: '' },
      { ...baseFields(settingA), systemSettingZoneToleranceMeters: 'null' },
    ]
    for (const fields of variants) {
      const response = await sendFields(
        client
          .put(`/api/system-settings/${settingA.systemSettingId}`)
          .loginAs(actor!.user)
          .headers(buHeader(businessUnitA)),
        fields
      )
      response.assertStatus(200)
      const reloaded = await reloadSetting(settingA.systemSettingId)
      assert.equal(reloaded.systemSettingZoneToleranceMeters, 120)
    }
  })

  test('CA-2: cambiar el margen de una empresa no toca el de otra', async ({ client, assert }) => {
    const response = await sendFields(
      client
        .put(`/api/system-settings/${settingA.systemSettingId}`)
        .loginAs(actor!.user)
        .headers(buHeader(businessUnitA)),
      { ...baseFields(settingA), systemSettingZoneToleranceMeters: '80' }
    )

    response.assertStatus(200)
    const reloadedA = await reloadSetting(settingA.systemSettingId)
    const reloadedB = await reloadSetting(settingB.systemSettingId)
    assert.equal(reloadedA.systemSettingZoneToleranceMeters, 80)
    assert.equal(reloadedB.systemSettingZoneToleranceMeters, 50)
  })

  test('CA-9: el alta manual sin el campo queda en 50 y con valor válido lo respeta', async ({
    client,
    assert,
  }) => {
    const withoutField = await sendFields(
      client.post('/api/system-settings').loginAs(actor!.user).headers(buHeader(businessUnitC)),
      {
        systemSettingTradeName: `Alta C ${stamp}`,
        systemSettingSidebarColor: '#333333',
        systemSettingActive: '1',
      }
    )
    assert.oneOf(withoutField.status(), [200, 201])
    const created = await SystemSetting.query()
      .where('business_unit_id', businessUnitC.businessUnitId)
      .firstOrFail()
    assert.equal(created.systemSettingZoneToleranceMeters, 50)

    await SystemSetting.query().where('business_unit_id', businessUnitC.businessUnitId).delete()

    const withValue = await sendFields(
      client.post('/api/system-settings').loginAs(actor!.user).headers(buHeader(businessUnitC)),
      {
        systemSettingTradeName: `Alta C valor ${stamp}`,
        systemSettingSidebarColor: '#333333',
        systemSettingActive: '1',
        systemSettingZoneToleranceMeters: '150',
      }
    )
    assert.oneOf(withValue.status(), [200, 201])
    const createdWithValue = await SystemSetting.query()
      .where('business_unit_id', businessUnitC.businessUnitId)
      .firstOrFail()
    assert.equal(createdWithValue.systemSettingZoneToleranceMeters, 150)
  })

  test('CA-3: el alta manual fuera de contrato responde 400 y no crea la fila', async ({
    client,
    assert,
  }) => {
    const response = await sendFields(
      client.post('/api/system-settings').loginAs(actor!.user).headers(buHeader(businessUnitC)),
      {
        systemSettingTradeName: `Alta invalida ${stamp}`,
        systemSettingSidebarColor: '#333333',
        systemSettingActive: '1',
        systemSettingZoneToleranceMeters: '300',
      }
    )

    response.assertStatus(400)
    assert.equal(response.body().code, INVALID_CODE)
    assert.isNull(
      await SystemSetting.query().where('business_unit_id', businessUnitC.businessUnitId).first()
    )
  })
})
