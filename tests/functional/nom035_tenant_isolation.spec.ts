import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import QuestionnaireApplicationTarget from '#models/questionnaire_application_target'
import QuestionnaireApplication from '#models/questionnaire_application'
import { TenantContext } from '#utils/tenant_context'

/**
 * USRH1784259058521 — verificación end-to-end contra BD real: la marca de
 * targets/respuestas/resultados se llavea a la APLICACIÓN, no al empleado
 * "prestado". Construye la cadena mínima (autoridad → cuestionario
 * regulatorio → sucursal → aplicación) porque el ambiente no trae seed de
 * NOM-035.
 */

const APPLICATION_BUSINESS_UNIT_ID = 1 // sae
const BORROWED_EMPLOYEE_ID = 12 // pertenece a BU6 (cima) — "empleado prestado"

test.group('NOM-035 — marca llaveada a la aplicación, no al empleado prestado', (group) => {
  let regulatoryAuthorityId: number
  let regulationQuestionnaireId: number
  let branchOfficeId: number
  let applicationId: number
  let targetId: number

  group.setup(async () => {
    const now = DateTime.utc().toSQL({ includeOffset: false })!

    const [authorityId] = await db.table('regulatory_authorities').insert({
      regulatory_authority_slug: `test-ra-${Date.now()}`,
      regulatory_authority_short_name: 'TEST',
      regulatory_authority_full_name: 'Autoridad de prueba (fixture NOM-035)',
      regulatory_authority_country_code: 'MX',
      regulatory_authority_jurisdiction: 'federal',
      regulatory_authority_is_active: 1,
      created_at: now,
    })
    regulatoryAuthorityId = Number(authorityId)

    const [rqId] = await db.table('regulation_questionnaires').insert({
      regulatory_authority_id: regulatoryAuthorityId,
      regulation_questionnaire_code: `TEST-${Date.now()}`,
      regulation_questionnaire_title_key: 'test.fixture.title',
      regulation_questionnaire_description_key: 'test.fixture.description',
      regulation_questionnaire_version: 1,
      regulation_questionnaire_status: 'vigente',
      regulation_questionnaire_applies_to_description_key: 'test.fixture.applies',
      regulation_questionnaire_min_responders: 1,
      regulation_questionnaire_completion_time_minutes: 10,
      created_at: now,
    })
    regulationQuestionnaireId = Number(rqId)

    const [boId] = await db.table('branch_offices').insert({
      business_unit_id: APPLICATION_BUSINESS_UNIT_ID,
      branch_office_name: `Fixture NOM-035 ${Date.now()}`,
      branch_office_slug: `fixture-nom035-${Date.now()}`,
      branch_office_ideal_template_count: 0,
      branch_office_min_active_employees_per_shift: 0,
      branch_office_created_at: now,
      branch_office_updated_at: now,
    })
    branchOfficeId = Number(boId)

    const application = await TenantContext.runUnscoped(async () => {
      const app = new QuestionnaireApplication()
      app.businessUnitId = APPLICATION_BUSINESS_UNIT_ID
      app.branchOfficeId = branchOfficeId
      app.regulationQuestionnaireId = regulationQuestionnaireId
      app.questionnaireApplicationFolio = `TEST-FOLIO-${Date.now()}`
      app.questionnaireApplicationInstrument = 'guide_iii'
      app.questionnaireApplicationStatus = 'en-curso'
      app.questionnaireApplicationLaunchedAt = DateTime.now()
      await app.save()
      return app
    }, 'alta fixture nom035 (aplicación)')
    applicationId = application.questionnaireApplicationId
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      if (targetId) {
        await QuestionnaireApplicationTarget.query()
          .where('questionnaireApplicationTargetId', targetId)
          .delete()
      }
      if (applicationId) {
        await QuestionnaireApplication.query()
          .where('questionnaireApplicationId', applicationId)
          .delete()
      }
      if (branchOfficeId) {
        await db.from('branch_offices').where('branch_office_id', branchOfficeId).delete()
      }
      if (regulationQuestionnaireId) {
        await db
          .from('regulation_questionnaires')
          .where('regulation_questionnaire_id', regulationQuestionnaireId)
          .delete()
      }
      if (regulatoryAuthorityId) {
        await db
          .from('regulatory_authorities')
          .where('regulatory_authority_id', regulatoryAuthorityId)
          .delete()
      }
    }, 'limpieza fixture nom035')
  })

  test('alta de target hereda business_unit_id de la aplicación (empleado prestado)', async ({
    assert,
  }) => {
    // Empleado "prestado": pertenece a BU6, pero contesta una aplicación de
    // BU1. El hook debe llavear a la aplicación, no al empleado.
    const target = await TenantContext.runUnscoped(async () => {
      const t = new QuestionnaireApplicationTarget()
      t.questionnaireApplicationId = applicationId
      t.employeeId = BORROWED_EMPLOYEE_ID
      t.questionnaireApplicationTargetStatus = 'pendiente'
      await t.save()
      return t
    }, 'alta fixture nom035 (empleado prestado)')
    targetId = target.questionnaireApplicationTargetId

    assert.equal(target.businessUnitId, APPLICATION_BUSINESS_UNIT_ID)
    assert.notEqual(target.businessUnitId, 6)
  })

  test('mixin filtra el target por PK cuando el contexto está activo', async ({ assert }) => {
    const outOfScope = await TenantContext.run([6], () =>
      QuestionnaireApplicationTarget.query()
        .where('questionnaireApplicationTargetId', targetId)
        .first()
    )
    assert.isNull(outOfScope)

    const inScope = await TenantContext.run([APPLICATION_BUSINESS_UNIT_ID], () =>
      QuestionnaireApplicationTarget.query()
        .where('questionnaireApplicationTargetId', targetId)
        .first()
    )
    assert.isNotNull(inScope)
  })
})
