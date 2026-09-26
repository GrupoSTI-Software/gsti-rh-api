import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1786648600061 — migración de marca de empresa del historial de
 * estatus de candidatos. Valida estructura DDL en código fuente sin
 * ejecutar MySQL (CA-1).
 */

const MIGRATIONS_DIR = join(process.cwd(), 'database/migrations')
const MIGRATION_SLUG = 'add_business_unit_id_to_career_path_candidate_status_histories'
const TABLE_NAME = 'career_path_candidate_status_histories'

function findMigrationFile(slug: string): string | undefined {
  return readdirSync(MIGRATIONS_DIR).find((f) => f.includes(slug))
}

test.group('Historial de candidatos — existencia de la migración', () => {
  test('la migración existe con timestamp posterior al rename de career_path_templates', ({
    assert,
  }) => {
    const match = findMigrationFile(MIGRATION_SLUG)
    assert.isDefined(match, `debe existir la migración ${MIGRATION_SLUG}`)
    if (!match) return

    const timestamp = Number(match.split('_')[0])
    assert.isAbove(timestamp, 1786800000020, 'debe ir después del rename de career_path_templates')
  })
})

test.group('Historial de candidatos — estructura DDL (CA-1)', () => {
  test('sigue el patrón nullable → defer(backfill) → pre-check → NOT NULL + índice + FK', ({
    assert,
  }) => {
    const match = findMigrationFile(MIGRATION_SLUG)
    assert.isDefined(match)
    if (!match) return

    const content = readFileSync(join(MIGRATIONS_DIR, match), 'utf-8')

    assert.include(content, `protected tableName = '${TABLE_NAME}'`)
    assert.notMatch(content, /await\s+this\.schema/, 'nunca await sobre this.schema (regla del proyecto)')
    assert.include(content, 'this.defer(')
    assert.include(content, ".after('career_path_candidate_id')")
    assert.include(
      content,
      'INNER JOIN \\`career_path_candidates\\` c ON c.career_path_candidate_id = h.career_path_candidate_id'
    )
    assert.include(content, 'INT UNSIGNED NOT NULL')
    assert.include(content, `${TABLE_NAME}_business_unit_id_index`)
    assert.include(content, `${TABLE_NAME}_business_unit_id_foreign`)
    assert.include(content, 'escalar a Wilvardo')
    // Nota: el docblock SÍ menciona 'COALESCE' para prohibirlo explícitamente (R-5);
    // lo que se verifica es que no aparezca en el SQL ejecutable, no en el texto libre.
    const executableSql = content.slice(content.indexOf('async up()'))
    assert.notInclude(executableSql, 'COALESCE', 'R-5: no se inventa dueño por defecto')

    const updateBlock = executableSql.match(/UPDATE[\s\S]*?WHERE \w+\.business_unit_id IS NULL/)
    assert.isNotNull(updateBlock, 'debe existir el UPDATE de backfill idempotente')
    assert.notInclude(
      updateBlock?.[0] ?? '',
      'deleted_at',
      'sin filtro de deleted_at: NOT NULL aplica también a filas soft-deleted'
    )
  })

  test('el pre-check bloqueante corre antes del MODIFY NOT NULL, no después', ({ assert }) => {
    const match = findMigrationFile(MIGRATION_SLUG)
    if (!match) {
      assert.fail('migración no encontrada')
      return
    }
    const content = readFileSync(join(MIGRATIONS_DIR, match), 'utf-8')

    const precheckIdx = content.indexOf('orphan_count')
    const modifyIdx = content.indexOf('MODIFY COLUMN')
    assert.isTrue(precheckIdx >= 0 && modifyIdx >= 0)
    assert.isTrue(precheckIdx < modifyIdx, 'el pre-check debe ir antes del MODIFY NOT NULL')
  })

  test('down() es reversible: dropForeign, dropIndex y dropColumn con nombres explícitos', ({
    assert,
  }) => {
    const match = findMigrationFile(MIGRATION_SLUG)
    if (!match) {
      assert.fail('migración no encontrada')
      return
    }
    const content = readFileSync(join(MIGRATIONS_DIR, match), 'utf-8')

    assert.include(content, 'async down()')
    assert.include(content, 'table.dropForeign(')
    assert.include(content, 'table.dropIndex(')
    assert.include(content, 'table.dropColumn(')
    assert.include(content, `'${TABLE_NAME}_business_unit_id_foreign'`)
    assert.include(content, `'${TABLE_NAME}_business_unit_id_index'`)
  })

  test('los nombres de constraint e índice caben en el límite de 64 caracteres de MySQL', ({
    assert,
  }) => {
    assert.isAtMost(`${TABLE_NAME}_business_unit_id_foreign`.length, 64)
    assert.isAtMost(`${TABLE_NAME}_business_unit_id_index`.length, 64)
  })
})
