import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import SystemSetting from '#models/system_setting'
import {
  assertModuleEnforced,
  assertPassesGate,
  assertPermissionDenied,
  businessUnitHeaders,
  cleanupTenantActor,
  createBypassActor,
  createTenantActor,
  grantModulePermissions,
  required,
  uniqueTestName,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * Matriz de vencimientos con la exigencia encendida: los dos vencimientos que
 * solo lee la matriz (expediente de la empresa y folio REPSE) exigen
 * `documents-expiration-matrix:read`. Antes no tenían gate y cualquier sesión
 * los leía.
 *
 * `system_settings` admite una sola ficha por empresa en toda su vida
 * (`UNIQUE(business_unit_id)`): cada caso usa un actor y una empresa propios.
 */

const MODULE = 'documents-expiration-matrix'

interface ApiCall {
  label: string
  url: string
}

const settingsExpiringCall = (systemSettingId: number): ApiCall => ({
  label: 'vencimientos del expediente de la empresa',
  url: `/api/system-settings-proceeding-files/get-expired-and-expiring/${systemSettingId}?dateStart=2000-01-01&dateEnd=2099-12-31`,
})

const repseExpiringCall = (): ApiCall => ({
  label: 'vencimientos del folio REPSE',
  url: '/api/repse-registrations/get-expired-and-expiring',
})

/** Ficha de la empresa del actor, sin expediente: basta para que el controller responda 200. */
const createSetting = (actor: TenantActor) =>
  SystemSetting.create({
    businessUnitId: actor.businessUnit.businessUnitId,
    systemSettingTradeName: uniqueTestName('Matriz gate'),
    systemSettingSidebarColor: '#111111',
    systemSettingActive: 1,
    systemSettingMonthlyConversionFactor: 30.4,
  })

async function cleanupSettings(actor: TenantActor | null): Promise<void> {
  if (!actor) return
  await db.from('system_settings').where('business_unit_id', actor.businessUnit.businessUnitId).delete()
}

function send(client: ApiClient, actor: TenantActor, call: ApiCall) {
  return client.get(call.url).loginAs(actor.user).headers(businessUnitHeaders(actor))
}

async function assertDeniedAll(
  assert: Assert,
  client: ApiClient,
  actor: TenantActor,
  calls: readonly ApiCall[]
) {
  for (const call of calls) {
    assertPermissionDenied(assert, await send(client, actor, call))
  }
}

test.group('Matriz de vencimientos — permissionGate con exigencia encendida', (group) => {
  let actor: TenantActor | null = null
  let owner: TenantActor | null = null

  group.setup(async () => {
    await assertModuleEnforced(MODULE)
    owner = await createBypassActor('owner', 'matriz-owner')
  })

  group.teardown(async () => {
    await cleanupTenantActor(owner)
  })

  group.each.setup(async () => {
    actor = await createTenantActor('matriz-gate')
  })

  group.each.teardown(async () => {
    await cleanupSettings(actor)
    await cleanupTenantActor(actor)
    actor = null
  })

  test('sin concesiones: los dos vencimientos responden PERM.DENIED', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, [])
    const setting = await createSetting(tenant)

    await assertDeniedAll(assert, client, tenant, [
      settingsExpiringCall(setting.systemSettingId),
      repseExpiringCall(),
    ])
  })

  test('read abre los dos vencimientos', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, ['read'])
    const setting = await createSetting(tenant)

    const settings = await send(client, tenant, settingsExpiringCall(setting.systemSettingId))
    settings.assertStatus(200)
    assert.equal(settings.body().data.systemSettingId, setting.systemSettingId)

    const repse = await send(client, tenant, repseExpiringCall())
    repse.assertStatus(200)
    assert.isArray(repse.body().data.repseFolioExpirations)
  })

  test('Ajustes Generales ya no abre los vencimientos: los gobierna la matriz', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, 'system-settings', ['read'])
    const setting = await createSetting(tenant)

    await assertDeniedAll(assert, client, tenant, [
      settingsExpiringCall(setting.systemSettingId),
      repseExpiringCall(),
    ])
  })

  test('owner pasa el gate sin concesiones (bypass standard)', async ({ client, assert }) => {
    const account = required(owner, 'el owner')

    const repse = await send(client, account, repseExpiringCall())
    assertPassesGate(assert, repse)
    repse.assertStatus(200)
  })
})
