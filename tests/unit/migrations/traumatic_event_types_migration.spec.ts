import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * Tests unitarios de la migración traumatic_event_types.
 * Validan estructura DDL en código fuente sin ejecutar MySQL.
 */

const MIGRATION_FILE = '1780500000000_create_traumatic_event_types_table.ts'
const MIGRATION_PATH = join(process.cwd(), 'database/migrations', MIGRATION_FILE)

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, 'utf-8')
}

test.group('TraumaticEventType — migración', () => {
  test('existe el archivo de migración', ({ assert }) => {
    const content = readMigration()
    assert.isAbove(content.length, 0)
  })

  test('crea tabla con PK, campos de negocio y UNIQUE en slug', ({ assert }) => {
    const sql = readMigration()

    assert.include(sql, "protected tableName = 'traumatic_event_types'")
    assert.include(sql, "increments('traumatic_event_type_id')")
    assert.include(sql, "string('traumatic_event_type_name', 100)")
    assert.include(sql, "string('traumatic_event_type_description', 500)")
    assert.include(sql, "string('traumatic_event_type_slug', 250)")
    assert.include(sql, "unique(['traumatic_event_type_slug'])")
    assert.include(sql, "tinyint('traumatic_event_type_active')")
  })

  test('define timestamps y soft delete', ({ assert }) => {
    const sql = readMigration()

    assert.include(sql, "timestamp('traumatic_event_type_created_at')")
    assert.include(sql, "timestamp('traumatic_event_type_updated_at')")
    assert.include(sql, "timestamp('traumatic_event_type_deleted_at')")
  })

  test('down() revierte con dropTable', ({ assert }) => {
    const sql = readMigration()
    assert.include(sql, 'dropTable')
  })
})
