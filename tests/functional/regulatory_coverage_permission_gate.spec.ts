import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import Regulation from '#models/regulation'
import {
  assertModuleEnforced,
  assertPermissionDenied,
  cleanupTenantActor,
  createBypassActor,
  createTenantActor,
  grantModulePermissions,
  required,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * Cobertura regulatoria con la exigencia encendida: las tres lecturas de
 * cobertura y las cinco del marco regulatorio exigen `regulatory-coverage:read`.
 * Solo las consume la pantalla de cobertura del backoffice (o nadie), así que
 * ninguna queda abierta.
 *
 * El catálogo regulatorio es global (sin empresa): los actores no mandan
 * cabecera de unidad de negocio y los datos vienen de la siembra (0028-0033).
 */

const MODULE = 'regulatory-coverage'
const REGULATION_CODE = 'NOM-035-STPS'

interface ApiCall {
  label: string
  url: string
}

/** Las ocho lecturas protegidas, con parámetros que existen en la siembra. */
async function protectedCalls(): Promise<ApiCall[]> {
  const regulation = await Regulation.query()
    .where('regulation_code', REGULATION_CODE)
    .firstOrFail()

  return [
    { label: 'lista de cobertura', url: '/api/v1/regulatory-coverage' },
    { label: 'resumen ejecutivo', url: '/api/v1/regulatory-coverage/summary' },
    {
      label: 'detalle de cobertura por norma',
      url: `/api/v1/regulatory-coverage/${regulation.regulationId}`,
    },
    { label: 'lista de autoridades', url: '/api/v1/regulatory-authorities' },
    { label: 'detalle de autoridad', url: '/api/v1/regulatory-authorities/stps' },
    { label: 'norma con árbol de numerales', url: `/api/v1/regulations/${REGULATION_CODE}` },
    { label: 'numeral', url: `/api/v1/regulations/${REGULATION_CODE}/clauses/5.8.a` },
    {
      label: 'features del numeral',
      url: `/api/v1/regulations/${REGULATION_CODE}/clauses/5.8.a/features`,
    },
  ]
}

function send(client: ApiClient, actor: TenantActor, call: ApiCall) {
  return client.get(call.url).loginAs(actor.user)
}

test.group('Cobertura regulatoria — permissionGate con exigencia encendida', (group) => {
  let actor: TenantActor | null = null
  let owner: TenantActor | null = null

  group.setup(async () => {
    await assertModuleEnforced(MODULE)
    owner = await createBypassActor('owner', 'cobertura-owner')
  })

  group.teardown(async () => {
    await cleanupTenantActor(owner)
  })

  group.each.setup(async () => {
    actor = await createTenantActor('cobertura-gate')
  })

  group.each.teardown(async () => {
    await cleanupTenantActor(actor)
    actor = null
  })

  test('sin sesión: las ocho responden 401, auth corre antes que el gate', async ({
    client,
    assert,
  }) => {
    // Si el gate corriera antes que auth, la respuesta sería 403 PERM.UNRESOLVED.
    for (const call of await protectedCalls()) {
      const response = await client.get(call.url)
      assert.equal(response.status(), 401, call.label)
    }
  })

  test('sin concesiones: las ocho responden PERM.DENIED', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, [])

    for (const call of await protectedCalls()) {
      const response = await send(client, tenant, call)
      assert.equal(response.status(), 403, `${call.label}: ${JSON.stringify(response.body())}`)
      assertPermissionDenied(assert, response)
    }
  })

  test('read abre las ocho lecturas', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, ['read'])

    for (const call of await protectedCalls()) {
      const response = await send(client, tenant, call)
      assert.equal(response.status(), 200, `${call.label}: ${JSON.stringify(response.body())}`)
    }
  })

  test('owner pasa el gate sin concesiones (bypass standard)', async ({ client, assert }) => {
    const account = required(owner, 'el owner')

    for (const call of await protectedCalls()) {
      const response = await send(client, account, call)
      assert.equal(response.status(), 200, `${call.label}: ${JSON.stringify(response.body())}`)
    }
  })
})
