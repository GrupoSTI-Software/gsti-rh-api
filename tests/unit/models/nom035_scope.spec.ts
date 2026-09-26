import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { assertModelHasColumns } from '../helpers/lucid_model_assertions.js'
import QuestionnaireApplicationResponse from '#models/questionnaire_application_response'
import QuestionnaireApplicationTarget from '#models/questionnaire_application_target'
import QuestionnaireTabulationEmployeeResult from '#models/questionnaire_tabulation_employee_result'
import Complaint from '#models/complaint'
import QuestionnaireApplication from '#models/questionnaire_application'
import QuestionnaireTabulationResult from '#models/questionnaire_tabulation_result'

/**
 * USRH1784259058521 — módulo NOM-035: 6 tablas componen el candado.
 * Grupo A (sin columna previa): la marca se llavea a la APLICACIÓN, no al
 * empleado. Grupo B (ya poblada en código): solo compone el mixin.
 */

const MODELS_DIR = join(process.cwd(), 'app/models')
const MIGRATIONS_DIR = join(process.cwd(), 'database/migrations')

const GROUP_A = [
  {
    fileName: 'questionnaire_application_response.ts',
    Model: QuestionnaireApplicationResponse,
    migrationSlug: 'add_business_unit_id_to_questionnaire_application_responses',
  },
  {
    fileName: 'questionnaire_application_target.ts',
    Model: QuestionnaireApplicationTarget,
    migrationSlug: 'add_business_unit_id_to_questionnaire_application_targets',
  },
  {
    fileName: 'questionnaire_tabulation_employee_result.ts',
    Model: QuestionnaireTabulationEmployeeResult,
    migrationSlug: 'add_business_unit_id_to_questionnaire_tabulation_employee_results',
  },
] as const

test.group('NOM-035 (Grupo A) — mixin + hook vía QuestionnaireApplication', () => {
  for (const { fileName, Model } of GROUP_A) {
    test(`${fileName} compone withBusinessUnitScope() y resuelve vía la aplicación`, ({
      assert,
    }) => {
      const content = readFileSync(join(MODELS_DIR, fileName), 'utf-8')
      assert.include(content, 'withBusinessUnitScope()')
      assertModelHasColumns(assert, Model, ['businessUnitId'])
      assert.include(content, '@beforeCreate()')
      assert.include(content, 'QuestionnaireApplication.query()')
      assert.include(content, "'la aplicación de cuestionario'")
      // No debe resolver vía Employee — es la corrección de fondo del detalle.
      assert.notMatch(content, /resolveParentBusinessUnitId\(\s*\(\)\s*=>\s*Employee\.query/)
    })
  }

  for (const { migrationSlug } of GROUP_A) {
    test(`${migrationSlug} hace backfill JOIN a questionnaire_applications`, ({ assert }) => {
      const match = readdirSync(MIGRATIONS_DIR).find((f) => f.includes(migrationSlug))
      assert.isDefined(match)
      if (!match) return
      const content = readFileSync(join(MIGRATIONS_DIR, match), 'utf-8')
      assert.notMatch(content, /await\s+this\.schema/)
      assert.include(content, 'this.defer(')
      assert.include(content, 'INNER JOIN \\`questionnaire_applications\\` qa')
      assert.include(content, 'NOT NULL')
      // No debe filtrar soft-deleted (cubre backfill completo).
      assert.notInclude(content, 'questionnaire_application_deleted_at')
    })
  }
})

test.group('NOM-035 (Grupo B) — mixin sobre columna ya poblada en código', () => {
  test('complaint.ts compone withBusinessUnitScope() con hook defensivo', ({ assert }) => {
    const content = readFileSync(join(MODELS_DIR, 'complaint.ts'), 'utf-8')
    assert.include(content, 'withBusinessUnitScope()')
    assertModelHasColumns(assert, Complaint, ['businessUnitId'])
    assert.include(content, '@beforeCreate()')
    assert.include(content, 'Guard defensivo')
  })

  test('questionnaire_application.ts compone withBusinessUnitScope() sin hook nuevo', ({
    assert,
  }) => {
    const content = readFileSync(join(MODELS_DIR, 'questionnaire_application.ts'), 'utf-8')
    assert.include(content, 'withBusinessUnitScope()')
    assertModelHasColumns(assert, QuestionnaireApplication, ['businessUnitId'])
  })

  test('questionnaire_tabulation_result.ts compone withBusinessUnitScope() sin hook nuevo', ({
    assert,
  }) => {
    const content = readFileSync(join(MODELS_DIR, 'questionnaire_tabulation_result.ts'), 'utf-8')
    assert.include(content, 'withBusinessUnitScope()')
    assertModelHasColumns(assert, QuestionnaireTabulationResult, ['businessUnitId'])
  })
})

test.group('NOM-035 — inserts crudos parcheados (targets y employee_results)', () => {
  test('questionnaire_application_service.ts escribe business_unit_id en targetRows', ({
    assert,
  }) => {
    const content = readFileSync(
      join(process.cwd(), 'app/services/questionnaire_application_service.ts'),
      'utf-8'
    )
    assert.include(content, 'business_unit_id: branch.businessUnitId')
  })

  test('questionnaire_tabulation_service.ts escribe business_unit_id en employeeRows', ({
    assert,
  }) => {
    const content = readFileSync(
      join(process.cwd(), 'app/services/questionnaire_tabulation_service.ts'),
      'utf-8'
    )
    assert.include(content, 'business_unit_id: application.businessUnitId')
  })
})
