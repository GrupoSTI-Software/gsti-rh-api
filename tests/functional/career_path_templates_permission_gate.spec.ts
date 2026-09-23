import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import type { ApiClient, ApiResponse } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import { PERMISSION_GATE_ERROR_CODES } from '#constants/permission_gate_error_codes'
import {
  assertModuleEnforced,
  businessUnitHeaders,
  cleanupTenantActor,
  createBypassActor,
  createTenantActor,
  grantModulePermissions,
  required,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * Catálogo de rutas de carrera con la exigencia encendida: alta, detalle,
 * edición y baja piden `career-path-templates:create/read/update/delete`.
 * Antes cualquier sesión del tenant escribía el catálogo por API. La lista
 * queda abierta porque la pestaña Ruta de carrera del expediente la usa para
 * proponer.
 *
 * Cada caso arma su propia empresa con tres puestos; la plantilla de partida
 * va de A a B, así que las altas y ediciones usan pares distintos para no
 * chocar con la validación de relación repetida.
 */

const MODULE = 'career-path-templates'

type HttpMethod = 'get' | 'post' | 'put' | 'delete'

interface GateRequest {
  method: HttpMethod
  url: string
  body?: Record<string, unknown>
}

interface CatalogFixture {
  actor: TenantActor
  positionIds: number[]
}

const uniqueStamp = () => `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

async function createPositions(businessUnitId: number, count: number): Promise<number[]> {
  const ids: number[] = []
  for (let index = 0; index < count; index++) {
    const stamp = `${uniqueStamp()}-${index}`
    const [id] = await db.table('positions').insert({
      position_sync_id: stamp,
      position_code: `CPT-${stamp}`,
      position_name: `Puesto ruta ${index}`,
      company_id: businessUnitId,
      business_unit_id: businessUnitId,
      position_active: 1,
      position_created_at: new Date(),
    })
    ids.push(Number(id))
  }
  return ids
}

async function createCatalogFixture(actor: TenantActor): Promise<CatalogFixture> {
  return { actor, positionIds: await createPositions(actor.businessUnit.businessUnitId, 3) }
}

async function createTemplateFixture(
  fixture: CatalogFixture,
  originIndex: number,
  targetIndex: number
): Promise<number> {
  const [id] = await db.table('career_path_templates').insert({
    business_unit_id: fixture.actor.businessUnit.businessUnitId,
    origin_position_id: fixture.positionIds[originIndex],
    target_position_id: fixture.positionIds[targetIndex],
    created_by: fixture.actor.user.userId,
    updated_by: fixture.actor.user.userId,
    career_path_template_created_at: new Date(),
  })
  return Number(id)
}

/** Plantillas y puestos referencian a la empresa y al usuario: se borran antes que el actor. */
async function cleanupCatalogFixture(fixture: CatalogFixture | null): Promise<void> {
  if (!fixture) return
  await db
    .from('career_path_templates')
    .where('business_unit_id', fixture.actor.businessUnit.businessUnitId)
    .delete()
  if (fixture.positionIds.length > 0) {
    await db.from('positions').whereIn('position_id', fixture.positionIds).delete()
  }
  await cleanupTenantActor(fixture.actor)
}

const storeRequest = (fixture: CatalogFixture, originIndex: number, targetIndex: number): GateRequest => ({
  method: 'post',
  url: '/api/career-path-templates',
  body: {
    originPositionId: fixture.positionIds[originIndex],
    targetPositionId: fixture.positionIds[targetIndex],
  },
})

const showRequest = (templateId: number): GateRequest => ({
  method: 'get',
  url: `/api/career-path-templates/${templateId}`,
})

const updateRequest = (
  fixture: CatalogFixture,
  templateId: number,
  originIndex: number,
  targetIndex: number
): GateRequest => ({
  method: 'put',
  url: `/api/career-path-templates/${templateId}`,
  body: {
    originPositionId: fixture.positionIds[originIndex],
    targetPositionId: fixture.positionIds[targetIndex],
  },
})

const destroyRequest = (templateId: number): GateRequest => ({
  method: 'delete',
  url: `/api/career-path-templates/${templateId}`,
})

function send(client: ApiClient, actor: TenantActor, request: GateRequest) {
  const pending = client[request.method](request.url)
    .loginAs(actor.user)
    .headers(businessUnitHeaders(actor))
  return request.body ? pending.json(request.body) : pending
}

/** Negativa del gate con el método y la URL en el mensaje, para ubicar la ruta que falló. */
function assertDeniedFor(assert: Assert, response: ApiResponse, request: GateRequest): void {
  const label = `${request.method.toUpperCase()} ${request.url}`
  assert.equal(response.status(), 403, label)
  assert.equal(response.body()?.key, PERMISSION_GATE_ERROR_CODES.DENIED, label)
}

async function templateRow(templateId: number) {
  return db.from('career_path_templates').where('career_path_template_id', templateId).first()
}

test.group('Catálogo de rutas de carrera — permissionGate con exigencia encendida', (group) => {
  let fixture: CatalogFixture | null = null

  group.setup(async () => {
    await assertModuleEnforced(MODULE)
  })

  group.each.setup(async () => {
    fixture = await createCatalogFixture(await createTenantActor('rutas-carrera-gate'))
  })

  group.each.teardown(async () => {
    await cleanupCatalogFixture(fixture)
    fixture = null
  })

  test('sin concesiones: alta, detalle, edición y baja responden PERM.DENIED y no escriben', async ({
    client,
    assert,
  }) => {
    const current = required(fixture, 'el fixture')
    await grantModulePermissions(current.actor, MODULE, [])
    const templateId = await createTemplateFixture(current, 0, 1)

    const requests = [
      storeRequest(current, 1, 2),
      showRequest(templateId),
      updateRequest(current, templateId, 0, 2),
      destroyRequest(templateId),
    ]
    for (const request of requests) {
      assertDeniedFor(assert, await send(client, current.actor, request), request)
    }

    const row = await templateRow(templateId)
    assert.equal(row?.target_position_id, current.positionIds[1])
    assert.isNull(row?.career_path_template_deleted_at)
    const created = await db
      .from('career_path_templates')
      .where('business_unit_id', current.actor.businessUnit.businessUnitId)
      .count('* as total')
    assert.equal(Number(created[0].total), 1)
  })

  test('read abre el detalle y no las escrituras', async ({ client, assert }) => {
    const current = required(fixture, 'el fixture')
    await grantModulePermissions(current.actor, MODULE, ['read'])
    const templateId = await createTemplateFixture(current, 0, 1)

    const shown = await send(client, current.actor, showRequest(templateId))
    assert.equal(shown.status(), 200, JSON.stringify(shown.body()))

    for (const request of [
      storeRequest(current, 1, 2),
      updateRequest(current, templateId, 0, 2),
      destroyRequest(templateId),
    ]) {
      assertDeniedFor(assert, await send(client, current.actor, request), request)
    }
  })

  test('create abre el alta y no el detalle, la edición ni la baja', async ({ client, assert }) => {
    const current = required(fixture, 'el fixture')
    await grantModulePermissions(current.actor, MODULE, ['create'])
    const templateId = await createTemplateFixture(current, 0, 1)

    const created = await send(client, current.actor, storeRequest(current, 1, 2))
    assert.equal(created.status(), 201, JSON.stringify(created.body()))

    for (const request of [
      showRequest(templateId),
      updateRequest(current, templateId, 0, 2),
      destroyRequest(templateId),
    ]) {
      assertDeniedFor(assert, await send(client, current.actor, request), request)
    }
  })

  test('update abre la edición y no el alta ni la baja', async ({ client, assert }) => {
    const current = required(fixture, 'el fixture')
    await grantModulePermissions(current.actor, MODULE, ['update'])
    const templateId = await createTemplateFixture(current, 0, 1)

    const updated = await send(client, current.actor, updateRequest(current, templateId, 0, 2))
    assert.equal(updated.status(), 200, JSON.stringify(updated.body()))
    const row = await templateRow(templateId)
    assert.equal(row?.target_position_id, current.positionIds[2])

    for (const request of [storeRequest(current, 1, 2), destroyRequest(templateId)]) {
      assertDeniedFor(assert, await send(client, current.actor, request), request)
    }
  })

  test('delete abre la baja y no el alta ni la edición', async ({ client, assert }) => {
    const current = required(fixture, 'el fixture')
    await grantModulePermissions(current.actor, MODULE, ['delete'])
    const toDelete = await createTemplateFixture(current, 0, 1)
    const toKeep = await createTemplateFixture(current, 1, 0)

    const destroyed = await send(client, current.actor, destroyRequest(toDelete))
    assert.equal(destroyed.status(), 200, JSON.stringify(destroyed.body()))
    const row = await templateRow(toDelete)
    assert.isNotNull(row?.career_path_template_deleted_at)

    for (const request of [storeRequest(current, 1, 2), updateRequest(current, toKeep, 1, 2)]) {
      assertDeniedFor(assert, await send(client, current.actor, request), request)
    }
  })

  test('sin concesiones: la lista del catálogo sigue abierta para la pestaña del expediente', async ({
    client,
    assert,
  }) => {
    const current = required(fixture, 'el fixture')
    await grantModulePermissions(current.actor, MODULE, [])
    await createTemplateFixture(current, 0, 1)

    const listed = await send(client, current.actor, {
      method: 'get',
      url: '/api/career-path-templates',
    })
    assert.equal(listed.status(), 200, JSON.stringify(listed.body()))
  })

  test('owner y root dan de alta sin concesiones (bypass standard)', async ({ client, assert }) => {
    for (const slug of ['owner', 'root'] as const) {
      const bypass = await createCatalogFixture(
        await createBypassActor(slug, `rutas-carrera-${slug}`)
      )
      try {
        const response = await send(client, bypass.actor, storeRequest(bypass, 0, 1))
        assert.equal(response.status(), 201, `${slug}: ${JSON.stringify(response.body())}`)
      } finally {
        await cleanupCatalogFixture(bypass)
      }
    }
  })
})
