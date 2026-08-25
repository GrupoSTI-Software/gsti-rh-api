import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1786595131490 — 4 migraciones de marca de empresa (padre → hijos).
 * Validan estructura DDL en código fuente sin ejecutar MySQL.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'database/migrations')

const TARGETS = [
  {
    migrationSlug: 'add_business_unit_id_to_traumatic_event_reports',
    tableName: 'traumatic_event_reports',
    afterColumn: 'employee_id',
    joinNeedle: 'INNER JOIN \\`employees\\` e ON e.employee_id = r.employee_id',
    expectedPrefix: 1785800000040,
  },
  {
    migrationSlug: 'add_business_unit_id_to_traumatic_event_exams',
    tableName: 'traumatic_event_exams',
    afterColumn: 'traumatic_event_report_id',
    joinNeedle:
      'INNER JOIN \\`traumatic_event_reports\\` r\n           ON r.traumatic_event_report_id = c.traumatic_event_report_id',
    expectedPrefix: 1785800000041,
  },
  {
    migrationSlug: 'add_business_unit_id_to_traumatic_event_referrals',
    tableName: 'traumatic_event_referrals',
    afterColumn: 'traumatic_event_report_id',
    joinNeedle:
      'INNER JOIN \\`traumatic_event_reports\\` r\n           ON r.traumatic_event_report_id = c.traumatic_event_report_id',
    expectedPrefix: 1785800000042,
  },
  {
    migrationSlug: 'add_business_unit_id_to_traumatic_event_report_evidences',
    tableName: 'traumatic_event_report_evidences',
    afterColumn: 'traumatic_event_report_id',
    joinNeedle:
      'INNER JOIN \\`traumatic_event_reports\\` r\n           ON r.traumatic_event_report_id = c.traumatic_event_report_id',
    expectedPrefix: 1785800000043,
  },
] as const

function findMigrationFile(slug: string): string | undefined {
  return readdirSync(MIGRATIONS_DIR).find((f) => f.includes(slug))
}

test.group('Eventos traumáticos — existencia y orden de migraciones', () => {
  test('las 4 migraciones existen en orden padre → hijos', ({ assert }) => {
    const prefixes = TARGETS.map(({ migrationSlug, expectedPrefix }) => {
      const match = findMigrationFile(migrationSlug)
      assert.isDefined(match, `debe existir la migración ${migrationSlug}`)
      const timestamp = Number((match ?? '').split('_')[0])
      assert.equal(timestamp, expectedPrefix)
      return timestamp
    })
    for (let i = 1; i < prefixes.length; i++) {
      assert.isAbove(prefixes[i], prefixes[i - 1])
    }
  })
})

test.group('Eventos traumáticos — estructura DDL', () => {
  for (const { migrationSlug, tableName, afterColumn, joinNeedle } of TARGETS) {
    test(`${migrationSlug} sigue el patrón nullable → defer(backfill) → NOT NULL + índice + FK`, ({
      assert,
    }) => {
      const match = findMigrationFile(migrationSlug)
      assert.isDefined(match)
      if (!match) return

      const content = readFileSync(join(MIGRATIONS_DIR, match), 'utf-8')

      assert.include(content, `protected tableName = '${tableName}'`)
      assert.notMatch(content, /await\s+this\.schema/)
      assert.include(content, 'this.defer(')
      assert.include(content, `.after('${afterColumn}')`)
      assert.include(content, joinNeedle)
      assert.include(content, 'INT UNSIGNED NOT NULL')
      assert.include(content, `${tableName}_business_unit_id_index`)
      assert.include(content, `${tableName}_business_unit_id_foreign`)
      assert.include(content, 'escalar a Wilvardo')
      assert.notInclude(content, 'COALESCE')
      const updateBlock = content.match(/UPDATE[\s\S]*?WHERE \w+\.business_unit_id IS NULL/)
      assert.isNotNull(updateBlock, 'debe existir el UPDATE de backfill')
      assert.notInclude(updateBlock?.[0] ?? '', 'deleted_at')
      assert.include(content, 'dropForeign')
      assert.include(content, 'dropColumn')
    })
  }
})
