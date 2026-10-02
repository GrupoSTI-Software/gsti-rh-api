import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import AssistAddressService from '#modules/assist-source/assist_address.service'
import type { ReverseGeocoder } from '#modules/assist-source/reverse_geocoder'
import { TenantContext } from '#utils/tenant_context'
import type { TenantActor } from '#tests/helpers/tenant_actor'
import { cleanupTenantActor, createBypassActor } from '#tests/helpers/tenant_actor'
import type { EmployeeFixture } from '#tests/helpers/employee_fixture'
import { cleanupEmployeeFixture, createEmployeeFixture } from '#tests/helpers/employee_fixture'

/**
 * Detalle del registro de asistencia: de dónde viene una checada (checador,
 * app o backoffice) y su dirección aproximada.
 */

let actor: TenantActor | null = null
let otherActor: TenantActor | null = null
let fixture: EmployeeFixture | null = null
const ids = { device: 0, app: 0, backoffice: 0 }

async function insertAssist(minute: number, extra: Record<string, unknown>): Promise<number> {
  const punch = `2026-09-01 14:${String(minute).padStart(2, '0')}:00`
  const [id] = await db.table('assists').insert({
    assist_emp_code: fixture!.employee.employeeCode,
    assist_emp_id: fixture!.employee.employeeId,
    business_unit_id: fixture!.businessUnitId,
    assist_punch_time: punch,
    assist_punch_time_utc: punch,
    assist_punch_time_origin: punch,
    assist_upload_time: punch,
    assist_sync_id: 0,
    assist_type: 'check',
    assist_natural_key: `src-${fixture!.employee.employeeId}-${minute}`,
    ...extra,
  })
  return Number(id)
}

function get(
  client: ApiClient,
  path: string,
  as = actor!
) {
  return client
    .get(path)
    .loginAs(as.user)
    .header('X-Business-Unit-Id', as.businessUnit.businessUnitPublicId)
}

test.group('Origen de la checada', (group) => {
  group.setup(async () => {
    actor = await createBypassActor('owner', 'origenchk')
    otherActor = await createBypassActor('owner', 'origenchk-b')
    fixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'origenchk')
    ids.device = await insertAssist(1, {
      assist_terminal_sn: 'CQUF222760148',
      assist_terminal_alias: 'CIMA',
      assist_area_alias: 'Acceso principal',
      assist_origin: 'adms',
      assist_verify_method: 15,
    })
    ids.app = await insertAssist(2, {
      assist_origin: 'self-service',
      assist_latitude: '20.673822',
      assist_longitude: '-103.385461',
      assist_precision: 8.4,
    })
    ids.backoffice = await insertAssist(3, {
      assist_origin: 'admin-capture',
      assist_created_by_user_id: actor.user.userId,
      assist_created_at: '2026-09-01 16:30:00',
    })

    return async () => {
      await db.from('assists').whereIn('assist_id', Object.values(ids)).delete()
      await cleanupEmployeeFixture(fixture)
      await cleanupTenantActor(actor)
      await cleanupTenantActor(otherActor)
    }
  })

  test('una checada de checador trae sus datos y su método de verificación', async ({
    client,
    assert,
  }) => {
    const response = await get(client, `/api/v1/assists/${ids.device}/source`)
    response.assertStatus(200)
    const source = response.body().data.assistSource
    assert.equal(source.kind, 'device')
    assert.isNull(source.location)
    assert.deepInclude(source.device, {
      alias: 'CIMA',
      area: 'Acceso principal',
      serialNumber: 'CQUF222760148',
      channel: 'adms',
      verifyMethod: 'face',
      registered: null,
    })
  })

  test('una checada de la app trae su ubicación y su precisión', async ({ client, assert }) => {
    const response = await get(client, `/api/v1/assists/${ids.app}/source`)
    response.assertStatus(200)
    const source = response.body().data.assistSource
    assert.equal(source.kind, 'app')
    assert.deepEqual(source.location, {
      latitude: 20.673822,
      longitude: -103.385461,
      precisionMeters: 8.4,
    })
    assert.isNull(source.device)
  })

  test('un registro manual dice quién lo hizo y cuándo', async ({ client, assert }) => {
    const response = await get(client, `/api/v1/assists/${ids.backoffice}/source`)
    response.assertStatus(200)
    const source = response.body().data.assistSource
    assert.equal(source.kind, 'backoffice')
    assert.isString(source.capture?.name)
    assert.isString(source.capture?.capturedAt)
  })

  test('una checada que no es manual no trae datos de registro', async ({ client, assert }) => {
    const response = await get(client, `/api/v1/assists/${ids.app}/source`)
    assert.isNull(response.body().data.assistSource.capture)
  })

  test('la checada de otra empresa responde 404', async ({ client, assert }) => {
    const response = await get(client, `/api/v1/assists/${ids.app}/source`, otherActor!)
    response.assertStatus(404)
    assert.equal(response.body().key, 'checada-no-encontrada')
  })

  test('pedir la dirección de una checada sin coordenadas responde 422', async ({
    client,
    assert,
  }) => {
    const response = await get(client, `/api/v1/assists/${ids.device}/address`)
    response.assertStatus(422)
    assert.equal(response.body().key, 'checada-sin-ubicacion')
  })

  test('la dirección sale del geocodificador y su falla se puede reintentar', async ({
    assert,
  }) => {
    const ok: ReverseGeocoder = { reverse: async () => 'Av. Vallarta 1234, Guadalajara' }
    const down: ReverseGeocoder = {
      reverse: async () => {
        throw new Error('sin servicio')
      },
    }
    const scope = [fixture!.businessUnitId]

    const found = await TenantContext.run(scope, () => new AssistAddressService(ok).find(ids.app))
    assert.deepEqual(found, { status: 'ok', address: 'Av. Vallarta 1234, Guadalajara' })

    const failed = await TenantContext.run(scope, () =>
      new AssistAddressService(down).find(ids.app)
    )
    assert.deepEqual(failed, { status: 'unavailable' })
  })
})
