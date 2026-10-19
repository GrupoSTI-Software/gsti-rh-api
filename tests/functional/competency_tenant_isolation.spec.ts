import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import type { ApiResponse } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import Competency from '#models/competency'
import CompetencyDescriptor from '#models/competency_descriptor'
import CompetencyBracket from '#models/competency_bracket'
import BusinessUnitCompetencyLevel from '#models/business_unit_competency_level'
import SystemModule from '#models/system_module'
import { TenantContext } from '#utils/tenant_context'
import {
  businessUnitHeaders,
  cleanupTenantActor,
  createTenantActor,
  grantModulePermissions,
  required,
  uniqueTestName,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * VLRH-H1792026427127 — separar el catálogo de competencias por empresa.
 *
 * Competencias, descriptores y rangos eran globales: cualquier cliente veía
 * (y podía referenciar) las competencias de otro. Ahora cuelgan de
 * `business_unit_id` (raíz desde `TenantContext`, hijos heredan del padre) y
 * las rutas exigen `businessScope()`.
 *
 * El módulo se enciende (`systemModuleActive: 1`) en VLRH-H1792032453526,
 * junto con la validación de pertenencia de este archivo (CA-7, CA-8). El
 * gate exige `system_module_active = 1` para resolver permisos, así que el
 * spec lo fuerza él mismo y restaura el valor que encontró al terminar —
 * igual que `competencies_permission_gate.spec.ts` — para no depender del
 * orden de la suite ni de que la siembra ya corrió.
 */

const MODULE = 'competencies'
const GRANTS = ['create', 'read', 'update', 'delete'] as const

interface Fixture {
  competency: Competency
  level: BusinessUnitCompetencyLevel
  descriptor: CompetencyDescriptor
  bracket: CompetencyBracket
}

async function createFixtureFor(actor: TenantActor, label: string): Promise<Fixture> {
  return TenantContext.run([actor.businessUnit.businessUnitId], async () => {
    const competency = await Competency.create({
      competencyName: uniqueTestName(`TEST-CMP-${label}`).slice(0, 255),
      competencyType: 'technical',
    })
    const level = await BusinessUnitCompetencyLevel.create({
      businessUnitId: actor.businessUnit.businessUnitId,
      businessUnitCompetencyLevelLabel: `Nivel aislamiento ${label}`,
      businessUnitCompetencyLevelPosition: 1,
    })
    const descriptor = await CompetencyDescriptor.create({
      competencyId: competency.competencyId,
      businessUnitCompetencyLevelId: level.businessUnitCompetencyLevelId,
      competencyDescriptorDescription: `Descriptor aislamiento ${label}`,
    })
    const bracket = await CompetencyBracket.create({
      competencyDescriptorId: descriptor.competencyDescriptorId,
      competencyBracketDescription: `Rango aislamiento ${label}`,
      competencyBracketRangeMin: 0,
      competencyBracketRangeMax: 10,
      competencyBracketPosition: 1,
    })
    return { competency, level, descriptor, bracket }
  })
}

async function cleanupFixtures(actor: TenantActor | null): Promise<void> {
  if (!actor) return
  const businessUnitId = actor.businessUnit.businessUnitId
  await db.from('competency_brackets').where('business_unit_id', businessUnitId).delete()
  await db.from('competency_descriptors').where('business_unit_id', businessUnitId).delete()
  await db.from('competencies').where('business_unit_id', businessUnitId).delete()
  await db
    .from('business_unit_competency_levels')
    .where('business_unit_id', businessUnitId)
    .delete()
}

test.group('Competencias — aislamiento por tenant', (group) => {
  let competenciesModule: SystemModule | null = null
  let previousActive = 0
  let previousEnforcement = true
  let companyA: TenantActor | null = null
  let companyB: TenantActor | null = null
  let fixtureA: Fixture | null = null
  let fixtureB: Fixture | null = null

  group.setup(async () => {
    competenciesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', MODULE)
      .firstOrFail()
    previousActive = competenciesModule.systemModuleActive
    previousEnforcement = competenciesModule.systemModulePermissionEnforcementActive
    competenciesModule.systemModuleActive = 1
    competenciesModule.systemModulePermissionEnforcementActive = true
    await competenciesModule.save()

    companyA = await createTenantActor('comp-aislamiento-a')
    companyB = await createTenantActor('comp-aislamiento-b')
    await grantModulePermissions(companyA, MODULE, GRANTS)
    await grantModulePermissions(companyB, MODULE, GRANTS)
    fixtureA = await createFixtureFor(companyA, 'A')
    fixtureB = await createFixtureFor(companyB, 'B')
  })

  group.teardown(async () => {
    await cleanupFixtures(companyA)
    await cleanupFixtures(companyB)
    await cleanupTenantActor(companyA)
    await cleanupTenantActor(companyB)
    if (competenciesModule) {
      competenciesModule.systemModuleActive = previousActive
      competenciesModule.systemModulePermissionEnforcementActive = previousEnforcement
      await competenciesModule.save()
    }
  })

  test('alta de competencia hereda business_unit_id de la unidad activa', async ({ assert }) => {
    const owner = required(companyB, 'la empresa B')
    const fixture = required(fixtureB, 'la fixture de B')
    const row = await TenantContext.runUnscoped(
      () => Competency.findOrFail(fixture.competency.competencyId),
      'verificación fixture de aislamiento (spec)'
    )
    assert.equal(row.businessUnitId, owner.businessUnit.businessUnitId)
  })

  test('alta de descriptor hereda business_unit_id de la competencia padre', async ({
    assert,
  }) => {
    const owner = required(companyB, 'la empresa B')
    const fixture = required(fixtureB, 'la fixture de B')
    const row = await TenantContext.runUnscoped(
      () => CompetencyDescriptor.findOrFail(fixture.descriptor.competencyDescriptorId),
      'verificación fixture de aislamiento (spec)'
    )
    assert.equal(row.businessUnitId, owner.businessUnit.businessUnitId)
  })

  test('alta de rango hereda business_unit_id del descriptor padre', async ({ assert }) => {
    const owner = required(companyB, 'la empresa B')
    const fixture = required(fixtureB, 'la fixture de B')
    const row = await TenantContext.runUnscoped(
      () => CompetencyBracket.findOrFail(fixture.bracket.competencyBracketId),
      'verificación fixture de aislamiento (spec)'
    )
    assert.equal(row.businessUnitId, owner.businessUnit.businessUnitId)
  })

  test('usuario de A ve su competencia en el listado y no ve la de B', async ({
    client,
    assert,
  }) => {
    const actor = required(companyA, 'la empresa A')
    const ownFixture = required(fixtureA, 'la fixture de A')
    const otherFixture = required(fixtureB, 'la fixture de B')

    const response = await client
      .get('/api/competencies?page=1&limit=200')
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))

    response.assertStatus(200)
    const rows: { competencyId: number }[] = response.body().data?.competencies?.data ?? []
    const ids = rows.map((row) => row.competencyId)
    assert.include(ids, ownFixture.competency.competencyId)
    assert.notInclude(ids, otherFixture.competency.competencyId)
  })

  /**
   * VLRH-H1792032453526 (CA-8): cuerpo exacto del 404 uniforme — mismo para
   * ajeno, plantilla, dado de baja e inexistente; sin eco del id (`data: {}`).
   */
  function assertUniform404(assert: Assert, response: ApiResponse, code: string): void {
    response.assertStatus(404)
    const body = response.body()
    assert.equal(body.key, 'recurso-no-encontrado')
    assert.equal(body.code, code)
    assert.equal(body.type, 'warning')
    assert.deepEqual(body.data, {})
  }

  test('usuario de B recibe 404 uniforme al pedir la competencia de A por id directo', async ({
    client,
    assert,
  }) => {
    const actor = required(companyB, 'la empresa B')
    const otherFixture = required(fixtureA, 'la fixture de A')

    const response = await client
      .get(`/api/competencies/${otherFixture.competency.competencyId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))

    assertUniform404(assert, response, 'CMPT.NF.001')
  })

  test('usuario de B recibe 404 uniforme al pedir el descriptor de A por id directo', async ({
    client,
    assert,
  }) => {
    const actor = required(companyB, 'la empresa B')
    const otherFixture = required(fixtureA, 'la fixture de A')

    const response = await client
      .get(`/api/competency-descriptors/${otherFixture.descriptor.competencyDescriptorId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))

    assertUniform404(assert, response, 'CMPT.NF.002')
  })

  test('usuario de B recibe 404 uniforme al pedir el rango de A por id directo', async ({
    client,
    assert,
  }) => {
    const actor = required(companyB, 'la empresa B')
    const otherFixture = required(fixtureA, 'la fixture de A')

    const response = await client
      .get(`/api/competency-brackets/${otherFixture.bracket.competencyBracketId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))

    assertUniform404(assert, response, 'CMPT.NF.003')
  })

  test('PUT de competencia, descriptor y rango ajenos responde 404 uniforme y nada cambia', async ({
    client,
    assert,
  }) => {
    const actor = required(companyB, 'la empresa B')
    const otherFixture = required(fixtureA, 'la fixture de A')

    const competencyResponse = await client
      .put(`/api/competencies/${otherFixture.competency.competencyId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json({ competencyName: 'hackeado', competencyType: 'transversal' })
    assertUniform404(assert, competencyResponse, 'CMPT.NF.001')

    const descriptorResponse = await client
      .put(`/api/competency-descriptors/${otherFixture.descriptor.competencyDescriptorId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json({
        competencyId: otherFixture.competency.competencyId,
        businessUnitCompetencyLevelId: otherFixture.level.businessUnitCompetencyLevelId,
        competencyDescriptorDescription: 'hackeado',
      })
    assertUniform404(assert, descriptorResponse, 'CMPT.NF.002')

    const bracketResponse = await client
      .put(`/api/competency-brackets/${otherFixture.bracket.competencyBracketId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json({
        competencyBracketDescription: 'hackeado',
        competencyBracketRangeMin: 0,
        competencyBracketRangeMax: 1,
        competencyBracketPosition: 1,
      })
    assertUniform404(assert, bracketResponse, 'CMPT.NF.003')

    const [competency, descriptor, bracket] = await TenantContext.runUnscoped(
      () =>
        Promise.all([
          Competency.findOrFail(otherFixture.competency.competencyId),
          CompetencyDescriptor.findOrFail(otherFixture.descriptor.competencyDescriptorId),
          CompetencyBracket.findOrFail(otherFixture.bracket.competencyBracketId),
        ]),
      'verificación post-PUT ajeno (spec)'
    )
    assert.equal(competency.competencyName, otherFixture.competency.competencyName)
    assert.equal(
      descriptor.competencyDescriptorDescription,
      otherFixture.descriptor.competencyDescriptorDescription
    )
    assert.equal(
      bracket.competencyBracketDescription,
      otherFixture.bracket.competencyBracketDescription
    )
  })

  test('DELETE de competencia ajena responde 404 uniforme y no la borra', async ({
    client,
    assert,
  }) => {
    const actor = required(companyA, 'la empresa A')
    const otherFixture = required(fixtureB, 'la fixture de B')

    const response = await client
      .delete(`/api/competencies/${otherFixture.competency.competencyId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))

    assertUniform404(assert, response, 'CMPT.NF.001')

    const stillAlive = await TenantContext.runUnscoped(
      () =>
        Competency.query()
          .where('competencyId', otherFixture.competency.competencyId)
          .whereNull('competency_deleted_at')
          .first(),
      'verificación post-delete (spec)'
    )
    assert.isNotNull(stillAlive)
  })

  /**
   * VLRH-H1792032453526 (CA-7, regla 3 propia): pedir las descripciones de
   * una competencia ajena, o los rangos de una descripción ajena, responde
   * 404 uniforme — no 200 con lista vacía.
   */
  test('by-competency con competencia ajena o inexistente responde 404 uniforme; con la propia, 200', async ({
    client,
    assert,
  }) => {
    const actor = required(companyB, 'la empresa B')
    const ownFixture = required(fixtureB, 'la fixture de B')
    const otherFixture = required(fixtureA, 'la fixture de A')

    const foreign = await client
      .get(`/api/competency-descriptors/by-competency/${otherFixture.competency.competencyId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
    assertUniform404(assert, foreign, 'CMPT.NF.001')
    assert.notInclude(JSON.stringify(foreign.body()), String(otherFixture.descriptor.competencyDescriptorId))

    const nonexistent = await client
      .get('/api/competency-descriptors/by-competency/999999999')
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
    assertUniform404(assert, nonexistent, 'CMPT.NF.001')

    const own = await client
      .get(`/api/competency-descriptors/by-competency/${ownFixture.competency.competencyId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
    own.assertStatus(200)
  })

  test('by-descriptor con descriptor ajeno o inexistente responde 404 uniforme; con el propio, 200', async ({
    client,
    assert,
  }) => {
    const actor = required(companyB, 'la empresa B')
    const ownFixture = required(fixtureB, 'la fixture de B')
    const otherFixture = required(fixtureA, 'la fixture de A')

    const foreign = await client
      .get(`/api/competency-brackets/by-descriptor/${otherFixture.descriptor.competencyDescriptorId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
    assertUniform404(assert, foreign, 'CMPT.NF.002')
    assert.notInclude(JSON.stringify(foreign.body()), String(otherFixture.bracket.competencyBracketId))

    const nonexistent = await client
      .get('/api/competency-brackets/by-descriptor/999999999')
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
    assertUniform404(assert, nonexistent, 'CMPT.NF.002')

    const own = await client
      .get(`/api/competency-brackets/by-descriptor/${ownFixture.descriptor.competencyDescriptorId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
    own.assertStatus(200)
  })
})
