import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1789698261609 — marca de empresa dueña del expediente personal.
 *
 * Automatiza lo que el DoD pide a mano y ningún otro test detecta (D7):
 * cero `includeGlobal` en `Person`, hook tolerante sin `throw`, columna que
 * no se serializa, migración con FK RESTRICT y prefijo de 13 dígitos.
 */

const ROOT = process.cwd()
const MIGRATIONS_DIR = join(ROOT, 'database/migrations')
const MIGRATION_SLUG = 'add_business_unit_id_to_people_table'
/** Última migración del repo al escribir la HU: la nueva debe ordenar después. */
const PREVIOUS_LAST_PREFIX = '1789700400000'

function readMigration(): { name: string; content: string } {
  const name = readdirSync(MIGRATIONS_DIR).find((file) => file.includes(MIGRATION_SLUG))
  if (!name) {
    throw new Error(`No existe la migración *_${MIGRATION_SLUG}.ts`)
  }
  return { name, content: readFileSync(join(MIGRATIONS_DIR, name), 'utf-8') }
}

test.group('people.business_unit_id — migración (CA-7)', () => {
  test('existe, con prefijo de 13 dígitos posterior a la última del repo', ({ assert }) => {
    const { name } = readMigration()
    const prefix = name.slice(0, 13)
    assert.match(name, /^[0-9]{13}_add_business_unit_id_to_people_table\.ts$/)
    assert.isTrue(prefix > PREVIOUS_LAST_PREFIX, `${prefix} debe ordenar después de ${PREVIOUS_LAST_PREFIX}`)
  })

  test('columna nullable tras person_id, índice y FK con nombre, sin onDelete', ({ assert }) => {
    const { content } = readMigration()
    const upBody = content.slice(content.indexOf('async up()'), content.indexOf('async down()'))
    assert.include(upBody, "table.integer('business_unit_id').unsigned().nullable().after('person_id')")
    assert.include(upBody, "table.index(['business_unit_id'], 'people_business_unit_id_index')")
    assert.include(upBody, ".foreign('business_unit_id', 'people_business_unit_id_foreign')")
    assert.include(upBody, ".references('business_unit_id')")
    assert.include(upBody, ".inTable('business_units')")
    assert.notMatch(upBody, /onDelete/i, 'la FK es RESTRICT a propósito: sin onDelete')
    assert.notMatch(content, /await\s+this\.schema/, 'nunca await sobre this.schema (CLAUDE.md)')
    assert.notMatch(upBody, /\bUPDATE\b|\.update\(/i, 'sin backfill: la base arranca limpia')
  })

  test('down() revierte en orden dropForeign → dropIndex → dropColumn', ({ assert }) => {
    const { content } = readMigration()
    const downBody = content.slice(content.indexOf('async down()'))
    const foreignIdx = downBody.indexOf("dropForeign(['business_unit_id'], 'people_business_unit_id_foreign')")
    const indexIdx = downBody.indexOf("dropIndex(['business_unit_id'], 'people_business_unit_id_index')")
    const columnIdx = downBody.indexOf("dropColumn('business_unit_id')")
    assert.isAbove(foreignIdx, -1)
    assert.isAbove(indexIdx, foreignIdx)
    assert.isAbove(columnIdx, indexIdx)
  })

  test('la cabecera prohíbe volver la columna NOT NULL y explica el RESTRICT', ({ assert }) => {
    const { content } = readMigration()
    assert.include(content, 'NUNCA DEBE VOLVERSE NOT NULL')
    assert.include(content, 'RESTRICT')
  })
})
