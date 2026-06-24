import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * Tests unitarios de las migraciones de cuestionarios regulatorios.
 * Validan estructura DDL en código fuente sin ejecutar MySQL.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'database/migrations')

const MIGRATION_FILES = {
  questionnaires: '1779264779100_create_regulation_questionnaires_table.ts',
  sections: '1779264779101_create_regulation_questionnaire_sections_table.ts',
  answerScales: '1779264779102_create_regulation_questionnaire_answer_scales_table.ts',
  questions: '1779264779103_create_regulation_questionnaire_questions_table.ts',
  clauseQuestionnaires: '1779264779104_create_regulation_clause_questionnaires_table.ts',
} as const

/** Límite de MySQL para nombres de identificadores (FK, UNIQUE, etc.). */
const MYSQL_IDENTIFIER_MAX_LENGTH = 64

function readMigration(key: keyof typeof MIGRATION_FILES): string {
  return readFileSync(join(MIGRATIONS_DIR, MIGRATION_FILES[key]), 'utf-8')
}

function assertIdentifierWithinLimit(
  assert: { isAtMost: (actual: number, expected: number, message?: string) => void },
  identifier: string,
  context: string
) {
  assert.isAtMost(
    identifier.length,
    MYSQL_IDENTIFIER_MAX_LENGTH,
    `${context}: "${identifier}" excede ${MYSQL_IDENTIFIER_MAX_LENGTH} caracteres`
  )
}

test.group('Cuestionarios regulatorios — orden y existencia de migraciones', () => {
  test('existen las 5 migraciones en orden de dependencia FK', ({ assert }) => {
    const timestamps = Object.values(MIGRATION_FILES).map((file) => Number(file.split('_')[0]))

    for (let i = 1; i < timestamps.length; i++) {
      assert.isAbove(
        timestamps[i],
        timestamps[i - 1],
        'Las migraciones hijas deben tener timestamp posterior a la padre'
      )
    }
  })

  test('cada migración define down() con dropTable', ({ assert }) => {
    for (const file of Object.values(MIGRATION_FILES)) {
      const content = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8')
      assert.include(content, 'dropTable', `${file} debe revertir con dropTable`)
    }
  })
})

test.group('Cuestionarios regulatorios — migración regulation_questionnaires', () => {
  test('crea tabla con PK, FK a autoridad, ENUM status y UNIQUE compuesto', ({ assert }) => {
    const sql = readMigration('questionnaires')

    assert.include(sql, "protected tableName = 'regulation_questionnaires'")
    assert.include(sql, "bigIncrements('regulation_questionnaire_id')")
    assert.include(sql, ".inTable('regulatory_authorities')")
    assert.include(sql, "onDelete('RESTRICT')")
    assert.include(
      sql,
      "enum('regulation_questionnaire_status', ['vigente', 'modificada', 'derogada'])"
    )
    assert.include(sql, "'regulatory_authority_id', 'regulation_questionnaire_code', 'regulation_questionnaire_version'")
    assert.include(sql, "indexName: 'uq_regulation_questionnaires_authority_code_version'")
    assert.include(sql, "timestamp('deleted_at').nullable()")
  })
})

test.group('Cuestionarios regulatorios — migración regulation_questionnaire_sections', () => {
  test('FK a questionnaires con nombre corto y UNIQUE compuesto por cuestionario y código', ({
    assert,
  }) => {
    const sql = readMigration('sections')

    assert.include(sql, "protected tableName = 'regulation_questionnaire_sections'")
    assert.include(sql, "bigIncrements('regulation_questionnaire_section_id')")
    assert.include(sql, ".foreign('regulation_questionnaire_id', 'fk_rqs_questionnaire_id')")
    assert.include(sql, ".inTable('regulation_questionnaires')")
    assert.include(sql, "onDelete('RESTRICT')")
    assert.include(sql, "'regulation_questionnaire_id', 'regulation_questionnaire_section_code'")
    assert.include(sql, "indexName: 'uq_regulation_questionnaire_sections_questionnaire_code'")

    assertIdentifierWithinLimit(assert, 'fk_rqs_questionnaire_id', 'FK sections → questionnaires')
  })
})

test.group('Cuestionarios regulatorios — migración regulation_questionnaire_answer_scales', () => {
  test('crea tabla con código UNIQUE explícito y columna JSON de definición', ({ assert }) => {
    const sql = readMigration('answerScales')

    assert.include(sql, "protected tableName = 'regulation_questionnaire_answer_scales'")
    assert.include(sql, "bigIncrements('regulation_questionnaire_answer_scale_id')")
    assert.include(sql, "unique(['regulation_questionnaire_answer_scale_code']")
    assert.include(sql, "indexName: 'uq_rqas_code'")
    assert.include(sql, "json('regulation_questionnaire_answer_scale_definition')")

    assertIdentifierWithinLimit(assert, 'uq_rqas_code', 'UNIQUE answer_scales.code')
  })
})

test.group('Cuestionarios regulatorios — migración regulation_questionnaire_questions', () => {
  test('FKs con nombres cortos, defaults de reverse-scored y weight, UNIQUE por sección', ({
    assert,
  }) => {
    const sql = readMigration('questions')

    assert.include(sql, "protected tableName = 'regulation_questionnaire_questions'")
    assert.include(sql, "bigIncrements('regulation_questionnaire_question_id')")
    assert.include(sql, ".foreign('regulation_questionnaire_section_id', 'fk_rqq_section_id')")
    assert.include(sql, ".inTable('regulation_questionnaire_sections')")
    assert.include(
      sql,
      ".foreign('regulation_questionnaire_question_answer_scale_id', 'fk_rqq_answer_scale_id')"
    )
    assert.include(sql, ".inTable('regulation_questionnaire_answer_scales')")
    assert.include(sql, "onDelete('RESTRICT')")
    assert.include(sql, 'regulation_questionnaire_question_is_reverse_scored')
    assert.include(sql, '.defaultTo(0)')
    assert.include(sql, "decimal('regulation_questionnaire_question_weight', 4, 2)")
    assert.include(sql, '.defaultTo(1.0)')
    assert.include(sql, "'regulation_questionnaire_section_id', 'regulation_questionnaire_question_code'")
    assert.include(sql, 'indexName: "uq_regulation_questionnaire_questions_section_code"')

    assertIdentifierWithinLimit(assert, 'fk_rqq_section_id', 'FK questions → sections')
    assertIdentifierWithinLimit(assert, 'fk_rqq_answer_scale_id', 'FK questions → answer_scales')
  })
})

test.group('Cuestionarios regulatorios — migración regulation_clause_questionnaires', () => {
  test('pivote N:N con FKs RESTRICT, notas y UNIQUE clause + questionnaire', ({ assert }) => {
    const sql = readMigration('clauseQuestionnaires')

    assert.include(sql, "protected tableName = 'regulation_clause_questionnaires'")
    assert.include(sql, "bigIncrements('regulation_clause_questionnaire_id')")
    assert.include(sql, ".inTable('regulation_clauses')")
    assert.include(sql, ".foreign('regulation_questionnaire_id', 'fk_rcq_questionnaire_id')")
    assert.include(sql, ".inTable('regulation_questionnaires')")
    assert.include(sql, "onDelete('RESTRICT')")
    assert.include(sql, 'regulation_clause_questionnaire_notes')
    assert.include(sql, "'regulation_clause_id', 'regulation_questionnaire_id'")
    assert.include(sql, 'indexName: "uq_regulation_clause_questionnaires_clause_questionnaire"')

    assertIdentifierWithinLimit(assert, 'fk_rcq_questionnaire_id', 'FK pivote → questionnaires')
  })
})

test.group('Cuestionarios regulatorios — nombres de constraint dentro del límite MySQL', () => {
  test('ningún nombre explícito de FK o UNIQUE supera 64 caracteres', ({ assert }) => {
    const explicitIdentifiers = [
      'uq_regulation_questionnaires_authority_code_version',
      'fk_rqs_questionnaire_id',
      'uq_regulation_questionnaire_sections_questionnaire_code',
      'uq_rqas_code',
      'fk_rqq_section_id',
      'fk_rqq_answer_scale_id',
      'uq_regulation_questionnaire_questions_section_code',
      'fk_rcq_questionnaire_id',
      'uq_regulation_clause_questionnaires_clause_questionnaire',
    ]

    for (const identifier of explicitIdentifiers) {
      assertIdentifierWithinLimit(assert, identifier, 'Constraint explícito')
    }
  })

  test('no se usan nombres autogenerados que excedan 64 caracteres en FKs problemáticas', ({
    assert,
  }) => {
    const autoGeneratedTooLong = [
      'regulation_questionnaire_sections_regulation_questionnaire_id_foreign',
      'regulation_questionnaire_questions_regulation_questionnaire_section_id_foreign',
      'regulation_questionnaire_questions_regulation_questionnaire_question_answer_scale_id_foreign',
      'regulation_questionnaire_answer_scales_regulation_questionnaire_answer_scale_code_unique',
      'regulation_clause_questionnaires_regulation_questionnaire_id_foreign',
    ]

    for (const file of Object.values(MIGRATION_FILES)) {
      const content = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8')
      for (const badName of autoGeneratedTooLong) {
        assert.notInclude(
          content,
          badName,
          `${file} no debe depender del identificador autogenerado "${badName}"`
        )
      }
    }
  })
})
