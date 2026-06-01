import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * Tests unitarios de las migraciones de funcionalidades del sistema y cobertura regulatoria.
 * Validan estructura DDL en código fuente sin ejecutar MySQL.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'database/migrations')

const MIGRATION_FILES = {
  systemFeatures: '1779739784372_create_system_features_table.ts',
  replaceClaueFeatures: '1779739784373_replace_regulation_clause_features_with_fk.ts',
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

test.group('Funcionalidades del sistema — orden y existencia de migraciones', () => {
  test('existen las 2 migraciones en orden correcto (system_features antes que replace)', ({
    assert,
  }) => {
    const timestamps = Object.values(MIGRATION_FILES).map((file) => Number(file.split('_')[0]))
    assert.isAbove(
      timestamps[1],
      timestamps[0],
      'replace_regulation_clause_features debe tener timestamp posterior a system_features'
    )
  })

  test('cada migración define down() con dropTable', ({ assert }) => {
    for (const file of Object.values(MIGRATION_FILES)) {
      const content = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8')
      assert.include(content, 'dropTable', `${file} debe revertir con dropTable`)
    }
  })
})

test.group('Funcionalidades del sistema — migración system_features', () => {
  test('crea tabla con PK bigIncrements, FK a system_modules y campos de negocio', ({ assert }) => {
    const sql = readMigration('systemFeatures')

    assert.include(sql, "protected tableName = 'system_features'")
    assert.include(sql, "bigIncrements('system_feature_id')")
    assert.include(sql, ".inTable('system_modules')")
    assert.include(sql, "onDelete('RESTRICT')")
    assert.include(sql, "string('system_feature_name', 100)")
    assert.include(sql, "string('system_feature_slug', 150)")
    assert.include(sql, "string('system_feature_description', 200)")
  })

  test('define ENUM status con los 4 valores correctos', ({ assert }) => {
    const sql = readMigration('systemFeatures')
    assert.include(
      sql,
      "enum('system_feature_status', ['planeado', 'en_desarrollo', 'disponible', 'deprecado'])"
    )
    assert.include(sql, ".defaultTo('planeado')")
  })

  test('define UNIQUE compuesto (module_id, slug) con nombre explícito', ({ assert }) => {
    const sql = readMigration('systemFeatures')
    assert.include(sql, "'system_module_id', 'system_feature_slug'")
    assert.include(sql, "indexName: 'uq_system_features_module_slug'")
  })

  test('define timestamps y soft delete', ({ assert }) => {
    const sql = readMigration('systemFeatures')
    assert.include(sql, "timestamp('created_at').notNullable()")
    assert.include(sql, "timestamp('updated_at').nullable()")
    assert.include(sql, "timestamp('deleted_at').nullable()")
  })

  test('todos los nombres de constraint están dentro del límite MySQL de 64 caracteres', ({
    assert,
  }) => {
    assertIdentifierWithinLimit(assert, 'uq_system_features_module_slug', 'UNIQUE system_features')
    assertIdentifierWithinLimit(
      assert,
      'system_features_system_module_id_foreign',
      'FK system_features → system_modules (autogenerado)'
    )
  })
})

test.group(
  'Funcionalidades del sistema — migración replace_regulation_clause_features',
  () => {
    test('up elimina la tabla previa y la recrea con FK a system_features', ({ assert }) => {
      const sql = readMigration('replaceClaueFeatures')

      assert.include(sql, "protected tableName = 'regulation_clause_features'")
      assert.include(sql, 'dropTable')
      assert.include(sql, 'createTable')
      assert.include(sql, "bigIncrements('regulation_clause_feature_id')")
      assert.include(sql, ".inTable('regulation_clauses')")
      assert.include(sql, ".foreign('system_feature_id', 'fk_rcf_system_feature_id')")
      assert.include(sql, ".inTable('system_features')")
      assert.include(sql, "onDelete('RESTRICT')")
    })

    test('define ENUM coverage con total y parcial, nullable', ({ assert }) => {
      const sql = readMigration('replaceClaueFeatures')
      assert.include(
        sql,
        "enum('regulation_clause_feature_coverage', ['total', 'parcial'])"
      )
      assert.include(sql, '.nullable()')
    })

    test('define note_key como VARCHAR(150) nullable', ({ assert }) => {
      const sql = readMigration('replaceClaueFeatures')
      assert.include(sql, "string('regulation_clause_feature_note_key', 150)")
    })

    test('define UNIQUE compuesto (clause_id, feature_id) con nombre explícito', ({ assert }) => {
      const sql = readMigration('replaceClaueFeatures')
      assert.include(sql, "'regulation_clause_id', 'system_feature_id'")
      assert.include(sql, "indexName: 'uq_regulation_clause_features_clause_feature'")
    })

    test('down restituye la tabla original con slug, module, status, notes y available_since', ({
      assert,
    }) => {
      const sql = readMigration('replaceClaueFeatures')

      assert.include(sql, "string('regulation_clause_feature_slug', 100)")
      assert.include(sql, "string('regulation_clause_feature_module', 100)")
      assert.include(
        sql,
        "enum('regulation_clause_feature_status', [\n          'planeado',\n          'en_desarrollo',\n          'disponible',\n          'no_aplica',\n        ])"
      )
      assert.include(sql, "text('regulation_clause_feature_notes')")
      assert.include(sql, "string('regulation_clause_feature_available_since', 20)")
    })

    test('todos los nombres de constraint están dentro del límite MySQL de 64 caracteres', ({
      assert,
    }) => {
      assertIdentifierWithinLimit(assert, 'fk_rcf_system_feature_id', 'FK rcf → system_features')
      assertIdentifierWithinLimit(
        assert,
        'uq_regulation_clause_features_clause_feature',
        'UNIQUE rcf (clause_id, feature_id)'
      )
      assertIdentifierWithinLimit(
        assert,
        'regulation_clause_features_regulation_clause_id_foreign',
        'FK rcf → regulation_clauses (autogenerado)'
      )
    })

    test('el nombre FK autogenerado de regulation_clause_id está dentro de 64 chars', ({
      assert,
    }) => {
      const name = 'regulation_clause_features_regulation_clause_id_foreign'
      assert.isAtMost(name.length, 64, `"${name}" tiene ${name.length} chars`)
    })
  }
)
