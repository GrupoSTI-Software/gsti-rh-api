import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import type { ApiResponse } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import Competency from '#models/competency'
import BusinessUnitCompetencyLevel from '#models/business_unit_competency_level'
import Position from '#models/position'
import PositionBusinessUnitCompetencyLevel from '#models/position_business_unit_competency_level'
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
import { createPositionFixture, cleanupOrgChartFixtures } from '#tests/helpers/org_chart_fixtures'

/**
 * VLRH-H1792032453526 (reglas 1 y 3 propias) — el nivel por puesto no
 * verificaba que puesto, competencia y nivel de empresa fueran de la unidad
 * en contexto. Un `positionId` ajeno reventaba `resolveParentBusinessUnitId`
 * en `@beforeCreate` (500); ahora `findOutOfScopeReference` corta antes, con
 * el 404 uniforme del dominio (CA-1 a CA-4, CA-10, CA-14).
 */

const MODULE = 'organization-chart'
const GRANTS = ['create', 'read', 'update', 'delete'] as const

interface Fixture {
  position: Position
  competency: Competency
  level: BusinessUnitCompetencyLevel
}

async function createFixtureFor(actor: TenantActor, label: string): Promise<Fixture> {
  const businessUnitId = actor.businessUnit.businessUnitId
  return TenantContext.run([businessUnitId], async () => {
    const position = await createPositionFixture(businessUnitId, `Puesto PBCL ${label}`)
    const competency = await Competency.create({
      competencyName: uniqueTestName(`PBCL-CMP-${label}`).slice(0, 255),
      competencyType: 'technical',
    })
    const level = await BusinessUnitCompetencyLevel.create({
      businessUnitId,
      businessUnitCompetencyLevelLabel: `Nivel PBCL ${label}`,
      businessUnitCompetencyLevelPosition: 1,
    })
    return { position, competency, level }
  })
}

async function cleanupFixtures(actor: TenantActor | null): Promise<void> {
  if (!actor) return
  const businessUnitId = actor.businessUnit.businessUnitId
  await db
    .from('position_business_unit_competency_levels')
    .where('business_unit_id', businessUnitId)
    .delete()
  await db.from('competencies').where('business_unit_id', businessUnitId).delete()
  await db
    .from('business_unit_competency_levels')
    .where('business_unit_id', businessUnitId)
    .delete()
  await cleanupOrgChartFixtures(businessUnitId)
}

function assertUniform404(assert: Assert, response: ApiResponse, code: string): void {
  response.assertStatus(404)
  const body = response.body()
  assert.equal(body.key, 'recurso-no-encontrado')
  assert.equal(body.code, code)
  assert.deepEqual(body.data, {})
}

test.group('Nivel por puesto — pertenencia de referencias cruzadas', (group) => {
  let companyA: TenantActor | null = null
  let companyB: TenantActor | null = null
  let fixtureA: Fixture | null = null
  let fixtureB: Fixture | null = null

  group.setup(async () => {
    companyA = await createTenantActor('pbcl-aislamiento-a')
    companyB = await createTenantActor('pbcl-aislamiento-b')
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
  })

  test('CA-1: alta con puesto, competencia y nivel propios responde 201', async ({
    client,
    assert,
  }) => {
    const actor = required(companyA, 'la empresa A')
    const fixture = required(fixtureA, 'la fixture de A')

    const response = await client
      .post('/api/position-business-unit-competency-levels')
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json({
        positionId: fixture.position.positionId,
        competencyId: fixture.competency.competencyId,
        businessUnitCompetencyLevelId: fixture.level.businessUnitCompetencyLevelId,
      })

    response.assertStatus(201)
    const createdId = response.body()?.data?.positionBusinessUnitCompetencyLevel
      ?.positionBusinessUnitCompetencyLevelId
    assert.isNumber(createdId)

    await db
      .from('position_business_unit_competency_levels')
      .where('position_business_unit_competency_level_id', createdId)
      .delete()
  })

  test('CA-2: alta con puesto ajeno responde 404 uniforme (CMPT.NF.006), no 500, y no crea nada', async ({
    client,
    assert,
  }) => {
    const actor = required(companyA, 'la empresa A')
    const ownFixture = required(fixtureA, 'la fixture de A')
    const otherFixture = required(fixtureB, 'la fixture de B')

    const response = await client
      .post('/api/position-business-unit-competency-levels')
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json({
        positionId: otherFixture.position.positionId,
        competencyId: ownFixture.competency.competencyId,
        businessUnitCompetencyLevelId: ownFixture.level.businessUnitCompetencyLevelId,
      })

    assertUniform404(assert, response, 'CMPT.NF.006')

    const created = await db
      .from('position_business_unit_competency_levels')
      .where('position_id', otherFixture.position.positionId)
      .first()
    assert.isNull(created)
  })

  test('CA-2: alta con competencia ajena responde 404 uniforme (CMPT.NF.001) y no crea nada', async ({
    client,
    assert,
  }) => {
    const actor = required(companyA, 'la empresa A')
    const ownFixture = required(fixtureA, 'la fixture de A')
    const otherFixture = required(fixtureB, 'la fixture de B')

    const response = await client
      .post('/api/position-business-unit-competency-levels')
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json({
        positionId: ownFixture.position.positionId,
        competencyId: otherFixture.competency.competencyId,
        businessUnitCompetencyLevelId: ownFixture.level.businessUnitCompetencyLevelId,
      })

    assertUniform404(assert, response, 'CMPT.NF.001')

    const created = await db
      .from('position_business_unit_competency_levels')
      .where('position_id', ownFixture.position.positionId)
      .where('competency_id', otherFixture.competency.competencyId)
      .first()
    assert.isNull(created)
  })

  test('CA-2: alta con nivel de empresa ajeno responde 404 uniforme (CMPT.NF.005) y no crea nada', async ({
    client,
    assert,
  }) => {
    const actor = required(companyA, 'la empresa A')
    const ownFixture = required(fixtureA, 'la fixture de A')
    const otherFixture = required(fixtureB, 'la fixture de B')

    const response = await client
      .post('/api/position-business-unit-competency-levels')
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json({
        positionId: ownFixture.position.positionId,
        competencyId: ownFixture.competency.competencyId,
        businessUnitCompetencyLevelId: otherFixture.level.businessUnitCompetencyLevelId,
      })

    assertUniform404(assert, response, 'CMPT.NF.005')

    const created = await db
      .from('position_business_unit_competency_levels')
      .where('position_id', ownFixture.position.positionId)
      .first()
    assert.isNull(created)
  })

  test('CA-3/CA-4: PUT y DELETE a un registro ajeno responden 404 uniforme (CMPT.NF.004) y no lo tocan', async ({
    client,
    assert,
  }) => {
    const ownerActor = required(companyB, 'la empresa B')
    const otherActor = required(companyA, 'la empresa A')
    const ownerFixture = required(fixtureB, 'la fixture de B')

    const created = await client
      .post('/api/position-business-unit-competency-levels')
      .loginAs(ownerActor.user)
      .headers(businessUnitHeaders(ownerActor))
      .json({
        positionId: ownerFixture.position.positionId,
        competencyId: ownerFixture.competency.competencyId,
        businessUnitCompetencyLevelId: ownerFixture.level.businessUnitCompetencyLevelId,
      })
    created.assertStatus(201)
    const levelId = created.body().data.positionBusinessUnitCompetencyLevel
      .positionBusinessUnitCompetencyLevelId

    const putResponse = await client
      .put(`/api/position-business-unit-competency-levels/${levelId}`)
      .loginAs(otherActor.user)
      .headers(businessUnitHeaders(otherActor))
      .json({ businessUnitCompetencyLevelId: ownerFixture.level.businessUnitCompetencyLevelId })
    assertUniform404(assert, putResponse, 'CMPT.NF.004')

    const deleteResponse = await client
      .delete(`/api/position-business-unit-competency-levels/${levelId}`)
      .loginAs(otherActor.user)
      .headers(businessUnitHeaders(otherActor))
    assertUniform404(assert, deleteResponse, 'CMPT.NF.004')

    const stillAlive = await db
      .from('position_business_unit_competency_levels')
      .where('position_business_unit_competency_level_id', levelId)
      .whereNull('position_business_unit_competency_level_deleted_at')
      .first()
    assert.isNotNull(stillAlive)

    await db
      .from('position_business_unit_competency_levels')
      .where('position_business_unit_competency_level_id', levelId)
      .delete()
  })

  test('CA-2: PUT a un registro propio con nivel de empresa ajeno responde 404 uniforme (CMPT.NF.005) y no cambia el registro', async ({
    client,
    assert,
  }) => {
    const actor = required(companyA, 'la empresa A')
    const ownFixture = required(fixtureA, 'la fixture de A')
    const otherFixture = required(fixtureB, 'la fixture de B')

    const created = await client
      .post('/api/position-business-unit-competency-levels')
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json({
        positionId: ownFixture.position.positionId,
        competencyId: ownFixture.competency.competencyId,
        businessUnitCompetencyLevelId: ownFixture.level.businessUnitCompetencyLevelId,
      })
    created.assertStatus(201)
    const levelId = created.body().data.positionBusinessUnitCompetencyLevel
      .positionBusinessUnitCompetencyLevelId

    const putResponse = await client
      .put(`/api/position-business-unit-competency-levels/${levelId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json({ businessUnitCompetencyLevelId: otherFixture.level.businessUnitCompetencyLevelId })
    assertUniform404(assert, putResponse, 'CMPT.NF.005')

    const unchanged = await db
      .from('position_business_unit_competency_levels')
      .where('position_business_unit_competency_level_id', levelId)
      .first()
    assert.equal(unchanged.business_unit_competency_level_id, ownFixture.level.businessUnitCompetencyLevelId)

    await db
      .from('position_business_unit_competency_levels')
      .where('position_business_unit_competency_level_id', levelId)
      .delete()
  })

  /**
   * CA-10 (parcial funcional): simula una referencia ajena que ya existía
   * antes de este ticket (por eso se inserta directo, sin pasar por el
   * guardia nuevo). El contrato de dependencia (§9) ya garantiza que
   * `Position.positionBusinessUnitCompetencyLevels` preloads `competency`
   * escopeado: sin fila, `competency` llega `null` y `PositionService`
   * filtra por `c.competency?.competencyType` (encadenado opcional) — no
   * truena y no expone el nombre ajeno.
   */
  test('CA-10: preload, PDF y Excel no truenan ni exponen una competencia ajena referenciada en un registro preexistente', async ({
    client,
    assert,
  }) => {
    const actor = required(companyA, 'la empresa A')
    const ownFixture = required(fixtureA, 'la fixture de A')
    const otherFixture = required(fixtureB, 'la fixture de B')

    const orphanId = await TenantContext.run([actor.businessUnit.businessUnitId], async () => {
      const orphan = new PositionBusinessUnitCompetencyLevel()
      orphan.positionId = ownFixture.position.positionId
      orphan.businessUnitId = actor.businessUnit.businessUnitId
      orphan.competencyId = otherFixture.competency.competencyId
      orphan.businessUnitCompetencyLevelId = ownFixture.level.businessUnitCompetencyLevelId
      await orphan.save()
      return orphan.positionBusinessUnitCompetencyLevelId
    })

    const byPosition = await client
      .get(`/api/position-business-unit-competency-levels/by-position/${ownFixture.position.positionId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
    byPosition.assertStatus(200)
    const rows: Record<string, unknown>[] =
      byPosition.body().data?.positionBusinessUnitCompetencyLevels ?? []
    const orphanRow = rows.find(
      (row) => row.positionBusinessUnitCompetencyLevelId === orphanId
    )
    assert.isDefined(orphanRow)
    assert.isNull(orphanRow?.competency)

    const pdfResponse = await client
      .get(`/api/positions/get-pdf/${ownFixture.position.positionId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
    assert.isBelow(pdfResponse.status(), 500)

    const excelResponse = await client
      .get(`/api/positions/get-excel/${ownFixture.position.positionId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
    assert.isBelow(excelResponse.status(), 500)

    await db
      .from('position_business_unit_competency_levels')
      .where('position_business_unit_competency_level_id', orphanId)
      .delete()
  })

  test('CA-14: el 404 de puesto ajeno no revela si el id existe en otra empresa', async ({
    client,
    assert,
  }) => {
    const actor = required(companyA, 'la empresa A')
    const ownFixture = required(fixtureA, 'la fixture de A')
    const otherFixture = required(fixtureB, 'la fixture de B')

    const response = await client
      .post('/api/position-business-unit-competency-levels')
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json({
        positionId: otherFixture.position.positionId,
        competencyId: ownFixture.competency.competencyId,
        businessUnitCompetencyLevelId: ownFixture.level.businessUnitCompetencyLevelId,
      })

    const raw = JSON.stringify(response.body())
    assert.notInclude(raw, String(otherFixture.position.positionId))
    assert.notInclude(raw, otherFixture.position.positionName)
    assert.notInclude(raw.toLowerCase(), 'no está en tu alcance')
    assert.isBelow(response.status(), 500)
  })
})
