import { test } from '@japa/runner'
import {
  cleanupTenantActor,
  createBypassActor,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * USRH1789600808831 — N9 caso 8 y N14 caso 5 (petición HTTP real vía Japa).
 */

const PROBE_PREFIX = '/api/__test__/tenant-scope-closed-default'

test.group('Tenant scope cerrado — sondas HTTP (USRH1789600808831)', (group) => {
  let actor: TenantActor

  group.setup(async () => {
    actor = await createBypassActor('owner', 'tenant-closed-probe')
  })

  group.teardown(async () => {
    await cleanupTenantActor(actor)
  })

  test('N9 · auth sin businessScope lista empleados vacío, no 500', async ({ client, assert }) => {
    const response = await client
      .get(`${PROBE_PREFIX}/employees-unscoped-list`)
      .loginAs(actor.user)

    assert.equal(response.status(), 200)
    assert.deepEqual(response.body().data, [])
  })

  test('N14 · el servidor marca la petición como HTTP para el mixin', async ({ client, assert }) => {
    const response = await client.get(`${PROBE_PREFIX}/http-request-marker`).loginAs(actor.user)

    assert.equal(response.status(), 200)
    assert.isTrue(response.body().inHttpRequest)
  })
})
