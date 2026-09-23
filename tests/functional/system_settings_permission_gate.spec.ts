import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import SystemSetting from '#models/system_setting'
import SystemSettingNotificationEmail from '#models/system_setting_notification_email'
import Tolerance from '#models/tolerance'
import { PERMISSION_GATE_ERROR_CODES } from '#constants/permission_gate_error_codes'
import {
  assertModuleEnforced,
  assertPassesGate,
  businessUnitHeaders,
  cleanupTenantActor,
  createBypassActor,
  createTenantActor,
  grantModulePermissions,
  required,
  setModuleEnforcement,
  uniqueTestName,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * Ajustes Generales con la exigencia encendida: la ficha pide su permiso por
 * verbo, sus subrecursos piden `update` para escribir y `read` para leer, y las
 * lecturas que consumen otras pantallas quedan abiertas. Cubre también las dos
 * vías que eran públicas: correos de notificación y detalle de la
 * configuración de nómina.
 *
 * `system_settings` tiene `UNIQUE(business_unit_id)` sin excluir borradas
 * (migración 1783968970000): una sola ficha por empresa en toda su vida. Por
 * eso cada caso trabaja con un actor y una empresa propios.
 */

const MODULE = 'system-settings'
/** Id que no existe: el gate decide antes de que el controller busque el registro. */
const MISSING_ID = 2_147_483_647

interface ApiCall {
  label: string
  method: 'get' | 'post' | 'put' | 'delete'
  url: string
  body?: Record<string, unknown>
}

interface SettingFixtures {
  setting: SystemSetting
  tolerance: Tolerance
  notificationEmail: SystemSettingNotificationEmail
}

const testEmail = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100_000)}@gsti-tests.local`

/**
 * Ficha de la empresa del actor con una tolerancia y un correo de notificación.
 * Reutiliza la ficha si ya existe (p. ej. la creó el alta del caso): la BD no
 * admite una segunda.
 */
async function createSettingFixtures(actor: TenantActor, prefix: string): Promise<SettingFixtures> {
  const setting =
    (await SystemSetting.query()
      .where('business_unit_id', actor.businessUnit.businessUnitId)
      .first()) ??
    (await SystemSetting.create({
      businessUnitId: actor.businessUnit.businessUnitId,
      systemSettingTradeName: uniqueTestName(prefix),
      systemSettingSidebarColor: '#111111',
      systemSettingActive: 1,
      systemSettingMonthlyConversionFactor: 30.4,
    }))
  const tolerance = await Tolerance.create({
    toleranceName: 'Retardo',
    toleranceMinutes: 10,
    systemSettingId: setting.systemSettingId,
  })
  const notificationEmail = await SystemSettingNotificationEmail.create({
    systemSettingId: setting.systemSettingId,
    email: testEmail(prefix),
  })

  return { setting, tolerance, notificationEmail }
}

/** Borra la ficha de la empresa del actor con todo lo que cuelga de ella. */
async function cleanupSettings(actor: TenantActor | null): Promise<void> {
  if (!actor) return

  const rows: Array<{ system_setting_id: number }> = await db
    .from('system_settings')
    .where('business_unit_id', actor.businessUnit.businessUnitId)
    .select('system_setting_id')
  const settingIds = rows.map((row) => row.system_setting_id)
  if (settingIds.length === 0) return

  for (const table of [
    'tolerances',
    'system_setting_notification_emails',
    'system_settings_employees',
    'system_setting_payroll_configs',
    'system_setting_trade_names',
    'system_setting_proceeding_files',
  ]) {
    await db.from(table).whereIn('system_setting_id', settingIds).delete()
  }
  await db.from('system_settings').whereIn('system_setting_id', settingIds).delete()
}

function send(client: ApiClient, actor: TenantActor, call: ApiCall) {
  const request = client[call.method](call.url)
    .loginAs(actor.user)
    .headers(businessUnitHeaders(actor))
  return call.body ? request.json(call.body) : request
}

/** Negativa del gate en cada llamada, con la operación en el mensaje de fallo. */
async function assertDeniedAll(
  assert: Assert,
  client: ApiClient,
  actor: TenantActor,
  calls: readonly ApiCall[]
): Promise<void> {
  for (const call of calls) {
    const response = await send(client, actor, call)
    assert.equal(response.status(), 403, `${call.label}: debe responder 403`)
    assert.equal(
      response.body()?.key,
      PERMISSION_GATE_ERROR_CODES.DENIED,
      `${call.label}: el 403 debe venir del gate`
    )
  }
}

const readCalls = (fx: SettingFixtures): ApiCall[] => [
  { label: 'listado de fichas', method: 'get', url: '/api/system-settings' },
  { label: 'detalle de la ficha', method: 'get', url: `/api/system-settings/${fx.setting.systemSettingId}` },
  { label: 'detalle del expediente', method: 'get', url: `/api/system-settings-proceeding-files/${MISSING_ID}` },
  { label: 'detalle de configuración de nómina', method: 'get', url: `/api/system-setting-payroll-configs/${MISSING_ID}` },
  { label: 'correos de notificación', method: 'get', url: '/api/system-settings-notification-emails' },
  { label: 'correos de la ficha', method: 'get', url: `/api/system-settings-notification-emails/${fx.setting.systemSettingId}` },
  { label: 'historial del límite de empleados', method: 'get', url: `/api/system-settings-employees/${fx.setting.systemSettingId}` },
  { label: 'límite activo de empleados', method: 'get', url: `/api/system-settings-employees/${fx.setting.systemSettingId}/active` },
  { label: 'razones sociales', method: 'get', url: `/api/system-setting-trade-names?systemSettingId=${fx.setting.systemSettingId}` },
  { label: 'detalle de razón social', method: 'get', url: `/api/system-setting-trade-names/${MISSING_ID}` },
]

const createCall = (tradeName: string): ApiCall => ({
  label: 'alta de ficha',
  method: 'post',
  url: '/api/system-settings',
  body: {
    systemSettingTradeName: tradeName,
    systemSettingSidebarColor: '#222222',
    systemSettingActive: '0',
    systemSettingRestrictFutureVacation: '0',
    systemSettingPeriodAbsencesBeforeAttendanceLock: 'monthly',
    systemSettingPeriodLateArrivalsBeforeAttendanceLock: 'monthly',
  },
})

const updateCalls = (fx: SettingFixtures, email: string): ApiCall[] => {
  const id = fx.setting.systemSettingId
  return [
    { label: 'edición de la ficha', method: 'put', url: `/api/system-settings/${id}`, body: { systemSettingTradeName: 'Edición negada' } },
    { label: 'correos de cumpleaños', method: 'put', url: `/api/system-settings/${id}/birthday-emails`, body: { systemSettingBirthdayEmails: true } },
    { label: 'correos de aniversario', method: 'put', url: `/api/system-settings/${id}/anniversary-emails`, body: { systemSettingAnniversaryEmails: true } },
    { label: 'correos de faltas a RH', method: 'put', url: `/api/system-settings/${id}/attendance-fault-hr-emails`, body: { systemSettingAttendanceFaultHrEmails: true } },
    { label: 'ícono de la app', method: 'post', url: `/api/system-settings/${id}/employee-application-icon` },
    { label: 'alta en expediente', method: 'post', url: '/api/system-settings-proceeding-files', body: { systemSettingId: id } },
    { label: 'edición en expediente', method: 'put', url: `/api/system-settings-proceeding-files/${MISSING_ID}` },
    { label: 'baja en expediente', method: 'delete', url: `/api/system-settings-proceeding-files/${MISSING_ID}` },
    { label: 'alta de tolerancia', method: 'post', url: '/api/tolerances', body: { toleranceName: 'Negada', toleranceMinutes: 7, systemSettingId: id } },
    { label: 'edición de tolerancia', method: 'put', url: `/api/tolerances/${fx.tolerance.toleranceId}`, body: { toleranceMinutes: 99 } },
    { label: 'baja de tolerancia', method: 'delete', url: `/api/tolerances/${fx.tolerance.toleranceId}` },
    { label: 'alta de configuración de nómina', method: 'post', url: '/api/system-setting-payroll-configs', body: { systemSettingId: id } },
    { label: 'edición de configuración de nómina', method: 'put', url: `/api/system-setting-payroll-configs/${MISSING_ID}` },
    { label: 'baja de configuración de nómina', method: 'delete', url: `/api/system-setting-payroll-configs/${MISSING_ID}` },
    { label: 'alta de correo de notificación', method: 'post', url: '/api/system-settings-notification-emails', body: { systemSettingId: id, email } },
    { label: 'baja de correo de notificación', method: 'delete', url: `/api/system-settings-notification-emails/${fx.notificationEmail.systemSettingNotificationEmailId}` },
    { label: 'alta de límite de empleados', method: 'post', url: '/api/system-settings-employees', body: { systemSettingId: id, employeeLimit: 999 } },
    { label: 'baja de límite de empleados', method: 'delete', url: `/api/system-settings-employees/${id}` },
    { label: 'alta de razón social', method: 'post', url: '/api/system-setting-trade-names', body: { systemSettingId: id } },
    { label: 'edición de razón social', method: 'put', url: `/api/system-setting-trade-names/${MISSING_ID}` },
    { label: 'ícono de razón social', method: 'post', url: `/api/system-setting-trade-names/${MISSING_ID}/employee-application-icon` },
    { label: 'baja de razón social', method: 'delete', url: `/api/system-setting-trade-names/${MISSING_ID}` },
  ]
}

const deleteCall = (fx: SettingFixtures): ApiCall => ({
  label: 'baja de la ficha',
  method: 'delete',
  url: `/api/system-settings/${fx.setting.systemSettingId}`,
})

const findAliveSetting = (systemSettingId: number) =>
  SystemSetting.query()
    .where('system_setting_id', systemSettingId)
    .whereNull('system_setting_deleted_at')
    .first()

const findAliveNotificationEmail = (where: { id?: number; email?: string }) => {
  const query = SystemSettingNotificationEmail.query().whereNull(
    'system_setting_notification_email_deleted_at'
  )
  if (where.id) query.where('system_setting_notification_email_id', where.id)
  if (where.email) query.where('email', where.email)
  return query.first()
}

test.group('Ajustes Generales — vías que eran públicas', (group) => {
  let actor: TenantActor | null = null

  group.setup(async () => {
    await assertModuleEnforced(MODULE)
    actor = await createTenantActor('ajustes-publicas')
  })

  group.teardown(async () => {
    await cleanupSettings(actor)
    await cleanupTenantActor(actor)
  })

  test('sin sesión: correos de notificación y detalle de nómina responden 401 y no escriben', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const fx = await createSettingFixtures(tenant, 'ajustes-anonimo')
    const anonymousEmail = testEmail('anonimo')
    const calls: ApiCall[] = [
      { label: 'correos de notificación', method: 'get', url: '/api/system-settings-notification-emails' },
      { label: 'correos de la ficha', method: 'get', url: `/api/system-settings-notification-emails/${fx.setting.systemSettingId}` },
      { label: 'alta de correo', method: 'post', url: '/api/system-settings-notification-emails', body: { systemSettingId: fx.setting.systemSettingId, email: anonymousEmail } },
      { label: 'baja de correo', method: 'delete', url: `/api/system-settings-notification-emails/${fx.notificationEmail.systemSettingNotificationEmailId}` },
      { label: 'detalle de configuración de nómina', method: 'get', url: `/api/system-setting-payroll-configs/${MISSING_ID}` },
    ]

    for (const call of calls) {
      const request = client[call.method](call.url)
      const response = await (call.body ? request.json(call.body) : request)
      assert.equal(response.status(), 401, `${call.label}: debe exigir sesión`)
    }

    assert.isNotNull(await findAliveNotificationEmail({ id: fx.notificationEmail.systemSettingNotificationEmailId }))
    assert.isNull(await findAliveNotificationEmail({ email: anonymousEmail }))
  })
})

test.group('Ajustes Generales — permissionGate con exigencia encendida', (group) => {
  let actor: TenantActor | null = null
  let owner: TenantActor | null = null

  group.setup(async () => {
    await assertModuleEnforced(MODULE)
    owner = await createBypassActor('owner', 'ajustes-owner')
  })

  group.teardown(async () => {
    await cleanupSettings(owner)
    await cleanupTenantActor(owner)
  })

  // Una empresa por caso: la BD admite una sola ficha por empresa.
  group.each.setup(async () => {
    actor = await createTenantActor('ajustes-gate')
  })

  group.each.teardown(async () => {
    await cleanupSettings(actor)
    await cleanupTenantActor(actor)
    actor = null
  })

  test('sin concesiones: toda operación declarada responde PERM.DENIED y no escribe', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, [])
    const fx = await createSettingFixtures(tenant, 'ajustes-sin-permiso')
    const deniedEmail = testEmail('negado')
    const deniedTradeName = uniqueTestName('Alta negada')

    await assertDeniedAll(assert, client, tenant, [
      ...readCalls(fx),
      createCall(deniedTradeName),
      ...updateCalls(fx, deniedEmail),
      deleteCall(fx),
    ])

    assert.isNotNull(await findAliveSetting(fx.setting.systemSettingId))
    assert.isNull(await SystemSetting.query().where('system_setting_trade_name', deniedTradeName).first())
    const tolerance = await Tolerance.query().where('tolerance_id', fx.tolerance.toleranceId).firstOrFail()
    assert.equal(tolerance.toleranceMinutes, 10)
    assert.isNull(
      await Tolerance.query()
        .where('system_setting_id', fx.setting.systemSettingId)
        .where('tolerance_name', 'Negada')
        .first()
    )
    assert.isNotNull(await findAliveNotificationEmail({ id: fx.notificationEmail.systemSettingNotificationEmailId }))
    assert.isNull(await findAliveNotificationEmail({ email: deniedEmail }))
  })

  test('sin concesiones: las lecturas que consumen otras pantallas siguen abiertas', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, [])
    const fx = await createSettingFixtures(tenant, 'ajustes-abiertas')
    const id = fx.setting.systemSettingId
    const openCalls: ApiCall[] = [
      { label: 'configuración activa (BO y PWA)', method: 'get', url: '/api/system-settings-active' },
      { label: 'configuración de nómina activa (Bonos y Monitor)', method: 'get', url: '/api/system-settings-get-payroll-config' },
      { label: 'expediente (Matriz de vencimientos)', method: 'get', url: `/api/system-settings-proceeding-files?systemSettingId=${id}` },
      // Los vencimientos ya no son lectura abierta: exigen documents-expiration-matrix:read
      // (documents_expiration_matrix_permission_gate.spec.ts).
      { label: 'tolerancias de la ficha', method: 'get', url: `/api/tolerances/${id}` },
      { label: 'tolerancia de retardo (Monitor de asistencia)', method: 'get', url: '/api/tolerances/get-tardiness-tolerance' },
    ]

    for (const call of openCalls) {
      const response = await send(client, tenant, call)
      assert.notEqual(response.body()?.key, PERMISSION_GATE_ERROR_CODES.DENIED, call.label)
      assertPassesGate(assert, response)
    }
  })

  test('read abre las lecturas del módulo y nada más', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, ['read'])
    const fx = await createSettingFixtures(tenant, 'ajustes-lectura')
    const id = fx.setting.systemSettingId

    const index = await send(client, tenant, readCalls(fx)[0])
    index.assertStatus(200)
    // El servicio envuelve la lista: `data.systemSettings.data`.
    const listedIds = (
      index.body().data.systemSettings.data as Array<{ systemSettingId: number }>
    ).map((row) => row.systemSettingId)
    assert.include(listedIds, id)

    const show = await send(client, tenant, readCalls(fx)[1])
    show.assertStatus(200)
    assert.equal(show.body().data.systemSetting.systemSettingId, id)

    const emails = await send(client, tenant, readCalls(fx)[5])
    emails.assertStatus(200)
    assert.include(JSON.stringify(emails.body()), fx.notificationEmail.email)

    for (const call of [readCalls(fx)[6], readCalls(fx)[8]]) {
      const response = await send(client, tenant, call)
      assert.equal(response.status(), 200, call.label)
    }
    // Sin límite ni configuración de nómina sembrados responden 404: ya cruzaron el gate.
    assertPassesGate(assert, await send(client, tenant, readCalls(fx)[7]))
    assertPassesGate(assert, await send(client, tenant, readCalls(fx)[3]))

    await assertDeniedAll(assert, client, tenant, [
      createCall(uniqueTestName('Alta solo lectura')),
      updateCalls(fx, testEmail('solo-lectura'))[8],
      deleteCall(fx),
    ])
  })

  test('update abre las escrituras de la ficha y de sus subrecursos, no su lectura ni su baja', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, ['update'])
    const fx = await createSettingFixtures(tenant, 'ajustes-edicion')
    const id = fx.setting.systemSettingId
    const newEmail = testEmail('con-permiso')

    const storeTolerance = await send(client, tenant, {
      label: 'alta de tolerancia',
      method: 'post',
      url: '/api/tolerances',
      body: { toleranceName: 'Falta', toleranceMinutes: 5, systemSettingId: id },
    })
    storeTolerance.assertStatus(201)
    assert.isNotNull(
      await Tolerance.query().where('system_setting_id', id).where('tolerance_name', 'Falta').first()
    )

    const destroyTolerance = await send(client, tenant, updateCalls(fx, newEmail)[10])
    destroyTolerance.assertStatus(200)
    const zeroed = await Tolerance.query().where('tolerance_id', fx.tolerance.toleranceId).firstOrFail()
    assert.equal(zeroed.toleranceMinutes, 0)

    const birthday = await send(client, tenant, updateCalls(fx, newEmail)[1])
    birthday.assertStatus(200)

    const storeEmail = await send(client, tenant, updateCalls(fx, newEmail)[14])
    storeEmail.assertStatus(201)
    assert.isNotNull(await findAliveNotificationEmail({ email: newEmail }))

    // El controller responde 201 al borrar un correo: contrato vigente, fuera de este cambio.
    const destroyEmail = await send(client, tenant, updateCalls(fx, newEmail)[15])
    destroyEmail.assertStatus(201)
    assert.isNull(await findAliveNotificationEmail({ id: fx.notificationEmail.systemSettingNotificationEmailId }))

    await assertDeniedAll(assert, client, tenant, [
      readCalls(fx)[1],
      createCall(uniqueTestName('Alta solo edición')),
      deleteCall(fx),
    ])
    assert.isNotNull(await findAliveSetting(id))
  })

  // El aviso a RH por faltas comparte `update` con los demás interruptores: no
  // tiene acción propia en el catálogo (USRH1789018905994 proponía
  // `manage-attendance-fault-hr-emails`, que nadie siembra ni concede).
  test('update abre los interruptores de la ficha, incluido el aviso a RH por faltas', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, ['update'])
    const fx = await createSettingFixtures(tenant, 'ajustes-interruptores')
    const calls = updateCalls(fx, testEmail('interruptores'))

    for (const call of [calls[2], calls[3]]) {
      const response = await send(client, tenant, call)
      assert.equal(response.status(), 200, call.label)
    }
    const setting = await SystemSetting.findOrFail(fx.setting.systemSettingId)
    assert.isTrue(Boolean(setting.systemSettingAttendanceFaultHrEmails))

    // Sin archivo el controller rechaza la subida: basta con que cruce el gate.
    assertPassesGate(assert, await send(client, tenant, calls[4]))
  })

  test('create abre solo el alta de la ficha', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, ['create'])

    // Alta primero: la empresa del caso todavía no tiene ficha.
    const store = await send(client, tenant, createCall(uniqueTestName('Alta con permiso')))
    assertPassesGate(assert, store)

    const fx = await createSettingFixtures(tenant, 'ajustes-alta')
    await assertDeniedAll(assert, client, tenant, [
      readCalls(fx)[0],
      updateCalls(fx, testEmail('solo-alta'))[1],
      deleteCall(fx),
    ])
  })

  test('delete abre solo la baja de la ficha', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, ['delete'])
    const fx = await createSettingFixtures(tenant, 'ajustes-baja')

    await assertDeniedAll(assert, client, tenant, [
      readCalls(fx)[1],
      updateCalls(fx, testEmail('solo-baja'))[1],
    ])

    const destroy = await send(client, tenant, deleteCall(fx))
    destroy.assertStatus(200)
    assert.isNull(await findAliveSetting(fx.setting.systemSettingId))
  })

  test('owner cruza el gate por el bypass standard sin concesiones', async ({ client, assert }) => {
    const account = required(owner, 'el owner')
    const fx = await createSettingFixtures(account, 'ajustes-owner')
    const ownerEmail = testEmail('owner')

    const show = await send(client, account, readCalls(fx)[1])
    show.assertStatus(200)

    const storeEmail = await send(client, account, updateCalls(fx, ownerEmail)[14])
    storeEmail.assertStatus(201)
    assert.isNotNull(await findAliveNotificationEmail({ email: ownerEmail }))
  })
})

// Soft-rollout (aporte de USRH1789018905994): con la exigencia apagada el gate
// deja pasar la ficha completa aun sin concesiones. Solo se afirma lo que
// decide el gate, no la respuesta del controller.
test.group('Ajustes Generales — permissionGate con exigencia apagada', (group) => {
  let actor: TenantActor | null = null
  let previousEnforcement = true

  group.setup(async () => {
    previousEnforcement = await setModuleEnforcement(MODULE, false)
    actor = await createTenantActor('ajustes-apagada')
  })

  group.teardown(async () => {
    try {
      await cleanupSettings(actor)
      await cleanupTenantActor(actor)
    } finally {
      await setModuleEnforcement(MODULE, previousEnforcement)
    }
  })

  test('sin concesiones: ninguna operación declarada responde con la negativa del gate', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, [])

    const assertNotGated = async (calls: readonly ApiCall[]) => {
      for (const call of calls) {
        const response = await send(client, tenant, call)
        assert.notEqual(response.body()?.key, PERMISSION_GATE_ERROR_CODES.DENIED, call.label)
        assert.notEqual(response.body()?.key, PERMISSION_GATE_ERROR_CODES.UNRESOLVED, call.label)
      }
    }

    // Alta primero: la empresa del caso todavía no tiene ficha.
    await assertNotGated([createCall(uniqueTestName('Alta sin exigencia'))])

    // Solo la ficha y sus interruptores: con la exigencia apagada la petición
    // llega al controller, y las de los subrecursos no traen un cuerpo que su
    // validador acepte.
    const fx = await createSettingFixtures(tenant, 'ajustes-apagada')
    await assertNotGated([
      ...readCalls(fx).slice(0, 2),
      ...updateCalls(fx, testEmail('sin-exigencia')).slice(0, 5),
      deleteCall(fx),
    ])
  })
})
