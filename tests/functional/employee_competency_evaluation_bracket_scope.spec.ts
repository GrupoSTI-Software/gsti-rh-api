import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import type { ApiResponse } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import Competency from '#models/competency'
import CompetencyDescriptor from '#models/competency_descriptor'
import CompetencyBracket from '#models/competency_bracket'
import BusinessUnitCompetencyLevel from '#models/business_unit_competency_level'
import PositionBusinessUnitCompetencyLevel from '#models/position_business_unit_competency_level'
import EmployeeEvaluation from '#models/employee_evaluation'
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
import {
  createEmployeeFixture,
  cleanupEmployeeFixture,
  type EmployeeFixture,
} from '#tests/helpers/employee_fixture'

/**
 * VLRH-H1792032453526 (regla 2 propia) — la evaluación de competencias del
 * empleado no verificaba que el nivel por puesto, el nivel de empresa y el
 * rango calificados fueran de la unidad en contexto (CA-5, CA-6, CA-14).
 *
 * El guardia valida `request.input` (lo que de verdad persiste `create`/
 * `update`), no el payload validado — ver `employee_competency_evaluation_controller.ts`.
 */

const MODULE = 'employees'
const GRANTS = ['tab-evaluaciones-read', 'tab-evaluaciones-write', 'tab-evaluaciones-delete'] as const

interface Fixture {
  employee: EmployeeFixture
  competency: Competency
  level: BusinessUnitCompetencyLevel
  descriptor: CompetencyDescriptor
  bracket: CompetencyBracket
  positionLevel: PositionBusinessUnitCompetencyLevel
  evaluation: EmployeeEvaluation
}

async function createFixtureFor(actor: TenantActor, label: string): Promise<Fixture> {
  const businessUnitId = actor.businessUnit.businessUnitId
  const employee = await createEmployeeFixture(businessUnitId, `ECE-${label}`)

  return TenantContext.run([businessUnitId], async () => {
    const competency = await Competency.create({
      competencyName: uniqueTestName(`ECE-CMP-${label}`).slice(0, 255),
      competencyType: 'technical',
    })
    const level = await BusinessUnitCompetencyLevel.create({
      businessUnitId,
      businessUnitCompetencyLevelLabel: `Nivel ECE ${label}`,
      businessUnitCompetencyLevelPosition: 1,
    })
    const descriptor = await CompetencyDescriptor.create({
      competencyId: competency.competencyId,
      businessUnitCompetencyLevelId: level.businessUnitCompetencyLevelId,
      competencyDescriptorDescription: `Descriptor ECE ${label}`,
    })
    const bracket = await CompetencyBracket.create({
      competencyDescriptorId: descriptor.competencyDescriptorId,
      competencyBracketDescription: `Rango ECE ${label}`,
      competencyBracketRangeMin: 0,
      competencyBracketRangeMax: 10,
      competencyBracketPosition: 1,
    })
    const positionId = required(employee.employee.positionId, 'el puesto del empleado fixture')
    const positionLevel = await PositionBusinessUnitCompetencyLevel.create({
      positionId,
      competencyId: competency.competencyId,
      businessUnitCompetencyLevelId: level.businessUnitCompetencyLevelId,
    })
    const evaluation = await EmployeeEvaluation.create({
      employeeId: employee.employee.employeeId,
      employeeEvaluationDate: '2025-01-01',
      employeeEvaluationType: `ece-${label}`,
      employeeEvaluationScore: 0,
    })

    return { employee, competency, level, descriptor, bracket, positionLevel, evaluation }
  })
}

async function cleanupFixtures(actor: TenantActor | null, fixture: Fixture | null): Promise<void> {
  if (!actor) return
  const businessUnitId = actor.businessUnit.businessUnitId
  await db.from('employee_competency_evaluations').where('business_unit_id', businessUnitId).delete()
  await db.from('employee_evaluations').where('business_unit_id', businessUnitId).delete()
  await db
    .from('position_business_unit_competency_levels')
    .where('business_unit_id', businessUnitId)
    .delete()
  await db.from('competency_brackets').where('business_unit_id', businessUnitId).delete()
  await db.from('competency_descriptors').where('business_unit_id', businessUnitId).delete()
  await db.from('competencies').where('business_unit_id', businessUnitId).delete()
  await db
    .from('business_unit_competency_levels')
    .where('business_unit_id', businessUnitId)
    .delete()
  await cleanupEmployeeFixture(fixture?.employee ?? null)
}

function assertUniform404(assert: Assert, response: ApiResponse, code: string): void {
  response.assertStatus(404)
  const body = response.body()
  assert.equal(body.key, 'recurso-no-encontrado')
  assert.equal(body.code, code)
  assert.deepEqual(body.data, {})
}

function evaluationPayload(fixture: Fixture) {
  return {
    employeeEvaluationId: fixture.evaluation.employeeEvaluationId,
    positionBusinessUnitCompetencyLevelId: fixture.positionLevel.positionBusinessUnitCompetencyLevelId,
    businessUnitCompetencyLevelId: fixture.level.businessUnitCompetencyLevelId,
    competencyBracketId: fixture.bracket.competencyBracketId,
    employeeCompetencyEvaluationBracketDescription: 'Rango evaluado',
    employeeCompetencyEvaluationBracketRangeMin: 0,
    employeeCompetencyEvaluationBracketRangeMax: 10,
    employeeCompetencyEvaluationScore: 5,
  }
}

test.group('Evaluación de competencias del empleado — pertenencia de referencias cruzadas', (group) => {
  let companyA: TenantActor | null = null
  let companyB: TenantActor | null = null
  let fixtureA: Fixture | null = null
  let fixtureB: Fixture | null = null

  group.setup(async () => {
    companyA = await createTenantActor('ece-aislamiento-a')
    companyB = await createTenantActor('ece-aislamiento-b')
    await grantModulePermissions(companyA, MODULE, GRANTS)
    await grantModulePermissions(companyB, MODULE, GRANTS)
    fixtureA = await createFixtureFor(companyA, 'A')
    fixtureB = await createFixtureFor(companyB, 'B')
  })

  group.teardown(async () => {
    await cleanupFixtures(companyA, fixtureA)
    await cleanupFixtures(companyB, fixtureB)
    await cleanupTenantActor(companyA)
    await cleanupTenantActor(companyB)
  })

  test('CA-5: alta con nivel por puesto, nivel de empresa y rango propios responde 201', async ({
    client,
    assert,
  }) => {
    const actor = required(companyA, 'la empresa A')
    const fixture = required(fixtureA, 'la fixture de A')

    const response = await client
      .post('/api/employee-competency-evaluations')
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json(evaluationPayload(fixture))

    response.assertStatus(201)
    const createdId = response.body()?.data?.employeeCompetencyEvaluation
      ?.employeeCompetencyEvaluationId
    assert.isNumber(createdId)

    await db
      .from('employee_competency_evaluations')
      .where('employee_competency_evaluation_id', createdId)
      .delete()
  })

  test('CA-5: alta con nivel por puesto ajeno responde 404 uniforme (CMPT.NF.004) y no crea nada', async ({
    client,
    assert,
  }) => {
    const actor = required(companyA, 'la empresa A')
    const ownFixture = required(fixtureA, 'la fixture de A')
    const otherFixture = required(fixtureB, 'la fixture de B')

    const response = await client
      .post('/api/employee-competency-evaluations')
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json({
        ...evaluationPayload(ownFixture),
        positionBusinessUnitCompetencyLevelId:
          otherFixture.positionLevel.positionBusinessUnitCompetencyLevelId,
      })

    assertUniform404(assert, response, 'CMPT.NF.004')

    const created = await db
      .from('employee_competency_evaluations')
      .where('employee_evaluation_id', ownFixture.evaluation.employeeEvaluationId)
      .first()
    assert.isNull(created)
  })

  test('CA-5: alta con nivel de empresa ajeno responde 404 uniforme (CMPT.NF.005) y no crea nada', async ({
    client,
    assert,
  }) => {
    const actor = required(companyA, 'la empresa A')
    const ownFixture = required(fixtureA, 'la fixture de A')
    const otherFixture = required(fixtureB, 'la fixture de B')

    const response = await client
      .post('/api/employee-competency-evaluations')
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json({
        ...evaluationPayload(ownFixture),
        businessUnitCompetencyLevelId: otherFixture.level.businessUnitCompetencyLevelId,
      })

    assertUniform404(assert, response, 'CMPT.NF.005')

    const created = await db
      .from('employee_competency_evaluations')
      .where('employee_evaluation_id', ownFixture.evaluation.employeeEvaluationId)
      .first()
    assert.isNull(created)
  })

  test('CA-5: alta con rango ajeno responde 404 uniforme (CMPT.NF.003) y no crea nada', async ({
    client,
    assert,
  }) => {
    const actor = required(companyA, 'la empresa A')
    const ownFixture = required(fixtureA, 'la fixture de A')
    const otherFixture = required(fixtureB, 'la fixture de B')

    const response = await client
      .post('/api/employee-competency-evaluations')
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json({
        ...evaluationPayload(ownFixture),
        competencyBracketId: otherFixture.bracket.competencyBracketId,
      })

    assertUniform404(assert, response, 'CMPT.NF.003')

    const created = await db
      .from('employee_competency_evaluations')
      .where('employee_evaluation_id', ownFixture.evaluation.employeeEvaluationId)
      .first()
    assert.isNull(created)
  })

  test('CA-6: edición con nivel de empresa ajeno responde 404 uniforme (CMPT.NF.005) y no cambia el registro', async ({
    client,
    assert,
  }) => {
    const actor = required(companyA, 'la empresa A')
    const ownFixture = required(fixtureA, 'la fixture de A')
    const otherFixture = required(fixtureB, 'la fixture de B')

    const created = await client
      .post('/api/employee-competency-evaluations')
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json(evaluationPayload(ownFixture))
    created.assertStatus(201)
    const evaluationId = created.body().data.employeeCompetencyEvaluation
      .employeeCompetencyEvaluationId

    const putResponse = await client
      .put(`/api/employee-competency-evaluations/${evaluationId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json({
        businessUnitCompetencyLevelId: otherFixture.level.businessUnitCompetencyLevelId,
        competencyBracketId: ownFixture.bracket.competencyBracketId,
        employeeCompetencyEvaluationScore: 7,
      })
    assertUniform404(assert, putResponse, 'CMPT.NF.005')

    const unchanged = await db
      .from('employee_competency_evaluations')
      .where('employee_competency_evaluation_id', evaluationId)
      .first()
    assert.equal(
      unchanged.business_unit_competency_level_id,
      ownFixture.level.businessUnitCompetencyLevelId
    )

    await db
      .from('employee_competency_evaluations')
      .where('employee_competency_evaluation_id', evaluationId)
      .delete()
  })

  test('CA-6: edición con rango ajeno responde 404 uniforme (CMPT.NF.003) y no cambia el registro', async ({
    client,
    assert,
  }) => {
    const actor = required(companyA, 'la empresa A')
    const ownFixture = required(fixtureA, 'la fixture de A')
    const otherFixture = required(fixtureB, 'la fixture de B')

    const created = await client
      .post('/api/employee-competency-evaluations')
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json(evaluationPayload(ownFixture))
    created.assertStatus(201)
    const evaluationId = created.body().data.employeeCompetencyEvaluation
      .employeeCompetencyEvaluationId

    const putResponse = await client
      .put(`/api/employee-competency-evaluations/${evaluationId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json({
        businessUnitCompetencyLevelId: ownFixture.level.businessUnitCompetencyLevelId,
        competencyBracketId: otherFixture.bracket.competencyBracketId,
        employeeCompetencyEvaluationScore: 7,
      })
    assertUniform404(assert, putResponse, 'CMPT.NF.003')

    const unchanged = await db
      .from('employee_competency_evaluations')
      .where('employee_competency_evaluation_id', evaluationId)
      .first()
    assert.equal(unchanged.competency_bracket_id, ownFixture.bracket.competencyBracketId)

    await db
      .from('employee_competency_evaluations')
      .where('employee_competency_evaluation_id', evaluationId)
      .delete()
  })

  test('CA-14: el 404 de referencias ajenas no revela si el id existe en otra empresa', async ({
    client,
    assert,
  }) => {
    const actor = required(companyA, 'la empresa A')
    const ownFixture = required(fixtureA, 'la fixture de A')
    const otherFixture = required(fixtureB, 'la fixture de B')

    const response = await client
      .post('/api/employee-competency-evaluations')
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json({
        ...evaluationPayload(ownFixture),
        competencyBracketId: otherFixture.bracket.competencyBracketId,
      })

    const raw = JSON.stringify(response.body())
    assert.notInclude(raw, String(otherFixture.bracket.competencyBracketId))
    assert.notInclude(raw, otherFixture.bracket.competencyBracketDescription)
    assert.notInclude(raw.toLowerCase(), 'no está en tu alcance')
    assert.isBelow(response.status(), 500)
  })
})
