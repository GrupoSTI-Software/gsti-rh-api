import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * Tests unitarios de las migraciones del marco regulatorio.
 * Validan estructura DDL en código fuente sin ejecutar MySQL.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'database/migrations')

const MIGRATION_FILES = {
  authorities: '1779139614038_create_regulatory_authorities_table.ts',
  regulations: '1779139614039_create_regulations_table.ts',
  clauses: '1779139614040_create_regulation_clauses_table.ts',
  features: '1779139614041_create_regulation_clause_features_table.ts',
  evidence: '1779139614042_create_regulation_evidence_requirements_table.ts',
} as const

function readMigration(key: keyof typeof MIGRATION_FILES): string {
  return readFileSync(join(MIGRATIONS_DIR, MIGRATION_FILES[key]), 'utf-8')
}

test.group('Marco regulatorio — orden y existencia de migraciones', () => {
  test('existen las 5 migraciones en orden de dependencia FK', ({ assert }) => {
    const timestamps = Object.values(MIGRATION_FILES).map((file) =>
      Number(file.split('_')[0])
    )

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

test.group('Marco regulatorio — migración regulatory_authorities', () => {
  test('crea tabla con PK bigIncrements y slug UNIQUE', ({ assert }) => {
    const sql = readMigration('authorities')

    assert.include(sql, "protected tableName = 'regulatory_authorities'")
    assert.include(sql, "bigIncrements('regulatory_authority_id')")
    assert.include(sql, "regulatory_authority_slug', 50).notNullable().unique()")
    assert.include(sql, "enum('regulatory_authority_jurisdiction', ['federal', 'local', 'estatal'])")
    assert.include(sql, "timestamp('created_at').notNullable()")
    assert.include(sql, "timestamp('deleted_at').nullable()")
  })
})

test.group('Marco regulatorio — migración regulations', () => {
  test('FK a regulatory_authorities y UNIQUE compuesto tripleta', ({ assert }) => {
    const sql = readMigration('regulations')

    assert.include(sql, "protected tableName = 'regulations'")
    assert.include(sql, "bigIncrements('regulation_id')")
    assert.include(sql, ".inTable('regulatory_authorities')")
    assert.include(sql, "onDelete('RESTRICT')")
    assert.include(
      sql,
      "unique(['regulatory_authority_id', 'regulation_code', 'regulation_version']"
    )
    assert.include(
      sql,
      "enum('regulation_type', ['NOM', 'NMX', 'LEY', 'REGLAMENTO', 'ACUERDO', 'RESOLUCION'])"
    )
    assert.include(sql, "enum('regulation_status', ['vigente', 'modificada', 'derogada'])")
  })
})

test.group('Marco regulatorio — migración regulation_clauses', () => {
  test('FK a regulations, self-reference y UNIQUE (regulation_id, code)', ({ assert }) => {
    const sql = readMigration('clauses')

    assert.include(sql, "protected tableName = 'regulation_clauses'")
    assert.include(sql, "bigIncrements('regulation_clause_id')")
    assert.include(sql, ".inTable('regulations')")
    assert.include(sql, "parent_regulation_clause_id'")
    assert.include(sql, ".inTable('regulation_clauses')")
    assert.include(sql, "unique(['regulation_id', 'regulation_clause_code']")
    assert.include(sql, 'regulation_clause_obligation_key')
    assert.include(sql, 'regulation_clause_audit_criteria_key')
  })
})

test.group('Marco regulatorio — migración regulation_clause_features', () => {
  test('FK a regulation_clauses y ENUM de status', ({ assert }) => {
    const sql = readMigration('features')

    assert.include(sql, "protected tableName = 'regulation_clause_features'")
    assert.include(sql, ".inTable('regulation_clauses')")
    assert.include(
      sql,
      "enum('regulation_clause_feature_status', [\n          'planeado',\n          'en_desarrollo',\n          'disponible',\n          'no_aplica',\n        ])"
    )
  })
})

test.group('Marco regulatorio — migración regulation_evidence_requirements', () => {
  test('FK a regulation_clauses y ENUM de tipo de evidencia', ({ assert }) => {
    const sql = readMigration('evidence')

    assert.include(sql, "protected tableName = 'regulation_evidence_requirements'")
    assert.include(sql, ".inTable('regulation_clauses')")
    assert.include(
      sql,
      "enum('regulation_evidence_requirement_type', [\n          'documento',\n          'registro',\n          'bitacora',\n          'reporte',\n          'formulario',\n        ])"
    )
    assert.include(sql, 'regulation_evidence_requirement_retention_years')
  })
})
