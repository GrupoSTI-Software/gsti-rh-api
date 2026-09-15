import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import type { ApiClient } from '@japa/api-client'
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
 * Registro auditable de eventos traumáticos con la exigencia encendida: la
 * lista y su PDF exigen `traumatic-event-reports-registry:read`, el mismo
 * permiso con el que el backoffice arma el menú y protege la pantalla. Antes el
 * controller pedía `traumatic-event-reports:read`; ese permiso ya no abre el
 * registro.
 *
 * El catálogo de tipos de evento queda abierto: lo usan el formulario de
 * reportes y la app del colaborador.
 *
 * Cada caso usa un actor con empresa propia y sin reportes: la lista sale vacía
 * y el PDF con su estado vacío, que basta para probar el permiso.
 */

const MODULE = 'traumatic-event-reports-registry'
const REPORTS_MODULE = 'traumatic-event-reports'

interface ApiCall {
  label: string
  url: string
}

const REGISTRY_CALL: ApiCall = {
  label: 'lista del registro',
  url: '/api/traumatic-event-reports/registry',
}

const EXPORT_CALL: ApiCall = {
  label: 'PDF del registro',
  url: '/api/traumatic-event-reports/registry/export',
}

const EVENT_TYPES_CALL: ApiCall = {
  label: 'catálogo de tipos de evento',
  url: '/api/traumatic-event-types',
}

const PROTECTED_CALLS: readonly ApiCall[] = [REGISTRY_CALL, EXPORT_CALL]

function send(client: ApiClient, actor: TenantActor, call: ApiCall) {
  return client.get(call.url).loginAs(actor.user).headers(businessUnitHeaders(actor))
}

async function assertDeniedAll(assert: Assert, client: ApiClient, actor: TenantActor) {
  for (const call of PROTECTED_CALLS) {
    const response = await send(client, actor, call)
    assert.equal(response.status(), 403, `${call.label}: ${JSON.stringify(response.body())}`)
    assertPermissionDenied(assert, response)
  }
}

test.group(
  'Registro auditable de eventos traumáticos — permissionGate con exigencia encendida',
  (group) => {
    let actor: TenantActor | null = null
    let owner: TenantActor | null = null

    group.setup(async () => {
      await assertModuleEnforced(MODULE)
      owner = await createBypassActor('owner', 'registro-traumatico-owner')
    })

    group.teardown(async () => {
      await cleanupTenantActor(owner)
    })

    group.each.setup(async () => {
      actor = await createTenantActor('registro-traumatico-gate')
    })

    group.each.teardown(async () => {
      await cleanupTenantActor(actor)
      actor = null
    })

    test('sin concesiones: la lista y el PDF responden PERM.DENIED', async ({ client, assert }) => {
      const tenant = required(actor, 'el actor')
      await grantModulePermissions(tenant, MODULE, [])

      await assertDeniedAll(assert, client, tenant)
    })

    test('traumatic-event-reports:read ya no abre el registro', async ({ client, assert }) => {
      const tenant = required(actor, 'el actor')
      await grantModulePermissions(tenant, REPORTS_MODULE, ['read'])

      await assertDeniedAll(assert, client, tenant)
    })

    test('traumatic-event-reports-registry:read abre la lista y el PDF', async ({
      client,
      assert,
    }) => {
      const tenant = required(actor, 'el actor')
      await grantModulePermissions(tenant, MODULE, ['read'])

      const list = await send(client, tenant, REGISTRY_CALL)
      assert.equal(list.status(), 200, JSON.stringify(list.body()))
      assert.exists(list.body().data)

      // Sin employees:export-sensitive-data el PDF sale enmascarado y sin motivo:
      // aquí solo importa que el gate lo deje pasar.
      const pdf = await send(client, tenant, EXPORT_CALL)
      assert.equal(pdf.status(), 200)
      assert.include(String(pdf.header('content-type')), 'application/pdf')
    })

    test('sin concesiones: el catálogo de tipos de evento sigue abierto', async ({
      client,
      assert,
    }) => {
      const tenant = required(actor, 'el actor')
      await grantModulePermissions(tenant, MODULE, [])

      const response = await send(client, tenant, EVENT_TYPES_CALL)
      assert.equal(response.status(), 200, JSON.stringify(response.body()))
    })

    test('owner pasa el gate sin concesiones (bypass standard)', async ({ client, assert }) => {
      const account = required(owner, 'el owner')

      const list = await send(client, account, REGISTRY_CALL)
      assert.equal(list.status(), 200, JSON.stringify(list.body()))
    })
  }
)
