import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import Competency from '#models/competency'
import BusinessUnitCompetencyLevel from '#models/business_unit_competency_level'
import CompetencyDescriptor from '#models/competency_descriptor'
import CompetencyBracket from '#models/competency_bracket'
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
 * Competencias con la exigencia encendida: competencias, niveles, descriptores
 * y rangos piden su permiso de `competencies`. Editar un nivel es `update`
 * estricto (con `create` o `delete` no se renombra ni se reordena). Alta de
 * descriptor o rango acepta `create` o `update`; su edición y su baja, `update`.
 *
 * Quedan abiertas las lecturas que consumen otras pantallas: la lista de
 * competencias (Organigrama), la de niveles (Matriz de competencias y
 * evaluaciones) y los rangos por descriptor (evaluación del empleado).
 *
 * Las competencias son globales y se identifican por un prefijo de nombre
 * propio de la corrida; niveles, descriptores y rangos cuelgan de la empresa
 * del actor y se borran con él.
 */

const MODULE = 'competencies'
const RUN_PREFIX = `Comp gate ${Date.now()}-${Math.floor(Math.random() * 100_000)}`

type HttpMethod = 'get' | 'post' | 'put' | 'delete'

interface GateRequest {
  label: string
  method: HttpMethod
  url: string
  body?: Record<string, unknown>
}

let nameCounter = 0
const nextName = (label: string) => `${RUN_PREFIX} ${label} ${++nameCounter}`

interface CompetencyFixture {
  competency: Competency
  levels: BusinessUnitCompetencyLevel[]
  descriptor: CompetencyDescriptor
  bracket: CompetencyBracket
}

async function createCompetency(label: string): Promise<Competency> {
  return Competency.create({ competencyName: nextName(label), competencyType: 'technical' })
}

/**
 * Cuatro niveles: la baja de un nivel exige que la empresa conserve más de
 * tres (`verifyInfoQuantity`); con menos, el caso con permiso no llegaría a
 * probar que el gate dejó pasar.
 */
async function createFixture(actor: TenantActor, label: string): Promise<CompetencyFixture> {
  const competency = await createCompetency(label)
  const levels: BusinessUnitCompetencyLevel[] = []
  for (const position of [1, 2, 3, 4]) {
    levels.push(
      await BusinessUnitCompetencyLevel.create({
        businessUnitId: actor.businessUnit.businessUnitId,
        businessUnitCompetencyLevelLabel: `Nivel ${position}`,
        businessUnitCompetencyLevelPosition: position,
      })
    )
  }
  const descriptor = await CompetencyDescriptor.create({
    competencyId: competency.competencyId,
    businessUnitCompetencyLevelId: levels[0].businessUnitCompetencyLevelId,
    competencyDescriptorDescription: `Descriptor ${label}`,
  })
  const bracket = await CompetencyBracket.create({
    competencyDescriptorId: descriptor.competencyDescriptorId,
    competencyBracketDescription: `Rango ${label}`,
    competencyBracketRangeMin: 0,
    competencyBracketRangeMax: 10,
    competencyBracketPosition: 1,
  })
  return { competency, levels, descriptor, bracket }
}

const levelUrl = (level: BusinessUnitCompetencyLevel) =>
  `/api/business-unit-competency-levels/${level.businessUnitCompetencyLevelId}`

const requests = {
  storeCompetency: (): GateRequest => ({
    label: 'alta de competencia',
    method: 'post',
    url: '/api/competencies',
    body: { competencyName: nextName('alta'), competencyType: 'technical' },
  }),
  showCompetency: (competency: Competency): GateRequest => ({
    label: 'detalle de competencia',
    method: 'get',
    url: `/api/competencies/${competency.competencyId}`,
  }),
  updateCompetency: (competency: Competency): GateRequest => ({
    label: 'edición de competencia',
    method: 'put',
    url: `/api/competencies/${competency.competencyId}`,
    body: { competencyName: nextName('edicion'), competencyType: 'transversal' },
  }),
  deleteCompetency: (competency: Competency): GateRequest => ({
    label: 'baja de competencia',
    method: 'delete',
    url: `/api/competencies/${competency.competencyId}`,
  }),
  storeLevel: (actor: TenantActor): GateRequest => ({
    label: 'alta de nivel',
    method: 'post',
    url: '/api/business-unit-competency-levels',
    body: {
      businessUnitId: actor.businessUnit.businessUnitId,
      businessUnitCompetencyLevelLabel: 'Nivel nuevo',
      businessUnitCompetencyLevelPosition: 5,
    },
  }),
  showLevel: (level: BusinessUnitCompetencyLevel): GateRequest => ({
    label: 'detalle de nivel',
    method: 'get',
    url: levelUrl(level),
  }),
  updateLevel: (actor: TenantActor, level: BusinessUnitCompetencyLevel, newLabel: string): GateRequest => ({
    label: 'edición de nivel',
    method: 'put',
    url: levelUrl(level),
    body: {
      businessUnitId: actor.businessUnit.businessUnitId,
      businessUnitCompetencyLevelLabel: newLabel,
      businessUnitCompetencyLevelPosition: level.businessUnitCompetencyLevelPosition,
    },
  }),
  deleteLevel: (level: BusinessUnitCompetencyLevel): GateRequest => ({
    label: 'baja de nivel',
    method: 'delete',
    url: levelUrl(level),
  }),
  storeDescriptor: (fixture: CompetencyFixture): GateRequest => ({
    label: 'alta de descriptor',
    method: 'post',
    url: '/api/competency-descriptors',
    body: {
      competencyId: fixture.competency.competencyId,
      businessUnitCompetencyLevelId: fixture.levels[2].businessUnitCompetencyLevelId,
      competencyDescriptorDescription: 'Descriptor nuevo',
    },
  }),
  showDescriptor: (descriptor: CompetencyDescriptor): GateRequest => ({
    label: 'detalle de descriptor',
    method: 'get',
    url: `/api/competency-descriptors/${descriptor.competencyDescriptorId}`,
  }),
  updateDescriptor: (descriptor: CompetencyDescriptor): GateRequest => ({
    label: 'edición de descriptor',
    method: 'put',
    url: `/api/competency-descriptors/${descriptor.competencyDescriptorId}`,
    body: {
      competencyId: descriptor.competencyId,
      businessUnitCompetencyLevelId: descriptor.businessUnitCompetencyLevelId,
      competencyDescriptorDescription: 'Descriptor editado',
    },
  }),
  deleteDescriptor: (descriptor: CompetencyDescriptor): GateRequest => ({
    label: 'baja de descriptor',
    method: 'delete',
    url: `/api/competency-descriptors/${descriptor.competencyDescriptorId}`,
  }),
  descriptorsByCompetency: (competency: Competency): GateRequest => ({
    label: 'descriptores por competencia',
    method: 'get',
    url: `/api/competency-descriptors/by-competency/${competency.competencyId}`,
  }),
  storeBracket: (descriptor: CompetencyDescriptor): GateRequest => ({
    label: 'alta de rango',
    method: 'post',
    url: '/api/competency-brackets',
    body: {
      competencyDescriptorId: descriptor.competencyDescriptorId,
      competencyBracketDescription: 'Rango nuevo',
      competencyBracketRangeMin: 11,
      competencyBracketRangeMax: 20,
      competencyBracketPosition: 2,
    },
  }),
  showBracket: (bracket: CompetencyBracket): GateRequest => ({
    label: 'detalle de rango',
    method: 'get',
    url: `/api/competency-brackets/${bracket.competencyBracketId}`,
  }),
  updateBracket: (bracket: CompetencyBracket): GateRequest => ({
    label: 'edición de rango',
    method: 'put',
    url: `/api/competency-brackets/${bracket.competencyBracketId}`,
    body: {
      competencyBracketDescription: 'Rango editado',
      competencyBracketRangeMin: 0,
      competencyBracketRangeMax: 10,
      competencyBracketPosition: 1,
    },
  }),
  deleteBracket: (bracket: CompetencyBracket): GateRequest => ({
    label: 'baja de rango',
    method: 'delete',
    url: `/api/competency-brackets/${bracket.competencyBracketId}`,
  }),
}

function send(client: ApiClient, actor: TenantActor, request: GateRequest) {
  const pending = client[request.method](request.url)
    .loginAs(actor.user)
    .headers(businessUnitHeaders(actor))
  return request.body ? pending.json(request.body) : pending
}

async function expectDenied(
  assert: Assert,
  client: ApiClient,
  actor: TenantActor,
  gateRequests: readonly GateRequest[]
): Promise<void> {
  for (const request of gateRequests) {
    const response = await send(client, actor, request)
    assert.equal(response.status(), 403, request.label)
    assert.equal(response.body()?.key, PERMISSION_GATE_ERROR_CODES.DENIED, request.label)
  }
}

async function expectStatus(
  assert: Assert,
  client: ApiClient,
  actor: TenantActor,
  request: GateRequest,
  status: number
): Promise<void> {
  const response = await send(client, actor, request)
  assert.equal(response.status(), status, `${request.label}: ${JSON.stringify(response.body())}`)
}

/**
 * La petición cruzó el gate, sin exigir el éxito del controller.
 *
 * Solo para alta y edición de nivel: cada caso siembra su propia tanda de cuatro
 * niveles sobre la MISMA empresa, así que a partir del segundo la empresa llega
 * al tope de cinco niveles y el controller responde 400 por una razón que nada
 * tiene que ver con permisos. Fijar aquí 201 y 200 haría que el caso dependiera
 * del orden de ejecución. Que la comparación de etiquetas funcione se prueba
 * aparte, en `business_unit_competency_level_label_uniqueness.spec.ts`.
 *
 * El cliente de pruebas lanza ante un 5xx en lugar de devolver la respuesta.
 * El gate niega siempre con 403 y `PERM.DENIED`, nunca con 5xx: si lo que
 * llega es ese error, la petición ya había cruzado el gate.
 */
async function expectPassesGate(
  assert: Assert,
  client: ApiClient,
  actor: TenantActor,
  request: GateRequest
): Promise<void> {
  try {
    const response = await send(client, actor, request)
    assert.notEqual(response.status(), 403, `${request.label}: ${JSON.stringify(response.body())}`)
    assert.notEqual(response.body()?.key, PERMISSION_GATE_ERROR_CODES.DENIED, request.label)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    assert.notInclude(message, PERMISSION_GATE_ERROR_CODES.DENIED, request.label)
    assert.include(message, '"type":"error"', `${request.label}: ${message}`)
  }
}

/** Descriptores y rangos cuelgan de los niveles de la empresa: se borran antes que ella. */
async function cleanupCompetencyActor(actor: TenantActor | null): Promise<void> {
  if (!actor) return
  const levels: { business_unit_competency_level_id: number }[] = await db
    .from('business_unit_competency_levels')
    .where('business_unit_id', actor.businessUnit.businessUnitId)
    .select('business_unit_competency_level_id')
  const levelIds = levels.map((row) => row.business_unit_competency_level_id)

  if (levelIds.length > 0) {
    const descriptors: { competency_descriptor_id: number }[] = await db
      .from('competency_descriptors')
      .whereIn('business_unit_competency_level_id', levelIds)
      .select('competency_descriptor_id')
    const descriptorIds = descriptors.map((row) => row.competency_descriptor_id)
    if (descriptorIds.length > 0) {
      await db.from('competency_brackets').whereIn('competency_descriptor_id', descriptorIds).delete()
      await db.from('competency_descriptors').whereIn('competency_descriptor_id', descriptorIds).delete()
    }
    await db
      .from('business_unit_competency_levels')
      .whereIn('business_unit_competency_level_id', levelIds)
      .delete()
  }
  await cleanupTenantActor(actor)
}

test.group('Competencias — permissionGate con exigencia encendida', (group) => {
  let actor: TenantActor | null = null

  group.setup(async () => {
    await assertModuleEnforced(MODULE)
  })

  group.teardown(async () => {
    const competencies: { competency_id: number }[] = await db
      .from('competencies')
      .where('competency_name', 'like', `${RUN_PREFIX}%`)
      .select('competency_id')
    const competencyIds = competencies.map((row) => row.competency_id)
    if (competencyIds.length > 0) {
      await db.from('competencies').whereIn('competency_id', competencyIds).delete()
    }
  })

  group.each.setup(async () => {
    actor = await createTenantActor('competencias-gate')
  })

  group.each.teardown(async () => {
    await cleanupCompetencyActor(actor)
    actor = null
  })

  test('sin concesiones: competencias, niveles, descriptores y rangos responden PERM.DENIED y no escriben', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, [])
    const fixture = await createFixture(tenant, 'sin-permiso')

    await expectDenied(assert, client, tenant, [
      requests.storeCompetency(),
      requests.showCompetency(fixture.competency),
      requests.updateCompetency(fixture.competency),
      requests.deleteCompetency(fixture.competency),
      requests.storeLevel(tenant),
      requests.showLevel(fixture.levels[0]),
      requests.updateLevel(tenant, fixture.levels[0], 'Nivel negado'),
      requests.deleteLevel(fixture.levels[3]),
      requests.storeDescriptor(fixture),
      requests.showDescriptor(fixture.descriptor),
      requests.updateDescriptor(fixture.descriptor),
      requests.deleteDescriptor(fixture.descriptor),
      requests.descriptorsByCompetency(fixture.competency),
      requests.storeBracket(fixture.descriptor),
      requests.showBracket(fixture.bracket),
      requests.updateBracket(fixture.bracket),
      requests.deleteBracket(fixture.bracket),
    ])

    const competency = await Competency.findOrFail(fixture.competency.competencyId)
    assert.equal(competency.competencyName, fixture.competency.competencyName)
    const level = await BusinessUnitCompetencyLevel.findOrFail(fixture.levels[0].businessUnitCompetencyLevelId)
    assert.equal(level.businessUnitCompetencyLevelLabel, 'Nivel 1')
  })

  test('sin concesiones: las listas que consumen otras pantallas siguen abiertas', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, [])
    const fixture = await createFixture(tenant, 'abiertas')

    for (const request of [
      { label: 'lista de competencias (Organigrama)', method: 'get', url: '/api/competencies?page=1&limit=10' },
      { label: 'lista de niveles (matriz y evaluaciones)', method: 'get', url: '/api/business-unit-competency-levels' },
      {
        label: 'rangos por descriptor (evaluación del empleado)',
        method: 'get',
        url: `/api/competency-brackets/by-descriptor/${fixture.descriptor.competencyDescriptorId}`,
      },
    ] as const satisfies readonly GateRequest[]) {
      await expectStatus(assert, client, tenant, request, 200)
    }
  })

  test('read abre los detalles y los descriptores por competencia, no las escrituras', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, ['read'])
    const fixture = await createFixture(tenant, 'lectura')

    for (const request of [
      requests.showCompetency(fixture.competency),
      requests.showLevel(fixture.levels[0]),
      requests.showDescriptor(fixture.descriptor),
      requests.descriptorsByCompetency(fixture.competency),
      requests.showBracket(fixture.bracket),
    ]) {
      await expectStatus(assert, client, tenant, request, 200)
    }

    await expectDenied(assert, client, tenant, [
      requests.storeCompetency(),
      requests.updateLevel(tenant, fixture.levels[0], 'Nivel lectura'),
      requests.storeDescriptor(fixture),
    ])
  })

  test('create da de alta competencias, niveles, descriptores y rangos; no edita ni borra', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, ['create'])
    const fixture = await createFixture(tenant, 'alta')

    await expectStatus(assert, client, tenant, requests.storeCompetency(), 201)
    await expectPassesGate(assert, client, tenant, requests.storeLevel(tenant))
    await expectStatus(assert, client, tenant, requests.storeDescriptor(fixture), 201)
    await expectStatus(assert, client, tenant, requests.storeBracket(fixture.descriptor), 201)

    await expectDenied(assert, client, tenant, [
      requests.showCompetency(fixture.competency),
      requests.updateCompetency(fixture.competency),
      requests.updateLevel(tenant, fixture.levels[0], 'Nivel solo alta'),
      requests.deleteLevel(fixture.levels[3]),
      requests.updateDescriptor(fixture.descriptor),
      requests.deleteBracket(fixture.bracket),
    ])
  })

  test('create o delete no editan niveles: el PUT exige update estricto', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, ['create', 'delete'])
    const fixture = await createFixture(tenant, 'nivel-estricto')

    await expectDenied(assert, client, tenant, [
      requests.updateLevel(tenant, fixture.levels[0], 'Nivel renombrado'),
    ])

    const level = await BusinessUnitCompetencyLevel.findOrFail(fixture.levels[0].businessUnitCompetencyLevelId)
    assert.equal(level.businessUnitCompetencyLevelLabel, 'Nivel 1')
  })

  test('update edita todo y da de alta descriptores y rangos; no crea competencias ni niveles ni los borra', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, ['update'])
    const fixture = await createFixture(tenant, 'edicion')
    const spareDescriptor = await CompetencyDescriptor.create({
      competencyId: fixture.competency.competencyId,
      businessUnitCompetencyLevelId: fixture.levels[1].businessUnitCompetencyLevelId,
      competencyDescriptorDescription: 'Descriptor para baja',
    })

    await expectStatus(assert, client, tenant, requests.updateCompetency(fixture.competency), 201)
    await expectPassesGate(assert, client, tenant, requests.updateLevel(tenant, fixture.levels[0], 'Nivel editado'))
    await expectStatus(assert, client, tenant, requests.updateDescriptor(fixture.descriptor), 200)
    await expectStatus(assert, client, tenant, requests.deleteDescriptor(spareDescriptor), 200)
    await expectStatus(assert, client, tenant, requests.storeDescriptor(fixture), 201)
    await expectStatus(assert, client, tenant, requests.storeBracket(fixture.descriptor), 201)
    await expectStatus(assert, client, tenant, requests.updateBracket(fixture.bracket), 200)
    await expectStatus(assert, client, tenant, requests.deleteBracket(fixture.bracket), 200)

    await expectDenied(assert, client, tenant, [
      requests.storeCompetency(),
      requests.storeLevel(tenant),
      requests.deleteCompetency(fixture.competency),
      requests.deleteLevel(fixture.levels[3]),
    ])
  })

  test('delete borra competencias y niveles; no descriptores, rangos ni la edición de niveles', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, ['delete'])
    const fixture = await createFixture(tenant, 'baja')
    const unusedCompetency = await createCompetency('baja-sin-descriptores')

    await expectDenied(assert, client, tenant, [
      requests.updateLevel(tenant, fixture.levels[0], 'Nivel solo baja'),
      requests.deleteDescriptor(fixture.descriptor),
      requests.deleteBracket(fixture.bracket),
    ])

    await expectStatus(assert, client, tenant, requests.deleteCompetency(unusedCompetency), 201)
    await expectStatus(assert, client, tenant, requests.deleteLevel(fixture.levels[3]), 200)
  })

  test('owner y root pasan el gate sin concesiones (bypass standard)', async ({ client, assert }) => {
    for (const slug of ['owner', 'root'] as const) {
      const bypass = await createBypassActor(slug, `competencias-${slug}`)
      try {
        const fixture = await createFixture(bypass, slug)

        await expectStatus(assert, client, bypass, requests.storeCompetency(), 201)
        await expectStatus(assert, client, bypass, requests.showCompetency(fixture.competency), 200)
        await expectPassesGate(assert, client, bypass, requests.updateLevel(bypass, fixture.levels[0], `Nivel ${slug}`))
      } finally {
        await cleanupCompetencyActor(bypass)
      }
    }
  })
})
