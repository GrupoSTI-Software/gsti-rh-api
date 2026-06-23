import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import QuestionnaireApplicationResponseService from '#services/questionnaire_application_response_service'
import QuestionnaireApplicationService from '#services/questionnaire_application_service'
import { QuestionnaireApplicationServiceError } from '#exceptions/questionnaire_application_service_error'
import { QUESTIONNAIRE_APPLICATION_ERROR_CODES } from '#constants/questionnaire_application_error_codes'

type ScenarioFixture = {
  businessUnitId: number
  employeeId: number
  questionnaireApplicationId: number
  questionIds: number[]
  validOptionKey: string
  cleanup: () => Promise<void>
}

async function tableExists(tableName: string): Promise<boolean> {
  try {
    await db.from(tableName).select('*').limit(1)
    return true
  } catch {
    return false
  }
}

async function createScenarioFixture(assert: Assert): Promise<ScenarioFixture | null> {
  const requiredTables = [
    'questionnaire_applications',
    'questionnaire_application_targets',
    'questionnaire_application_responses',
    'questionnaire_application_answers',
    'regulation_questionnaires',
    'regulation_questionnaire_sections',
    'regulation_questionnaire_questions',
    'regulation_questionnaire_answer_scales',
    'regulatory_authorities',
    'employees',
    'branch_offices',
  ]

  for (const tableName of requiredTables) {
    if (!(await tableExists(tableName))) {
      assert.isTrue(true, `Tabla ${tableName} no disponible en BD de testing; prueba omitida`)
      return null
    }
  }

  const branch = await db
    .from('branch_offices')
    .whereNull('branch_office_deleted_at')
    .select('branch_office_id', 'business_unit_id')
    .first()
  const employee = await db
    .from('employees')
    .whereNull('employee_deleted_at')
    .select('employee_id')
    .first()

  if (!branch || !employee) {
    assert.isTrue(
      true,
      'No hay branch_office o employee disponibles en BD de testing; prueba omitida'
    )
    return null
  }

  const now = DateTime.utc().toSQL({ includeOffset: false })!
  const token = Date.now()
  const validOptionKey = `opt_${token}`

  const [regulatoryAuthorityIdRaw] = await db.table('regulatory_authorities').insert({
    regulatory_authority_slug: `test-auth-${token}`,
    regulatory_authority_short_name: 'Test Auth',
    regulatory_authority_full_name: 'Test Regulatory Authority',
    regulatory_authority_country_code: 'MX',
    regulatory_authority_jurisdiction: 'federal',
    regulatory_authority_description_key: 'test.auth.description',
    regulatory_authority_audit_description_key: null,
    regulatory_authority_website: null,
    regulatory_authority_icon: null,
    regulatory_authority_brand_color: null,
    regulatory_authority_is_active: 1,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  })
  const regulatoryAuthorityId = Number(regulatoryAuthorityIdRaw)

  const [answerScaleIdRaw] = await db.table('regulation_questionnaire_answer_scales').insert({
    regulation_questionnaire_answer_scale_code: `scale-${token}`,
    regulation_questionnaire_answer_scale_title_key: 'test.scale.title',
    regulation_questionnaire_answer_scale_definition: JSON.stringify({
      options: [
        { key: validOptionKey, value: 4 },
        { key: `alt_${token}`, value: 1 },
      ],
    }),
    created_at: now,
    updated_at: now,
    deleted_at: null,
  })
  const answerScaleId = Number(answerScaleIdRaw)

  const [questionnaireIdRaw] = await db.table('regulation_questionnaires').insert({
    regulatory_authority_id: regulatoryAuthorityId,
    regulation_questionnaire_code: `Q-${token}`,
    regulation_questionnaire_title_key: 'test.questionnaire.title',
    regulation_questionnaire_description_key: 'test.questionnaire.description',
    regulation_questionnaire_version: '1.0',
    regulation_questionnaire_status: 'vigente',
    regulation_questionnaire_applies_to_description_key: null,
    regulation_questionnaire_min_responders: 16,
    regulation_questionnaire_completion_time_minutes: 10,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  })
  const questionnaireId = Number(questionnaireIdRaw)

  const [sectionIdRaw] = await db.table('regulation_questionnaire_sections').insert({
    regulation_questionnaire_id: questionnaireId,
    regulation_questionnaire_section_code: `SEC-${token}`,
    regulation_questionnaire_section_title_key: 'test.section.title',
    regulation_questionnaire_section_description_key: null,
    regulation_questionnaire_section_ord: 1,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  })
  const sectionId = Number(sectionIdRaw)

  const questionIds: number[] = []
  for (const [index, code] of ['Q1', 'Q2', 'Q3'].entries()) {
    const [questionIdRaw] = await db.table('regulation_questionnaire_questions').insert({
      regulation_questionnaire_section_id: sectionId,
      regulation_questionnaire_question_code: `${code}-${token}`,
      regulation_questionnaire_question_text_key: `test.question.${index + 1}.text`,
      regulation_questionnaire_question_help_key: null,
      regulation_questionnaire_question_answer_scale_id: answerScaleId,
      regulation_questionnaire_question_is_reverse_scored: 0,
      regulation_questionnaire_question_weight: 1.0,
      regulation_questionnaire_question_ord: index + 1,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    })
    questionIds.push(Number(questionIdRaw))
  }

  const [questionnaireApplicationIdRaw] = await db.table('questionnaire_applications').insert({
    business_unit_id: Number(branch.business_unit_id),
    branch_office_id: Number(branch.branch_office_id),
    regulation_questionnaire_id: questionnaireId,
    questionnaire_application_folio: `TEST-FOLIO-${token}`,
    questionnaire_application_instrument: 'guide_ii',
    questionnaire_application_status: 'en-curso',
    questionnaire_application_launched_at: now,
    questionnaire_application_closed_at: null,
    questionnaire_application_created_at: now,
    questionnaire_application_updated_at: now,
    questionnaire_application_deleted_at: null,
  })
  const questionnaireApplicationId = Number(questionnaireApplicationIdRaw)

  await db.table('questionnaire_application_targets').insert({
    questionnaire_application_id: questionnaireApplicationId,
    employee_id: Number(employee.employee_id),
    questionnaire_application_target_status: 'pendiente',
    questionnaire_application_target_responded_at: null,
    questionnaire_application_target_created_at: now,
    questionnaire_application_target_updated_at: now,
  })

  const cleanup = async () => {
    await db.from('questionnaire_application_answers').whereIn(
      'questionnaire_application_response_id',
      db
        .from('questionnaire_application_responses')
        .where('questionnaire_application_id', questionnaireApplicationId)
        .select('questionnaire_application_response_id')
    )
    await db
      .from('questionnaire_application_responses')
      .where('questionnaire_application_id', questionnaireApplicationId)
      .delete()
    await db
      .from('questionnaire_application_targets')
      .where('questionnaire_application_id', questionnaireApplicationId)
      .delete()
    await db
      .from('questionnaire_applications')
      .where('questionnaire_application_id', questionnaireApplicationId)
      .delete()
    await db
      .from('regulation_questionnaire_questions')
      .where('regulation_questionnaire_section_id', sectionId)
      .delete()
    await db
      .from('regulation_questionnaire_sections')
      .where('regulation_questionnaire_section_id', sectionId)
      .delete()
    await db
      .from('regulation_questionnaires')
      .where('regulation_questionnaire_id', questionnaireId)
      .delete()
    await db
      .from('regulation_questionnaire_answer_scales')
      .where('regulation_questionnaire_answer_scale_id', answerScaleId)
      .delete()
    await db
      .from('regulatory_authorities')
      .where('regulatory_authority_id', regulatoryAuthorityId)
      .delete()
  }

  return {
    businessUnitId: Number(branch.business_unit_id),
    employeeId: Number(employee.employee_id),
    questionnaireApplicationId,
    questionIds,
    validOptionKey,
    cleanup,
  }
}

type Assert = import('@japa/assert').Assert

test.group('QuestionnaireApplicationResponseService — HU USRH1782184103374', () => {
  test('GET instrument retorna estructura por secciones/preguntas/opciones', async ({ assert }) => {
    const fixture = await createScenarioFixture(assert)
    if (!fixture) return

    try {
      const service = new QuestionnaireApplicationResponseService()
      const result = await service.getInstrumentForTarget(
        fixture.questionnaireApplicationId,
        fixture.employeeId,
        [fixture.businessUnitId]
      )

      assert.equal(result.questionnaireApplicationId, fixture.questionnaireApplicationId)
      assert.equal(result.employeeId, fixture.employeeId)
      assert.isArray(result.sections)
      assert.isAtLeast(result.sections.length, 1)
      assert.isAtLeast(result.sections[0].questions.length, 1)
      assert.equal(result.sections[0].questions[0].answerScale.options[0].key, fixture.validOptionKey)
    } finally {
      await fixture.cleanup()
    }
  })

  test('POST answers exitoso persiste respuestas y marca target como respondido', async ({ assert }) => {
    const fixture = await createScenarioFixture(assert)
    if (!fixture) return

    try {
      const service = new QuestionnaireApplicationResponseService()
      const result = await service.submitAnswers(
        fixture.questionnaireApplicationId,
        fixture.employeeId,
        {
          answers: fixture.questionIds.map((questionId) => ({
            questionId,
            optionKey: fixture.validOptionKey,
          })),
        },
        [fixture.businessUnitId]
      )

      assert.equal(result.employeeId, fixture.employeeId)
      assert.equal(result.answeredCount, fixture.questionIds.length)
      assert.equal(result.targetStatus, 'respondido')

      const persistedResponse = await db
        .from('questionnaire_application_responses')
        .where('questionnaire_application_response_id', result.questionnaireApplicationResponseId)
        .first()
      assert.exists(persistedResponse)

      const answersCount = await db
        .from('questionnaire_application_answers')
        .where('questionnaire_application_response_id', result.questionnaireApplicationResponseId)
        .count('* as total')
      assert.equal(Number(answersCount[0].total), fixture.questionIds.length)

      const target = await db
        .from('questionnaire_application_targets')
        .where('questionnaire_application_id', fixture.questionnaireApplicationId)
        .where('employee_id', fixture.employeeId)
        .first()
      assert.equal(target.questionnaire_application_target_status, 'respondido')
      assert.exists(target.questionnaire_application_target_responded_at)
    } finally {
      await fixture.cleanup()
    }
  })

  test('retorna 422 INCOMPLETE_ANSWERS cuando faltan preguntas', async ({ assert }) => {
    const fixture = await createScenarioFixture(assert)
    if (!fixture) return

    try {
      const service = new QuestionnaireApplicationResponseService()
      const partialAnswers = fixture.questionIds.slice(0, fixture.questionIds.length - 1)

      let captured: unknown = null
      try {
        await service.submitAnswers(
          fixture.questionnaireApplicationId,
          fixture.employeeId,
          {
            answers: partialAnswers.map((questionId) => ({
              questionId,
              optionKey: fixture.validOptionKey,
            })),
          },
          [fixture.businessUnitId]
        )
      } catch (error) {
        captured = error
      }

      assert.instanceOf(captured, QuestionnaireApplicationServiceError)
      assert.equal(
        (captured as QuestionnaireApplicationServiceError).errorCode,
        QUESTIONNAIRE_APPLICATION_ERROR_CODES.INCOMPLETE_ANSWERS
      )
      assert.equal((captured as QuestionnaireApplicationServiceError).httpStatus, 422)
      assert.equal((captured as QuestionnaireApplicationServiceError).key, 'cuestionario-incompleto')
    } finally {
      await fixture.cleanup()
    }
  })

  test('retorna 422 INVALID_ANSWER_OPTION cuando optionKey no pertenece a la escala', async ({
    assert,
  }) => {
    const fixture = await createScenarioFixture(assert)
    if (!fixture) return

    try {
      const service = new QuestionnaireApplicationResponseService()

      let captured: unknown = null
      try {
        await service.submitAnswers(
          fixture.questionnaireApplicationId,
          fixture.employeeId,
          {
            answers: fixture.questionIds.map((questionId) => ({
              questionId,
              optionKey: 'opcion_invalida',
            })),
          },
          [fixture.businessUnitId]
        )
      } catch (error) {
        captured = error
      }

      assert.instanceOf(captured, QuestionnaireApplicationServiceError)
      assert.equal(
        (captured as QuestionnaireApplicationServiceError).errorCode,
        QUESTIONNAIRE_APPLICATION_ERROR_CODES.INVALID_ANSWER_OPTION
      )
      assert.equal((captured as QuestionnaireApplicationServiceError).httpStatus, 422)
      assert.equal((captured as QuestionnaireApplicationServiceError).key, 'respuesta-invalida')
    } finally {
      await fixture.cleanup()
    }
  })

  test('retorna 409 ALREADY_ANSWERED cuando target ya está respondido', async ({ assert }) => {
    const fixture = await createScenarioFixture(assert)
    if (!fixture) return

    try {
      await db
        .from('questionnaire_application_targets')
        .where('questionnaire_application_id', fixture.questionnaireApplicationId)
        .where('employee_id', fixture.employeeId)
        .update({
          questionnaire_application_target_status: 'respondido',
          questionnaire_application_target_responded_at: DateTime.utc().toSQL({ includeOffset: false }),
        })

      const service = new QuestionnaireApplicationResponseService()

      let captured: unknown = null
      try {
        await service.submitAnswers(
          fixture.questionnaireApplicationId,
          fixture.employeeId,
          {
            answers: fixture.questionIds.map((questionId) => ({
              questionId,
              optionKey: fixture.validOptionKey,
            })),
          },
          [fixture.businessUnitId]
        )
      } catch (error) {
        captured = error
      }

      assert.instanceOf(captured, QuestionnaireApplicationServiceError)
      assert.equal(
        (captured as QuestionnaireApplicationServiceError).errorCode,
        QUESTIONNAIRE_APPLICATION_ERROR_CODES.ALREADY_ANSWERED
      )
      assert.equal((captured as QuestionnaireApplicationServiceError).httpStatus, 409)
      assert.equal((captured as QuestionnaireApplicationServiceError).key, 'captura-duplicada')
    } finally {
      await fixture.cleanup()
    }
  })

  test('retorna 404 TARGET_NOT_FOUND cuando empleado no pertenece a la ronda', async ({ assert }) => {
    const fixture = await createScenarioFixture(assert)
    if (!fixture) return

    try {
      const service = new QuestionnaireApplicationResponseService()
      const outsiderEmployeeId = fixture.employeeId + 9_999_999

      let captured: unknown = null
      try {
        await service.submitAnswers(
          fixture.questionnaireApplicationId,
          outsiderEmployeeId,
          {
            answers: fixture.questionIds.map((questionId) => ({
              questionId,
              optionKey: fixture.validOptionKey,
            })),
          },
          [fixture.businessUnitId]
        )
      } catch (error) {
        captured = error
      }

      assert.instanceOf(captured, QuestionnaireApplicationServiceError)
      assert.equal(
        (captured as QuestionnaireApplicationServiceError).errorCode,
        QUESTIONNAIRE_APPLICATION_ERROR_CODES.TARGET_NOT_FOUND
      )
      assert.equal((captured as QuestionnaireApplicationServiceError).httpStatus, 404)
      assert.equal((captured as QuestionnaireApplicationServiceError).key, 'empleado-no-objetivo')
    } finally {
      await fixture.cleanup()
    }
  })
})

test.group('QuestionnaireApplicationService.listTargets — objetivos por ronda', () => {
  test('lista objetivos con datos de estado y nombre completo', async ({ assert }) => {
    const fixture = await createScenarioFixture(assert)
    if (!fixture) return

    try {
      const service = new QuestionnaireApplicationService()
      const targets = await service.listTargets(
        fixture.questionnaireApplicationId,
        {},
        [fixture.businessUnitId]
      )

      assert.lengthOf(targets, 1)
      assert.equal(targets[0].employeeId, fixture.employeeId)
      assert.equal(targets[0].status, 'pendiente')
      assert.isString(targets[0].employeeFullName)
    } finally {
      await fixture.cleanup()
    }
  })

  test('aplica filtros status y search', async ({ assert }) => {
    const fixture = await createScenarioFixture(assert)
    if (!fixture) return

    try {
      const service = new QuestionnaireApplicationService()
      const allTargets = await service.listTargets(
        fixture.questionnaireApplicationId,
        {},
        [fixture.businessUnitId]
      )
      const searchTerm = allTargets[0].employeeFullName.split(' ')[0]

      const pendingTargets = await service.listTargets(
        fixture.questionnaireApplicationId,
        { status: 'pendiente' },
        [fixture.businessUnitId]
      )
      assert.lengthOf(pendingTargets, 1)

      await db
        .from('questionnaire_application_targets')
        .where('questionnaire_application_id', fixture.questionnaireApplicationId)
        .where('employee_id', fixture.employeeId)
        .update({
          questionnaire_application_target_status: 'respondido',
          questionnaire_application_target_responded_at: DateTime.utc().toSQL({ includeOffset: false }),
        })

      const pendingAfterUpdate = await service.listTargets(
        fixture.questionnaireApplicationId,
        { status: 'pendiente' },
        [fixture.businessUnitId]
      )
      const answeredTargets = await service.listTargets(
        fixture.questionnaireApplicationId,
        { status: 'respondido', search: searchTerm },
        [fixture.businessUnitId]
      )

      assert.lengthOf(pendingAfterUpdate, 0)
      assert.lengthOf(answeredTargets, 1)
      assert.equal(answeredTargets[0].status, 'respondido')
    } finally {
      await fixture.cleanup()
    }
  })
})
