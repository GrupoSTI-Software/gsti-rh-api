import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import AssessmentTemplate from '#models/assessment_template'
import AssessmentTemplateDimension from '#models/assessment_template_dimension'
import PositionAssessmentProfile from '#models/position_assessment_profile'
import type Position from '#models/position'
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
import { cleanupOrgChartFixtures, createPositionFixture } from '#tests/helpers/org_chart_fixtures'

/**
 * Parámetros de evaluación con la exigencia encendida: plantillas, dimensiones,
 * reorden y perfiles por puesto piden su permiso de `assessment-templates`.
 * Dimensiones, reorden y perfiles por puesto piden `update` porque editarlos es
 * editar la plantilla. La lista de perfiles por puesto queda abierta: la lee el
 * formulario de assessments del empleado.
 *
 * Las plantillas son globales (sin unidad de negocio): se identifican por un
 * prefijo de nombre propio de la corrida. Puestos y perfiles viven en la
 * empresa del actor y se borran con él.
 */

const MODULE = 'assessment-templates'
const RUN_PREFIX = `Plantilla gate ${Date.now()}-${Math.floor(Math.random() * 100_000)}`

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete'

interface GateRequest {
  label: string
  method: HttpMethod
  url: string
  body?: Record<string, unknown>
}

let nameCounter = 0
const nextName = (label: string) => `${RUN_PREFIX} ${label} ${++nameCounter}`

interface TemplateFixture {
  template: AssessmentTemplate
  /** [0] con perfil por puesto, [1] libre para el alta de perfil, [2] libre para la baja. */
  dimensions: [AssessmentTemplateDimension, AssessmentTemplateDimension, AssessmentTemplateDimension]
  position: Position
  profile: PositionAssessmentProfile
}

async function createDimension(
  template: AssessmentTemplate,
  acronym: string,
  orderIndex: number
): Promise<AssessmentTemplateDimension> {
  return AssessmentTemplateDimension.create({
    assessmentTemplateId: template.assessmentTemplateId,
    assessmentTemplateDimensionName: `Dimensión ${acronym}`,
    assessmentTemplateDimensionAcronym: acronym,
    assessmentTemplateDimensionDataType: 'numeric',
    assessmentTemplateDimensionOrderIndex: orderIndex,
  })
}

async function createFixture(actor: TenantActor, label: string): Promise<TemplateFixture> {
  const template = await AssessmentTemplate.create({
    assessmentTemplateName: nextName(label),
    assessmentTemplateDescription: null,
  })
  const first = await createDimension(template, 'GA', 0)
  const second = await createDimension(template, 'GB', 1)
  const third = await createDimension(template, 'GC', 2)
  const position = await createPositionFixture(actor.businessUnit.businessUnitId, `Puesto ${label}`)
  const profile = await PositionAssessmentProfile.create({
    positionId: position.positionId,
    assessmentTemplateDimensionId: first.assessmentTemplateDimensionId,
    positionAssessmentProfileMinimumValue: 10,
    positionAssessmentProfileMaximumValue: 50,
  })
  return { template, dimensions: [first, second, third], position, profile }
}

const templateUrl = (fixture: TemplateFixture) =>
  `/api/assessment-templates/${fixture.template.assessmentTemplateId}`

const requests = {
  indexTemplates: (): GateRequest => ({
    label: 'lista de plantillas',
    method: 'get',
    url: '/api/assessment-templates?page=1&limit=10',
  }),
  storeTemplate: (): GateRequest => ({
    label: 'alta de plantilla',
    method: 'post',
    url: '/api/assessment-templates',
    body: { assessmentTemplateName: nextName('alta') },
  }),
  showTemplate: (fixture: TemplateFixture): GateRequest => ({
    label: 'detalle de plantilla',
    method: 'get',
    url: templateUrl(fixture),
  }),
  updateTemplate: (fixture: TemplateFixture): GateRequest => ({
    label: 'edición de plantilla',
    method: 'put',
    url: templateUrl(fixture),
    // Se mandan las dimensiones vigentes: la edición sincroniza las del body.
    body: {
      assessmentTemplateName: nextName('edicion'),
      dimensions: fixture.dimensions.map((dimension) => ({
        assessmentTemplateDimensionId: dimension.assessmentTemplateDimensionId,
        assessmentTemplateDimensionName: dimension.assessmentTemplateDimensionName,
        assessmentTemplateDimensionAcronym: dimension.assessmentTemplateDimensionAcronym,
      })),
    },
  }),
  reorderDimensions: (fixture: TemplateFixture): GateRequest => ({
    label: 'reorden de dimensiones',
    method: 'patch',
    url: `${templateUrl(fixture)}/dimensions/reorder`,
    body: {
      dimensions: [
        { dimensionId: fixture.dimensions[2].assessmentTemplateDimensionId, orderIndex: 0 },
        { dimensionId: fixture.dimensions[0].assessmentTemplateDimensionId, orderIndex: 1 },
        { dimensionId: fixture.dimensions[1].assessmentTemplateDimensionId, orderIndex: 2 },
      ],
    },
  }),
  deleteTemplate: (fixture: TemplateFixture): GateRequest => ({
    label: 'baja de plantilla',
    method: 'delete',
    url: templateUrl(fixture),
  }),
  indexDimensions: (fixture: TemplateFixture): GateRequest => ({
    label: 'lista de dimensiones',
    method: 'get',
    url: `/api/assessment-template-dimensions?assessmentTemplateId=${fixture.template.assessmentTemplateId}&page=1&limit=10`,
  }),
  storeDimension: (fixture: TemplateFixture): GateRequest => ({
    label: 'alta de dimensión',
    method: 'post',
    url: '/api/assessment-template-dimensions',
    body: {
      assessmentTemplateId: fixture.template.assessmentTemplateId,
      assessmentTemplateDimensionName: 'Dimensión nueva',
      assessmentTemplateDimensionAcronym: 'GN',
    },
  }),
  showDimension: (fixture: TemplateFixture): GateRequest => ({
    label: 'detalle de dimensión',
    method: 'get',
    url: `/api/assessment-template-dimensions/${fixture.dimensions[0].assessmentTemplateDimensionId}`,
  }),
  updateDimension: (fixture: TemplateFixture): GateRequest => ({
    label: 'edición de dimensión',
    method: 'put',
    url: `/api/assessment-template-dimensions/${fixture.dimensions[0].assessmentTemplateDimensionId}`,
    body: {
      assessmentTemplateDimensionName: 'Dimensión editada',
      assessmentTemplateDimensionAcronym: 'GE',
    },
  }),
  deleteDimension: (fixture: TemplateFixture): GateRequest => ({
    label: 'baja de dimensión',
    method: 'delete',
    url: `/api/assessment-template-dimensions/${fixture.dimensions[2].assessmentTemplateDimensionId}`,
  }),
  storeProfile: (fixture: TemplateFixture): GateRequest => ({
    label: 'alta de perfil por puesto',
    method: 'post',
    url: '/api/position-assessment-profiles',
    body: {
      positionId: fixture.position.positionId,
      assessmentTemplateDimensionId: fixture.dimensions[1].assessmentTemplateDimensionId,
      positionAssessmentProfileMinimumValue: 20,
      positionAssessmentProfileMaximumValue: 70,
    },
  }),
  showProfile: (fixture: TemplateFixture): GateRequest => ({
    label: 'detalle de perfil por puesto',
    method: 'get',
    url: `/api/position-assessment-profiles/${fixture.profile.positionAssessmentProfileId}`,
  }),
  updateProfile: (fixture: TemplateFixture): GateRequest => ({
    label: 'edición de perfil por puesto',
    method: 'put',
    url: `/api/position-assessment-profiles/${fixture.profile.positionAssessmentProfileId}`,
    body: {
      positionAssessmentProfileMinimumValue: 25,
      positionAssessmentProfileMaximumValue: 75,
    },
  }),
  deleteProfile: (fixture: TemplateFixture): GateRequest => ({
    label: 'baja de perfil por puesto',
    method: 'delete',
    url: `/api/position-assessment-profiles/${fixture.profile.positionAssessmentProfileId}`,
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

/** Perfiles y puestos de la empresa del actor impiden borrarla: se van antes que él. */
async function cleanupTemplateActor(actor: TenantActor | null): Promise<void> {
  if (!actor) return
  const businessUnitId = actor.businessUnit.businessUnitId
  const positions: { position_id: number }[] = await db
    .from('positions')
    .where('business_unit_id', businessUnitId)
    .select('position_id')
  const positionIds = positions.map((row) => row.position_id)
  if (positionIds.length > 0) {
    await db.from('position_assessment_profiles').whereIn('position_id', positionIds).delete()
  }
  await cleanupOrgChartFixtures(businessUnitId)
  await cleanupTenantActor(actor)
}

test.group('Parámetros de evaluación — permissionGate con exigencia encendida', (group) => {
  let actor: TenantActor | null = null

  group.setup(async () => {
    await assertModuleEnforced(MODULE)
  })

  group.teardown(async () => {
    const templates: { assessment_template_id: number }[] = await db
      .from('assessment_templates')
      .where('assessment_template_name', 'like', `${RUN_PREFIX}%`)
      .select('assessment_template_id')
    const templateIds = templates.map((row) => row.assessment_template_id)
    if (templateIds.length === 0) return

    const dimensions: { assessment_template_dimension_id: number }[] = await db
      .from('assessment_template_dimensions')
      .whereIn('assessment_template_id', templateIds)
      .select('assessment_template_dimension_id')
    const dimensionIds = dimensions.map((row) => row.assessment_template_dimension_id)
    if (dimensionIds.length > 0) {
      await db
        .from('position_assessment_profiles')
        .whereIn('assessment_template_dimension_id', dimensionIds)
        .delete()
    }
    await db.from('assessment_template_dimensions').whereIn('assessment_template_id', templateIds).delete()
    await db.from('assessment_templates').whereIn('assessment_template_id', templateIds).delete()
  })

  group.each.setup(async () => {
    actor = await createTenantActor('plantillas-gate')
  })

  group.each.teardown(async () => {
    await cleanupTemplateActor(actor)
    actor = null
  })

  test('sin concesiones: plantillas, dimensiones, reorden y perfiles por puesto responden PERM.DENIED y no escriben', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, [])
    const fixture = await createFixture(tenant, 'sin-permiso')

    await expectDenied(assert, client, tenant, [
      requests.indexTemplates(),
      requests.storeTemplate(),
      requests.showTemplate(fixture),
      requests.updateTemplate(fixture),
      requests.reorderDimensions(fixture),
      requests.deleteTemplate(fixture),
      requests.indexDimensions(fixture),
      requests.storeDimension(fixture),
      requests.showDimension(fixture),
      requests.updateDimension(fixture),
      requests.deleteDimension(fixture),
      requests.storeProfile(fixture),
      requests.showProfile(fixture),
      requests.updateProfile(fixture),
      requests.deleteProfile(fixture),
    ])

    const template = await AssessmentTemplate.findOrFail(fixture.template.assessmentTemplateId)
    assert.equal(template.assessmentTemplateName, fixture.template.assessmentTemplateName)
    const dimension = await AssessmentTemplateDimension.findOrFail(
      fixture.dimensions[2].assessmentTemplateDimensionId
    )
    assert.equal(dimension.assessmentTemplateDimensionOrderIndex, 2)
    const profile = await PositionAssessmentProfile.findOrFail(fixture.profile.positionAssessmentProfileId)
    assert.equal(Number(profile.positionAssessmentProfileMinimumValue), 10)
  })

  test('sin concesiones: la lista de perfiles por puesto sigue abierta para assessments del empleado', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, [])

    await expectStatus(
      assert,
      client,
      tenant,
      { label: 'lista de perfiles por puesto', method: 'get', url: '/api/position-assessment-profiles?page=1&limit=10' },
      200
    )
  })

  test('read abre las lecturas de plantillas, dimensiones y perfiles, no las escrituras', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, ['read'])
    const fixture = await createFixture(tenant, 'lectura')

    for (const request of [
      requests.indexTemplates(),
      requests.showTemplate(fixture),
      requests.indexDimensions(fixture),
      requests.showDimension(fixture),
      requests.showProfile(fixture),
    ]) {
      await expectStatus(assert, client, tenant, request, 200)
    }

    await expectDenied(assert, client, tenant, [
      requests.storeTemplate(),
      requests.updateTemplate(fixture),
      requests.reorderDimensions(fixture),
      requests.deleteTemplate(fixture),
      requests.storeDimension(fixture),
      requests.storeProfile(fixture),
    ])
  })

  test('create abre el alta de plantilla y no la edición, las dimensiones ni la baja', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, ['create'])
    const fixture = await createFixture(tenant, 'alta')

    await expectStatus(assert, client, tenant, requests.storeTemplate(), 201)

    await expectDenied(assert, client, tenant, [
      requests.indexTemplates(),
      requests.updateTemplate(fixture),
      requests.storeDimension(fixture),
      requests.storeProfile(fixture),
      requests.deleteTemplate(fixture),
    ])
  })

  test('update abre edición, reorden, dimensiones y perfiles por puesto; no el alta ni la baja de plantilla', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, ['update'])
    const fixture = await createFixture(tenant, 'edicion')

    await expectStatus(assert, client, tenant, requests.reorderDimensions(fixture), 200)
    await expectStatus(assert, client, tenant, requests.updateTemplate(fixture), 201)
    await expectStatus(assert, client, tenant, requests.storeDimension(fixture), 201)
    await expectStatus(assert, client, tenant, requests.updateDimension(fixture), 201)
    await expectStatus(assert, client, tenant, requests.deleteDimension(fixture), 201)
    await expectStatus(assert, client, tenant, requests.storeProfile(fixture), 201)
    await expectStatus(assert, client, tenant, requests.updateProfile(fixture), 201)
    await expectStatus(assert, client, tenant, requests.deleteProfile(fixture), 201)

    await expectDenied(assert, client, tenant, [
      requests.indexTemplates(),
      requests.storeTemplate(),
      requests.deleteTemplate(fixture),
    ])
  })

  test('delete abre la baja de plantilla y no la de dimensiones ni perfiles', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, ['delete'])
    const fixture = await createFixture(tenant, 'baja')

    await expectDenied(assert, client, tenant, [
      requests.storeTemplate(),
      requests.updateTemplate(fixture),
      requests.deleteDimension(fixture),
      requests.deleteProfile(fixture),
    ])

    await expectStatus(assert, client, tenant, requests.deleteTemplate(fixture), 201)
  })

  test('owner y root pasan el gate sin concesiones (bypass standard)', async ({ client, assert }) => {
    for (const slug of ['owner', 'root'] as const) {
      const bypass = await createBypassActor(slug, `plantillas-${slug}`)
      try {
        const fixture = await createFixture(bypass, slug)

        await expectStatus(assert, client, bypass, requests.indexTemplates(), 200)
        await expectStatus(assert, client, bypass, requests.storeTemplate(), 201)
        await expectStatus(assert, client, bypass, requests.storeProfile(fixture), 201)
      } finally {
        await cleanupTemplateActor(bypass)
      }
    }
  })
})
