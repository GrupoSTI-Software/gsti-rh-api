import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import type { ApiClient } from '@japa/api-client'
import VacationSetting from '#models/vacation_setting'
import {
  assertModuleEnforced,
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
 * Periodos vacacionales con la exigencia encendida. `vacation_settings` es una
 * tabla global (sin empresa): las escrituras usan bypass `platformReserved`, así
 * que root escribe sin concesiones, owner ya no, y un rol con la concesión
 * explícita sí. Las lecturas quedan abiertas porque las usa el expediente del
 * empleado.
 *
 * Los registros del spec usan antigüedades y fechas de 2099 para no chocar con
 * la tabla sembrada ni con el validador de unicidad, y se borran al terminar
 * cada caso.
 */

const MODULE = 'vacations'
const SPEC_APPLY_SINCE = '2099-12-31'
const SPEC_YEARS_OF_SERVICE = 50

interface ApiCall {
  label: string
  method: 'get' | 'post' | 'put' | 'delete'
  url: string
  body?: Record<string, unknown>
}

const writeBody = (vacationDays: number) => ({
  vacationSettingYearsOfService: SPEC_YEARS_OF_SERVICE,
  vacationSettingVacationDays: vacationDays,
  vacationSettingApplySince: SPEC_APPLY_SINCE,
})

const storeCall = (): ApiCall => ({
  label: 'alta de periodo',
  method: 'post',
  url: '/api/vacations',
  body: writeBody(30),
})

const updateCall = (vacationSettingId: number): ApiCall => ({
  label: 'edición de periodo',
  method: 'put',
  url: `/api/vacations/${vacationSettingId}`,
  body: writeBody(29),
})

const destroyCall = (vacationSettingId: number): ApiCall => ({
  label: 'baja de periodo',
  method: 'delete',
  url: `/api/vacations/${vacationSettingId}`,
})

/** Fila propia del caso, con otra antigüedad para no chocar con el alta. */
const createFixture = () =>
  VacationSetting.create({
    vacationSettingYearsOfService: SPEC_YEARS_OF_SERVICE - 1,
    vacationSettingVacationDays: 20,
    vacationSettingApplySince: '2099-06-30',
  })

/** Borra lo que el spec dejó en la tabla global, incluidas las bajas lógicas. */
const cleanupSpecRows = () =>
  VacationSetting.query()
    .whereIn('vacation_setting_years_of_service', [SPEC_YEARS_OF_SERVICE, SPEC_YEARS_OF_SERVICE - 1])
    .where('vacation_setting_apply_since', '>=', '2099-01-01')
    .delete()

const countSpecRows = async () => {
  const rows = await VacationSetting.query()
    .whereNull('vacation_setting_deleted_at')
    .where('vacation_setting_years_of_service', SPEC_YEARS_OF_SERVICE)
    .where('vacation_setting_apply_since', '>=', '2099-01-01')
  return rows.length
}

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
  calls: readonly ApiCall[]
) {
  for (const call of calls) {
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

test.group('Periodos vacacionales — permissionGate con exigencia encendida', (group) => {
  let actor: TenantActor | null = null
  let owner: TenantActor | null = null
  let root: TenantActor | null = null

  group.setup(async () => {
    await assertModuleEnforced(MODULE)
    await cleanupSpecRows()
    owner = await createBypassActor('owner', 'vacaciones-owner')
    root = await createBypassActor('root', 'vacaciones-root')
  })

  group.teardown(async () => {
    await cleanupTenantActor(owner)
    await cleanupTenantActor(root)
  })

  group.each.setup(async () => {
    actor = await createTenantActor('vacaciones-gate')
  })

  group.each.teardown(async () => {
    await cleanupSpecRows()
    await cleanupTenantActor(actor)
    actor = null
  })

  test('sin concesiones: alta, edición y baja responden PERM.DENIED y la tabla no cambia', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, [])
    const fixture = await createFixture()

    await assertDeniedAll(assert, client, tenant, [
      storeCall(),
      updateCall(fixture.vacationSettingId),
      destroyCall(fixture.vacationSettingId),
    ])

    const reloaded = await VacationSetting.findOrFail(fixture.vacationSettingId)
    assert.equal(reloaded.vacationSettingVacationDays, 20)
    assert.isNull(reloaded.vacationSettingDeletedAt)
    assert.equal(await countSpecRows(), 0)
  })

  test('sin concesiones: listado y detalle siguen abiertos (expediente del empleado)', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, [])
    const fixture = await createFixture()

    await assertStatus(assert, client, tenant, { label: 'listado', method: 'get', url: '/api/vacations' }, 200)
    await assertStatus(
      assert,
      client,
      tenant,
      { label: 'detalle', method: 'get', url: `/api/vacations/${fixture.vacationSettingId}` },
      200
    )
  })

  test('owner ya no escribe: la tabla es global y el bypass es platformReserved', async ({
    client,
    assert,
  }) => {
    const account = required(owner, 'el owner')
    const fixture = await createFixture()

    await assertDeniedAll(assert, client, account, [
      storeCall(),
      updateCall(fixture.vacationSettingId),
      destroyCall(fixture.vacationSettingId),
    ])
    assert.equal(await countSpecRows(), 0)
  })

  test('root escribe sin concesiones', async ({ client, assert }) => {
    const account = required(root, 'root')

    const created = await assertStatus(assert, client, account, storeCall(), 201)
    // `formatResponse` envuelve el registro: `data.data`.
    const id = Number(created.body().data.data.vacationSettingId)
    await assertStatus(assert, client, account, updateCall(id), 200)
    const updated = await VacationSetting.findOrFail(id)
    assert.equal(updated.vacationSettingVacationDays, 29)
    await assertStatus(assert, client, account, destroyCall(id), 200)
    const destroyed = await VacationSetting.findOrFail(id)
    assert.isNotNull(destroyed.vacationSettingDeletedAt)
  })

  test('una concesión explícita abre solo su escritura, aunque la tabla sea global', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')

    await grantModulePermissions(tenant, MODULE, ['create'])
    const created = await assertStatus(assert, client, tenant, storeCall(), 201)
    const id = Number(created.body().data.data.vacationSettingId)
    await assertDeniedAll(assert, client, tenant, [updateCall(id), destroyCall(id)])

    await grantModulePermissions(tenant, MODULE, ['update'])
    await assertStatus(assert, client, tenant, updateCall(id), 200)
    await assertDeniedAll(assert, client, tenant, [destroyCall(id)])

    await grantModulePermissions(tenant, MODULE, ['delete'])
    await assertStatus(assert, client, tenant, destroyCall(id), 200)
  })
})
