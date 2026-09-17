import { test } from '@japa/runner'
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
 * Simulador de reforma 40 hrs con la exigencia encendida: la simulación trae el
 * roster de empleados con su impacto y solo la lee quien tiene
 * `reform-simulation:read` (root y owner por salvoconducto).
 */

const MODULE = 'reform-simulation'
const URL = '/api/v1/working-time-rules/reform-simulation'

test.group('Simulador de reforma 40 hrs — permissionGate con exigencia encendida', (group) => {
  let actor: TenantActor | null = null
  let owner: TenantActor | null = null

  group.setup(async () => {
    await assertModuleEnforced(MODULE)
    actor = await createTenantActor('reforma-gate')
    owner = await createBypassActor('owner', 'reforma-owner')
  })

  group.teardown(async () => {
    await cleanupTenantActor(actor)
    await cleanupTenantActor(owner)
  })

  test('sin read responde PERM.DENIED', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, [])

    const response = await client
      .get(`${URL}?targetYear=2027`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
    assertPermissionDenied(assert, response)
  })

  test('con read cruza el gate: simula y valida el año como antes', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, ['read'])

    const simulated = await client
      .get(`${URL}?targetYear=2027`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
    assertPassesGate(assert, simulated)

    const invalid = await client.get(URL).loginAs(tenant.user).headers(businessUnitHeaders(tenant))
    invalid.assertStatus(422)
  })

  test('owner cruza el gate sin concesiones', async ({ client, assert }) => {
    const account = required(owner, 'el owner')

    const response = await client
      .get(`${URL}?targetYear=2027`)
      .loginAs(account.user)
      .headers(businessUnitHeaders(account))
    assertPassesGate(assert, response)
  })
})
