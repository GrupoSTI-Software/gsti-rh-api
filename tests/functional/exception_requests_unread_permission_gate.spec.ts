import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import {
  assertPermissionDenied,
  businessUnitHeaders,
  cleanupTenantActor,
  createBypassActor,
  createTenantActor,
  grantModulePermissions,
  required,
  setModuleEnforcement,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * `GET /api/exception-requests/unread` con la exigencia de Empleados encendida.
 * No tenía gate: cualquier sesión obtenía las solicitudes no leídas. Ahora pide
 * `employees:tab-trabajo-read`, igual que `GET /all`, que devuelve el mismo
 * dato. El resto de la pantalla (listado, detalle y cambio de estatus) sigue
 * gobernado por Empleados; mover todo a `exception-requests` es otra decisión.
 */

const EMPLOYEES_MODULE = 'employees'
const UNREAD_URL = '/api/exception-requests/unread'

function send(client: ApiClient, actor: TenantActor) {
  return client.get(UNREAD_URL).loginAs(actor.user).headers(businessUnitHeaders(actor))
}

test.group('Solicitudes de permisos no leídas — permissionGate', (group) => {
  let actor: TenantActor | null = null
  let owner: TenantActor | null = null
  let previousEmployeesEnforcement: boolean | null = null

  group.setup(async () => {
    // Specs anteriores de Empleados apagan su exigencia y no siempre la
    // restauran: el grupo la enciende y al final deja el valor que encontró.
    previousEmployeesEnforcement = await setModuleEnforcement(EMPLOYEES_MODULE, true)
    owner = await createBypassActor('owner', 'no-leidas-owner')
  })

  group.teardown(async () => {
    await cleanupTenantActor(owner)
    if (previousEmployeesEnforcement !== null) {
      await setModuleEnforcement(EMPLOYEES_MODULE, previousEmployeesEnforcement)
    }
  })

  group.each.setup(async () => {
    actor = await createTenantActor('no-leidas-gate')
  })

  group.each.teardown(async () => {
    await cleanupTenantActor(actor)
    actor = null
  })

  test('sin concesiones responde PERM.DENIED', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, EMPLOYEES_MODULE, [])

    assertPermissionDenied(assert, await send(client, tenant))
  })

  test('lo gobierna Empleados, igual que /all: exception-requests:read no lo abre', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, 'exception-requests', ['read'])

    assertPermissionDenied(assert, await send(client, tenant))
  })

  test('tab-trabajo-read lo abre', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, EMPLOYEES_MODULE, ['tab-trabajo-read'])

    const response = await send(client, tenant)
    assert.equal(response.status(), 200, JSON.stringify(response.body()))
  })

  test('owner pasa el gate sin concesiones (bypass standard)', async ({ client, assert }) => {
    const response = await send(client, required(owner, 'el owner'))
    assert.equal(response.status(), 200, JSON.stringify(response.body()))
  })
})
