import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import Holiday from '#models/holiday'
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
 * Calendario con la exigencia encendida: el detalle de una festividad y la
 * exportación a Excel exigen `calendar:read`. La lista y el catálogo de iconos
 * quedan abiertos porque los leen la PWA del colaborador y los cálculos de
 * asistencia y nómina del backoffice.
 *
 * Cada caso usa un actor con empresa propia y festividades de 2099 ligadas a
 * esa empresa; se borran al terminar el caso.
 */

const MODULE = 'calendar'
const SPEC_YEAR = 2099

interface ApiCall {
  label: string
  url: string
}

const detailCall = (holidayId: number): ApiCall => ({
  label: 'detalle de festividad',
  url: `/api/holidays/${holidayId}`,
})

const exportCall = (): ApiCall => ({
  label: 'exportación a Excel',
  url: `/api/holidays/export-excel?year=${SPEC_YEAR}`,
})

const openCalls = (): ApiCall[] => [
  {
    label: 'lista de festividades (PWA y asistencia)',
    url: `/api/holidays?firstDate=${SPEC_YEAR}-01-01&lastDate=${SPEC_YEAR}-12-31&page=1&limit=10`,
  },
  { label: 'catálogo de iconos', url: '/api/icons' },
]

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

test.group('Calendario — permissionGate con exigencia encendida', (group) => {
  let actor: TenantActor | null = null
  let owner: TenantActor | null = null
  const createdHolidayIds: number[] = []

  /** Festividad de la empresa del actor; su id queda anotado para borrarla. */
  async function createHoliday(forActor: TenantActor): Promise<Holiday> {
    const holiday = await Holiday.create({
      holidayName: uniqueTestName('Festividad gate'),
      holidayDate: `${SPEC_YEAR}-05-01`,
      holidayBusinessUnits: forActor.businessUnit.businessUnitSlug,
      holidayIcon: null,
      holidayIconId: null,
      holidayFrequency: 1,
      holidayIsOfficialRestDay: false,
    })
    createdHolidayIds.push(holiday.holidayId)
    return holiday
  }

  group.setup(async () => {
    await assertModuleEnforced(MODULE)
    owner = await createBypassActor('owner', 'calendario-owner')
  })

  group.teardown(async () => {
    await cleanupTenantActor(owner)
  })

  group.each.setup(async () => {
    actor = await createTenantActor('calendario-gate')
  })

  group.each.teardown(async () => {
    if (createdHolidayIds.length > 0) {
      await db.from('holidays').whereIn('holiday_id', createdHolidayIds).delete()
      createdHolidayIds.length = 0
    }
    await cleanupTenantActor(actor)
    actor = null
  })

  test('sin concesiones: detalle y exportación responden PERM.DENIED', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, [])
    const holiday = await createHoliday(tenant)

    await assertDeniedAll(assert, client, tenant, [detailCall(holiday.holidayId), exportCall()])
  })

  test('sin concesiones: la lista y el catálogo de iconos siguen abiertos', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, [])

    for (const call of openCalls()) {
      const response = await send(client, tenant, call)
      assert.equal(response.status(), 200, `${call.label}: ${JSON.stringify(response.body())}`)
    }
  })

  test('read abre el detalle y la exportación a Excel', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, ['read'])
    const holiday = await createHoliday(tenant)

    const detail = await send(client, tenant, detailCall(holiday.holidayId))
    detail.assertStatus(200)
    assert.equal(detail.body().data.holidayId, holiday.holidayId)

    const excel = await send(client, tenant, exportCall())
    excel.assertStatus(200)
    assert.include(String(excel.header('content-type')), 'spreadsheetml')
  })

  test('crear, editar y eliminar no abren las lecturas protegidas', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, ['create', 'update', 'delete'])
    const holiday = await createHoliday(tenant)

    await assertDeniedAll(assert, client, tenant, [detailCall(holiday.holidayId), exportCall()])
  })

  test('owner pasa el gate sin concesiones (bypass standard)', async ({ client, assert }) => {
    const account = required(owner, 'el owner')
    const holiday = await createHoliday(account)

    const detail = await send(client, account, detailCall(holiday.holidayId))
    assertPassesGate(assert, detail)
    detail.assertStatus(200)
  })
})
