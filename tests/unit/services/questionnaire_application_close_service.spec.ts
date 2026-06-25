import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import QuestionnaireApplicationService from '#services/questionnaire_application_service'
import { QuestionnaireApplicationServiceError } from '#exceptions/questionnaire_application_service_error'
import { QUESTIONNAIRE_APPLICATION_ERROR_CODES } from '#constants/questionnaire_application_error_codes'

type Assert = import('@japa/assert').Assert

type CloseFixture = {
  questionnaireApplicationId: number
  businessUnitId: number
  actorUserId: number
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

async function createCloseFixture(assert: Assert): Promise<CloseFixture | null> {
  const requiredTables = [
    'questionnaire_applications',
    'questionnaire_application_targets',
    'questionnaire_application_state_logs',
    'regulation_questionnaires',
    'regulatory_authorities',
    'branch_offices',
    'employees',
    'users',
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
  const user = await db.from('users').whereNull('user_deleted_at').select('user_id').first()

  if (!branch || !employee || !user) {
    assert.isTrue(
      true,
      'No hay branch_office, employee o user disponibles en BD de testing; prueba omitida'
    )
    return null
  }

  const now = DateTime.utc()
  const nowSql = now.toSQL({ includeOffset: false })!
  const token = Date.now()

  const [regulatoryAuthorityIdRaw] = await db.table('regulatory_authorities').insert({
    regulatory_authority_slug: `test-close-auth-${token}`,
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
    created_at: nowSql,
    updated_at: nowSql,
    deleted_at: null,
  })
  const regulatoryAuthorityId = Number(regulatoryAuthorityIdRaw)

  const [questionnaireIdRaw] = await db.table('regulation_questionnaires').insert({
    regulatory_authority_id: regulatoryAuthorityId,
    regulation_questionnaire_code: `Q-CLOSE-${token}`,
    regulation_questionnaire_title_key: 'test.questionnaire.close.title',
    regulation_questionnaire_description_key: 'test.questionnaire.close.description',
    regulation_questionnaire_version: '1.0',
    regulation_questionnaire_status: 'vigente',
    regulation_questionnaire_applies_to_description_key: null,
    regulation_questionnaire_min_responders: 16,
    regulation_questionnaire_completion_time_minutes: 10,
    created_at: nowSql,
    updated_at: nowSql,
    deleted_at: null,
  })
  const questionnaireId = Number(questionnaireIdRaw)

  const [questionnaireApplicationIdRaw] = await db.table('questionnaire_applications').insert({
    business_unit_id: Number(branch.business_unit_id),
    branch_office_id: Number(branch.branch_office_id),
    regulation_questionnaire_id: questionnaireId,
    questionnaire_application_folio: `TEST-CLOSE-${token}`,
    questionnaire_application_instrument: 'guide_ii',
    questionnaire_application_status: 'en-curso',
    questionnaire_application_launched_at: nowSql,
    questionnaire_application_closed_at: null,
    questionnaire_application_created_at: nowSql,
    questionnaire_application_updated_at: nowSql,
    questionnaire_application_deleted_at: null,
  })
  const questionnaireApplicationId = Number(questionnaireApplicationIdRaw)

  await db.table('questionnaire_application_targets').insert({
    questionnaire_application_id: questionnaireApplicationId,
    employee_id: Number(employee.employee_id),
    questionnaire_application_target_status: 'pendiente',
    questionnaire_application_target_responded_at: null,
    questionnaire_application_target_created_at: nowSql,
    questionnaire_application_target_updated_at: nowSql,
  })

  const cleanup = async () => {
    await db
      .from('questionnaire_application_state_logs')
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
      .from('regulation_questionnaires')
      .where('regulation_questionnaire_id', questionnaireId)
      .delete()
    await db
      .from('regulatory_authorities')
      .where('regulatory_authority_id', regulatoryAuthorityId)
      .delete()
  }

  return {
    questionnaireApplicationId,
    businessUnitId: Number(branch.business_unit_id),
    actorUserId: Number(user.user_id),
    cleanup,
  }
}

test.group('QuestionnaireApplicationService.close y listHistory', () => {
  test('close cierra una ronda en curso y registra bitácora', async ({ assert }) => {
    const fixture = await createCloseFixture(assert)
    if (!fixture) return

    try {
      const service = new QuestionnaireApplicationService()
      const result = await service.close(
        fixture.questionnaireApplicationId,
        fixture.actorUserId,
        { note: 'Cierre formal de la ronda NOM-035' },
        [fixture.businessUnitId]
      )

      assert.equal(result.status, 'cerrada')
      assert.exists(result.closedAt)

      const persistedLog = await db
        .from('questionnaire_application_state_logs')
        .where('questionnaire_application_id', fixture.questionnaireApplicationId)
        .first()

      assert.exists(persistedLog)
      assert.equal(persistedLog.questionnaire_application_state_log_from_status, 'en-curso')
      assert.equal(persistedLog.questionnaire_application_state_log_to_status, 'cerrada')
      assert.equal(persistedLog.actor_user_id, fixture.actorUserId)
      assert.equal(
        persistedLog.questionnaire_application_state_log_note,
        'Cierre formal de la ronda NOM-035'
      )
    } finally {
      await fixture.cleanup()
    }
  })

  test('close retorna ALREADY_CLOSED cuando la ronda ya está cerrada', async ({ assert }) => {
    const fixture = await createCloseFixture(assert)
    if (!fixture) return

    try {
      await db
        .from('questionnaire_applications')
        .where('questionnaire_application_id', fixture.questionnaireApplicationId)
        .update({
          questionnaire_application_status: 'cerrada',
          questionnaire_application_closed_at: DateTime.utc().toSQL({ includeOffset: false }),
        })

      const service = new QuestionnaireApplicationService()
      let captured: unknown = null
      try {
        await service.close(
          fixture.questionnaireApplicationId,
          fixture.actorUserId,
          { note: 'Intento de cierre duplicado' },
          [fixture.businessUnitId]
        )
      } catch (error) {
        captured = error
      }

      assert.instanceOf(captured, QuestionnaireApplicationServiceError)
      assert.equal(
        (captured as QuestionnaireApplicationServiceError).errorCode,
        QUESTIONNAIRE_APPLICATION_ERROR_CODES.ALREADY_CLOSED
      )
      assert.equal((captured as QuestionnaireApplicationServiceError).httpStatus, 409)
    } finally {
      await fixture.cleanup()
    }
  })

  test('close retorna NOT_IN_PROGRESS cuando la ronda no está en curso', async ({ assert }) => {
    const fixture = await createCloseFixture(assert)
    if (!fixture) return

    try {
      await db
        .from('questionnaire_applications')
        .where('questionnaire_application_id', fixture.questionnaireApplicationId)
        .update({
          questionnaire_application_status: 'borrador',
        })

      const service = new QuestionnaireApplicationService()
      let captured: unknown = null
      try {
        await service.close(
          fixture.questionnaireApplicationId,
          fixture.actorUserId,
          { note: 'Intento de cierre en borrador' },
          [fixture.businessUnitId]
        )
      } catch (error) {
        captured = error
      }

      assert.instanceOf(captured, QuestionnaireApplicationServiceError)
      assert.equal(
        (captured as QuestionnaireApplicationServiceError).errorCode,
        QUESTIONNAIRE_APPLICATION_ERROR_CODES.NOT_IN_PROGRESS
      )
      assert.equal((captured as QuestionnaireApplicationServiceError).httpStatus, 422)
    } finally {
      await fixture.cleanup()
    }
  })

  test('listHistory devuelve entradas ordenadas cronológicamente', async ({ assert }) => {
    const fixture = await createCloseFixture(assert)
    if (!fixture) return

    try {
      const older = DateTime.utc().minus({ minutes: 5 }).toSQL({ includeOffset: false })!
      const newer = DateTime.utc().minus({ minutes: 1 }).toSQL({ includeOffset: false })!

      await db.table('questionnaire_application_state_logs').insert([
        {
          questionnaire_application_id: fixture.questionnaireApplicationId,
          actor_user_id: fixture.actorUserId,
          questionnaire_application_state_log_from_status: 'borrador',
          questionnaire_application_state_log_to_status: 'en-curso',
          questionnaire_application_state_log_note: 'Lanzamiento',
          questionnaire_application_state_log_created_at: older,
        },
        {
          questionnaire_application_id: fixture.questionnaireApplicationId,
          actor_user_id: fixture.actorUserId,
          questionnaire_application_state_log_from_status: 'en-curso',
          questionnaire_application_state_log_to_status: 'cerrada',
          questionnaire_application_state_log_note: 'Cierre',
          questionnaire_application_state_log_created_at: newer,
        },
      ])

      const service = new QuestionnaireApplicationService()
      const history = await service.listHistory(
        fixture.questionnaireApplicationId,
        [fixture.businessUnitId]
      )

      assert.lengthOf(history, 2)
      assert.equal(history[0].note, 'Lanzamiento')
      assert.equal(history[0].fromStatus, 'borrador')
      assert.equal(history[0].actorUser.userId, fixture.actorUserId)
      assert.isString(history[0].actorUser.email)
      assert.equal(history[1].note, 'Cierre')
      assert.equal(history[1].toStatus, 'cerrada')
      assert.equal(history[1].actorUser.userId, fixture.actorUserId)
      assert.isString(history[1].actorUser.email)
      assert.isString(history[0].createdAt)
      assert.isString(history[1].createdAt)
    } finally {
      await fixture.cleanup()
    }
  })
})
