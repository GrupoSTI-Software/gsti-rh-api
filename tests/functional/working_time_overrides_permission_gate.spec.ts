import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import { PERMISSION_GATE_ERROR_CODES } from '#constants/permission_gate_error_codes'
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
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * Políticas de jornada 40 hrs con la exigencia encendida: los overrides piden
 * su permiso por verbo; la jornada efectiva (turnos del empleado) y el catálogo
 * federal quedan abiertos.
 */

const MODULE = 'working-time-overrides'
const BASE_URL = '/api/v1/working-time-rules/overrides'
/** Id que no existe: con el gate cruzado el controller responde 404. */
const MISSING_ID = 2_147_483_647

interface ApiCall {
  label: string
  method: 'get' | 'post' | 'patch' | 'delete'
  url: string
  body?: Record<string, unknown>
}

/** Mismo override que usa el spec de integración del servicio. */
const validOverride = {
  effectiveYear: 2027,
  validFrom: '2027-01-01',
  validTo: '2027-12-31',
  maxWeeklyHours: 40,
  maxWeeklyOvertimeHours: 9,
  maxDailyOvertimeHours: 4,
  maxOvertimeDaysPerWeek: 4,
  dailyHoursDay: 8,
  dailyHoursNight: 7,
  dailyHoursMixed: 7.5,
  workDaysPerRestDay: 6,
  exceedsFederalAck: false,
  overrideJustification: null,
}

const calls = (overrideId: number): Record<'index' | 'store' | 'update' | 'destroy', ApiCall> => ({
  index: { label: 'listado de overrides', method: 'get', url: BASE_URL },
  store: { label: 'alta de override', method: 'post', url: BASE_URL, body: validOverride },
  update: {
    label: 'edición de override',
    method: 'patch',
    url: `${BASE_URL}/${overrideId}`,
    body: { maxWeeklyHours: 39 },
  },
  destroy: { label: 'baja de override', method: 'delete', url: `${BASE_URL}/${overrideId}` },
})

function send(client: ApiClient, actor: TenantActor, call: ApiCall) {
  const request = client[call.method](call.url)
    .loginAs(actor.user)
    .headers(businessUnitHeaders(actor))
  return call.body ? request.json(call.body) : request
}

async function assertDeniedAll(
  assert: Assert,
  client: ApiClient,
  actor: TenantActor,
  denied: readonly ApiCall[]
) {
  for (const call of denied) {
    assertPermissionDenied(assert, await send(client, actor, call))
  }
}

async function assertStatus(
  assert: Assert,
  client: ApiClient,
  actor: TenantActor,
  call: ApiCall,
  status: number
) {
  const response = await send(client, actor, call)
  assert.equal(response.status(), status, `${call.label}: ${JSON.stringify(response.body())}`)
  return response
}

const overrideIdsOf = async (actor: TenantActor): Promise<number[]> => {
  const rows: Array<{ working_time_rule_id: number }> = await db
    .from('working_time_rules')
    .where('business_unit_id', actor.businessUnit.businessUnitId)
    .select('working_time_rule_id')
  return rows.map((row) => row.working_time_rule_id)
}

const cleanupOverrides = async (actor: TenantActor | null) => {
  if (!actor) return
  await db.from('working_time_rules').where('business_unit_id', actor.businessUnit.businessUnitId).delete()
}

test.group('Políticas de jornada 40 hrs — permissionGate con exigencia encendida', (group) => {
  let actor: TenantActor | null = null
  let owner: TenantActor | null = null

  group.setup(async () => {
    await assertModuleEnforced(MODULE)
    owner = await createBypassActor('owner', 'jornada-owner')
  })

  group.teardown(async () => {
    await cleanupOverrides(owner)
    await cleanupTenantActor(owner)
  })

  group.each.setup(async () => {
    actor = await createTenantActor('jornada-gate')
  })

  group.each.teardown(async () => {
    await cleanupOverrides(actor)
    await cleanupTenantActor(actor)
    actor = null
  })

  test('sin concesiones: listado, alta, edición y baja responden PERM.DENIED y no escriben', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, [])

    await assertDeniedAll(assert, client, tenant, Object.values(calls(MISSING_ID)))
    assert.isEmpty(await overrideIdsOf(tenant))
  })

  test('sin concesiones: jornada efectiva y catálogo federal siguen abiertos', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, [])
    const open: ApiCall[] = [
      { label: 'jornada efectiva (turnos del empleado)', method: 'get', url: '/api/v1/working-time-rules/effective?date=2027-03-01' },
      { label: 'catálogo federal', method: 'get', url: '/api/v1/working-time-rules/federal' },
    ]

    for (const call of open) {
      const response = await send(client, tenant, call)
      assert.notEqual(response.body()?.key, PERMISSION_GATE_ERROR_CODES.DENIED, call.label)
      assertPassesGate(assert, response)
    }
  })

  test('cada permiso abre solo su operación', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')

    await grantModulePermissions(tenant, MODULE, ['create'])
    await assertStatus(assert, client, tenant, calls(MISSING_ID).store, 201)
    const [overrideId] = await overrideIdsOf(tenant)
    assert.isDefined(overrideId)
    const own = calls(overrideId)
    await assertDeniedAll(assert, client, tenant, [own.index, own.update, own.destroy])

    await grantModulePermissions(tenant, MODULE, ['read'])
    await assertStatus(assert, client, tenant, own.index, 200)
    await assertDeniedAll(assert, client, tenant, [own.store, own.update, own.destroy])

    await grantModulePermissions(tenant, MODULE, ['update'])
    await assertStatus(assert, client, tenant, own.update, 200)
    await assertDeniedAll(assert, client, tenant, [own.index, own.destroy])

    await grantModulePermissions(tenant, MODULE, ['delete'])
    await assertStatus(assert, client, tenant, own.destroy, 200)
    await assertDeniedAll(assert, client, tenant, [own.index, own.update])
  })

  test('owner cruza el gate por el bypass standard sin concesiones', async ({ client, assert }) => {
    const account = required(owner, 'el owner')

    await assertStatus(assert, client, account, calls(MISSING_ID).index, 200)
    await assertStatus(assert, client, account, calls(MISSING_ID).update, 404)
  })
})
