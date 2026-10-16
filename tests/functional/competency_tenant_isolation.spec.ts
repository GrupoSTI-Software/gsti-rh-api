import { test } from '@japa/runner'
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
 * El módulo sigue apagado por alcance de lanzamiento (`systemModuleActive: 0`
 * en el catálogo; se enciende en VLRH-H1792032453526). El gate exige
 * `system_module_active = 1` para resolver permisos, así que el spec lo
 * enciende él mismo y lo restaura al terminar — igual que
 * `competencies_permission_gate.spec.ts`.
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

  test('usuario de B recibe 404 al pedir la competencia de A por id directo', async ({
    client,
  }) => {
    const actor = required(companyB, 'la empresa B')
    const otherFixture = required(fixtureA, 'la fixture de A')

    const response = await client
      .get(`/api/competencies/${otherFixture.competency.competencyId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))

    response.assertStatus(404)
  })

  test('usuario de B recibe 404 al pedir el descriptor de A por id directo', async ({
    client,
  }) => {
    const actor = required(companyB, 'la empresa B')
    const otherFixture = required(fixtureA, 'la fixture de A')

    const response = await client
      .get(`/api/competency-descriptors/${otherFixture.descriptor.competencyDescriptorId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))

    response.assertStatus(404)
  })

  test('usuario de B recibe 404 al pedir el rango de A por id directo', async ({ client }) => {
    const actor = required(companyB, 'la empresa B')
    const otherFixture = required(fixtureA, 'la fixture de A')

    const response = await client
      .get(`/api/competency-brackets/${otherFixture.bracket.competencyBracketId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))

    response.assertStatus(404)
  })

  test('DELETE de competencia ajena responde 404 y no la borra', async ({ client, assert }) => {
    const actor = required(companyA, 'la empresa A')
    const otherFixture = required(fixtureB, 'la fixture de B')

    const response = await client
      .delete(`/api/competencies/${otherFixture.competency.competencyId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))

    response.assertStatus(404)

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
})
