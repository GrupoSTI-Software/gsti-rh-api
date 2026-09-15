import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import type { ApiClient, ApiResponse } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import Certification from '#models/certification'
import CertificationCategory from '#models/certification_category'
import { PERMISSION_GATE_ERROR_CODES } from '#constants/permission_gate_error_codes'
import {
  assertModuleEnforced,
  cleanupTenantActor,
  createBypassActor,
  createTenantActor,
  grantModulePermissions,
  required,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * Catálogo de certificaciones con la exigencia encendida: alta, edición y baja
 * piden `certifications:create/update/delete`. Antes colgaban de la pestaña de
 * certificaciones de Empleados; el caso de esos permisos viejos cuida que no
 * vuelvan a abrir el catálogo. La lista y las categorías quedan abiertas porque
 * el panel de certificaciones requeridas del Organigrama las usa.
 *
 * El catálogo es global (sin unidad de negocio): los fixtures se identifican
 * por un prefijo de nombre propio de la corrida y se borran al final.
 */

const MODULE = 'certifications'
const RUN_PREFIX = `Cert gate ${Date.now()}-${Math.floor(Math.random() * 100_000)}`

type HttpMethod = 'get' | 'post' | 'put' | 'delete'

interface GateRequest {
  method: HttpMethod
  url: string
  body?: Record<string, unknown>
}

let nameCounter = 0
const nextName = (label: string) => `${RUN_PREFIX} ${label} ${++nameCounter}`

async function createCertificationFixture(categoryId: number, label: string): Promise<Certification> {
  return Certification.create({
    categoryId,
    certificationName: nextName(label),
    isExternal: false,
    renewalPeriodDays: 365,
  })
}

function certificationBody(name: string, categoryId: number, actor: TenantActor) {
  return {
    name,
    categoryId,
    isExternal: false,
    renewalPeriodDays: 365,
    businessUnitIds: [actor.businessUnit.businessUnitId],
  }
}

const storeRequest = (name: string, categoryId: number, actor: TenantActor): GateRequest => ({
  method: 'post',
  url: '/api/certifications',
  body: certificationBody(name, categoryId, actor),
})

const updateRequest = (
  certification: Certification,
  name: string,
  categoryId: number,
  actor: TenantActor
): GateRequest => ({
  method: 'put',
  url: `/api/certifications/${certification.certificationId}`,
  body: certificationBody(name, categoryId, actor),
})

const destroyRequest = (certification: Certification): GateRequest => ({
  method: 'delete',
  url: `/api/certifications/${certification.certificationId}`,
})

function send(client: ApiClient, actor: TenantActor, request: GateRequest) {
  const pending = client[request.method](request.url).loginAs(actor.user)
  return request.body ? pending.json(request.body) : pending
}

/** Negativa del gate con el método y la URL en el mensaje, para ubicar la ruta que falló. */
function assertDeniedFor(assert: Assert, response: ApiResponse, request: GateRequest): void {
  const label = `${request.method.toUpperCase()} ${request.url}`
  assert.equal(response.status(), 403, label)
  assert.equal(response.body()?.key, PERMISSION_GATE_ERROR_CODES.DENIED, label)
}

/** Las ligas empresa-certificación que creó el alta impiden borrar la empresa del actor. */
async function cleanupCertificationActor(actor: TenantActor | null): Promise<void> {
  if (!actor) return
  await db
    .from('business_unit_certifications')
    .where('business_unit_id', actor.businessUnit.businessUnitId)
    .delete()
  await cleanupTenantActor(actor)
}

test.group('Catálogo de certificaciones — permissionGate con exigencia encendida', (group) => {
  let actor: TenantActor | null = null
  let category: CertificationCategory | null = null
  let createdCategoryId: number | null = null

  group.setup(async () => {
    await assertModuleEnforced(MODULE)
    // 0027 siembra las categorías; solo si faltan se crea una propia del spec.
    category = await CertificationCategory.query().where('certification_category_is_active', 1).first()
    if (!category) {
      category = await CertificationCategory.create({
        certificationCategoryName: `${RUN_PREFIX} categoría`,
        certificationCategoryKey: `cert-gate-${Date.now()}`,
        certificationCategoryIsActive: 1,
        certificationCategoryDisplayOrder: 999,
      })
      createdCategoryId = category.certificationCategoryId
    }
  })

  group.teardown(async () => {
    const rows: { certification_id: number }[] = await db
      .from('certifications')
      .where('certification_name', 'like', `${RUN_PREFIX}%`)
      .select('certification_id')
    const ids = rows.map((row) => row.certification_id)
    if (ids.length > 0) {
      await db.from('business_unit_certifications').whereIn('certification_id', ids).delete()
      await db.from('certifications').whereIn('certification_id', ids).delete()
    }
    if (createdCategoryId) {
      await CertificationCategory.query().where('certification_category_id', createdCategoryId).delete()
    }
  })

  group.each.setup(async () => {
    actor = await createTenantActor('certificaciones-gate')
  })

  group.each.teardown(async () => {
    await cleanupCertificationActor(actor)
    actor = null
  })

  test('sin concesiones: alta, edición y baja del catálogo responden PERM.DENIED y no escriben', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const categoryId = required(category, 'la categoría').certificationCategoryId
    await grantModulePermissions(tenant, MODULE, [])
    const certification = await createCertificationFixture(categoryId, 'sin-permiso')
    const deniedName = nextName('alta-negada')

    const requests = [
      storeRequest(deniedName, categoryId, tenant),
      updateRequest(certification, nextName('edicion-negada'), categoryId, tenant),
      destroyRequest(certification),
    ]
    for (const request of requests) {
      assertDeniedFor(assert, await send(client, tenant, request), request)
    }

    const reloaded = await Certification.findOrFail(certification.certificationId)
    assert.equal(reloaded.certificationName, certification.certificationName)
    assert.isNull(await Certification.query().where('certification_name', deniedName).first())
  })

  test('los permisos de la pestaña de certificaciones del empleado ya no abren el catálogo', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const categoryId = required(category, 'la categoría').certificationCategoryId
    await grantModulePermissions(tenant, 'employees', [
      'tab-certificaciones-write',
      'tab-certificaciones-delete',
    ])
    const certification = await createCertificationFixture(categoryId, 'permiso-viejo')

    const requests = [
      storeRequest(nextName('alta-permiso-viejo'), categoryId, tenant),
      updateRequest(certification, nextName('edicion-permiso-viejo'), categoryId, tenant),
      destroyRequest(certification),
    ]
    for (const request of requests) {
      assertDeniedFor(assert, await send(client, tenant, request), request)
    }
  })

  test('create abre el alta y no la edición ni la baja', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')
    const categoryId = required(category, 'la categoría').certificationCategoryId
    await grantModulePermissions(tenant, MODULE, ['create'])
    const name = nextName('alta')

    const created = await send(client, tenant, storeRequest(name, categoryId, tenant))
    assert.equal(created.status(), 201, JSON.stringify(created.body()))
    assert.isNotNull(await Certification.query().where('certification_name', name).first())

    const certification = await createCertificationFixture(categoryId, 'solo-alta')
    for (const request of [
      updateRequest(certification, nextName('edicion-solo-alta'), categoryId, tenant),
      destroyRequest(certification),
    ]) {
      assertDeniedFor(assert, await send(client, tenant, request), request)
    }
  })

  test('update abre la edición y no el alta ni la baja', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')
    const categoryId = required(category, 'la categoría').certificationCategoryId
    await grantModulePermissions(tenant, MODULE, ['update'])
    const certification = await createCertificationFixture(categoryId, 'edicion')
    const newName = nextName('editada')

    const updated = await send(client, tenant, updateRequest(certification, newName, categoryId, tenant))
    assert.equal(updated.status(), 200, JSON.stringify(updated.body()))
    const reloaded = await Certification.findOrFail(certification.certificationId)
    assert.equal(reloaded.certificationName, newName)

    for (const request of [
      storeRequest(nextName('alta-solo-edicion'), categoryId, tenant),
      destroyRequest(certification),
    ]) {
      assertDeniedFor(assert, await send(client, tenant, request), request)
    }
  })

  test('delete abre la baja y no el alta ni la edición', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')
    const categoryId = required(category, 'la categoría').certificationCategoryId
    await grantModulePermissions(tenant, MODULE, ['delete'])
    const toDelete = await createCertificationFixture(categoryId, 'baja')
    const toKeep = await createCertificationFixture(categoryId, 'solo-baja')

    const destroyed = await send(client, tenant, destroyRequest(toDelete))
    assert.equal(destroyed.status(), 204, JSON.stringify(destroyed.body()))

    for (const request of [
      storeRequest(nextName('alta-solo-baja'), categoryId, tenant),
      updateRequest(toKeep, nextName('edicion-solo-baja'), categoryId, tenant),
    ]) {
      assertDeniedFor(assert, await send(client, tenant, request), request)
    }
  })

  test('sin concesiones: la lista del catálogo y las categorías siguen abiertas', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, [])

    for (const url of ['/api/certifications', '/api/certification-categories']) {
      const response = await send(client, tenant, { method: 'get', url })
      assert.equal(response.status(), 200, `${url}: ${JSON.stringify(response.body())}`)
    }
  })

  test('owner y root dan de alta sin concesiones (bypass standard)', async ({ client, assert }) => {
    const categoryId = required(category, 'la categoría').certificationCategoryId

    for (const slug of ['owner', 'root'] as const) {
      const bypass = await createBypassActor(slug, `certificaciones-${slug}`)
      try {
        const response = await send(
          client,
          bypass,
          storeRequest(nextName(`alta-${slug}`), categoryId, bypass)
        )
        assert.equal(response.status(), 201, `${slug}: ${JSON.stringify(response.body())}`)
      } finally {
        await cleanupCertificationActor(bypass)
      }
    }
  })
})
