import { test } from '@japa/runner'
import type Position from '#models/position'
import {
  cleanupOrgChartFixtures,
  createPositionFixture,
} from '#tests/helpers/org_chart_fixtures'
import {
  assertModuleEnforced,
  assertPermissionDenied,
  businessUnitHeaders,
  cleanupTenantActor,
  createTenantActor,
  grantModulePermissions,
  required,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * Tests funcionales — PositionController.getPdf y PositionController.getExcel
 * Rutas:
 *   - GET /api/positions/get-pdf/:positionId
 *   - GET /api/positions/get-excel/:positionId
 *
 * Ambas montan `auth()`, `businessScope()` y piden `organization-chart:read`
 * (el organigrama tiene la exigencia encendida). Por eso cada caso fija un
 * actor explícito con su propia unidad de negocio y la concesión que necesita,
 * en lugar de tomar "el primer usuario" y un puesto de la BD de desarrollo:
 * en una BD recién sembrada esos datos no existen y el rol de ese usuario no
 * se conoce.
 *
 * Comportamiento documentado:
 *   - 403 PERM.DENIED → sin `organization-chart:read`.
 *   - 404 → el puesto no existe o no es de una unidad del alcance del usuario.
 *   - 200 → application/pdf (o XLSX) con Content-Disposition de descarga.
 */

const MODULE = 'organization-chart'
const MISSING_POSITION_ID = 999_999_999
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
/**
 * El PDF y el Excel se generan en memoria y el PDF descarga el logo de
 * `system_settings` (timeout propio de 8 s): más lento que el resto de la suite.
 */
const DOWNLOAD_TIMEOUT_MS = 30_000

async function cleanupActorWithPositions(actor: TenantActor | null): Promise<void> {
  if (actor) {
    await cleanupOrgChartFixtures(actor.businessUnit.businessUnitId)
  }
  await cleanupTenantActor(actor)
}

test.group('Position PDF - GET /api/positions/get-pdf/:positionId', (group) => {
  let actor: TenantActor | null = null
  let position: Position | null = null

  group.setup(async () => {
    await assertModuleEnforced(MODULE)
    actor = await createTenantActor('perfil-puesto-pdf')
    position = await createPositionFixture(actor.businessUnit.businessUnitId, 'Puesto PDF')
  })

  group.teardown(async () => {
    await cleanupActorWithPositions(actor)
  })

  test('responde PERM.DENIED sin organization-chart:read', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')
    const target = required(position, 'el puesto')
    await grantModulePermissions(tenant, MODULE, [])

    const response = await client
      .get(`/api/positions/get-pdf/${target.positionId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))

    assertPermissionDenied(assert, response)
  })

  test('devuelve 404 si el puesto no existe', async ({ client }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, ['read'])

    const response = await client
      .get(`/api/positions/get-pdf/${MISSING_POSITION_ID}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))

    response.assertStatus(404)
    response.assertBodyContains({ type: 'warning' })
  })

  test('devuelve 200 con un PDF válido cuando el puesto existe', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')
    const target = required(position, 'el puesto')
    await grantModulePermissions(tenant, MODULE, ['read'])

    const response = await client
      .get(`/api/positions/get-pdf/${target.positionId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))

    response.assertStatus(200)
    response.assertHeader('content-type', 'application/pdf')

    const disposition = response.header('content-disposition')
    assert.exists(disposition)
    assert.match(String(disposition), /perfil-puesto-\d+\.pdf/)

    const contentLength = response.header('content-length')
    assert.exists(contentLength)
    assert.isAtLeast(Number(contentLength), 1)
  }).timeout(DOWNLOAD_TIMEOUT_MS)
})

test.group('Position Excel - GET /api/positions/get-excel/:positionId', (group) => {
  let actor: TenantActor | null = null
  let position: Position | null = null

  group.setup(async () => {
    await assertModuleEnforced(MODULE)
    actor = await createTenantActor('perfil-puesto-excel')
    position = await createPositionFixture(actor.businessUnit.businessUnitId, 'Puesto Excel')
  })

  group.teardown(async () => {
    await cleanupActorWithPositions(actor)
  })

  test('responde PERM.DENIED sin organization-chart:read', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')
    const target = required(position, 'el puesto')
    await grantModulePermissions(tenant, MODULE, [])

    const response = await client
      .get(`/api/positions/get-excel/${target.positionId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))

    assertPermissionDenied(assert, response)
  })

  test('devuelve 404 si el puesto no existe', async ({ client }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, ['read'])

    const response = await client
      .get(`/api/positions/get-excel/${MISSING_POSITION_ID}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))

    response.assertStatus(404)
    response.assertBodyContains({ type: 'warning' })
  })

  test('devuelve 200 con un XLSX válido cuando el puesto existe', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')
    const target = required(position, 'el puesto')
    await grantModulePermissions(tenant, MODULE, ['read'])

    const response = await client
      .get(`/api/positions/get-excel/${target.positionId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))

    response.assertStatus(200)
    response.assertHeader('content-type', XLSX_MIME)

    const disposition = response.header('content-disposition')
    assert.exists(disposition)
    assert.match(String(disposition), /perfil-puesto-\d+\.xlsx/)

    const contentLength = response.header('content-length')
    assert.exists(contentLength)
    assert.isAtLeast(Number(contentLength), 1)
  }).timeout(DOWNLOAD_TIMEOUT_MS)
})
