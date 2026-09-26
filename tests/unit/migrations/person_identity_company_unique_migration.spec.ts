import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1789698261610 — unicidad de RFC, CURP y NSS por empresa entre vivos.
 * El censo aborta ANTES de cualquier DDL (cada ALTER hace commit implícito).
 * El reporte nunca proyecta valores en claro: solo empresa, conteo y person_id.
 */

const ROOT = process.cwd()
const MIGRATIONS_DIR = join(ROOT, 'database/migrations')
const MIGRATION_SLUG = 'add_person_identity_active_uniques_to_people_table'
const PREVIOUS_LAST_PREFIX = '1790089196691'

function readMigration(): { name: string; content: string } {
  const name = readdirSync(MIGRATIONS_DIR).find((file) => file.includes(MIGRATION_SLUG))
  if (!name) {
    throw new Error(`No existe la migración *_${MIGRATION_SLUG}.ts`)
  }
  return { name, content: readFileSync(join(MIGRATIONS_DIR, name), 'utf-8') }
}

test.group('unicidad identidad por empresa — migración', () => {
  test('existe, con prefijo de 13 dígitos posterior a la última del repo', ({ assert }) => {
    const { name } = readMigration()
    const prefix = name.slice(0, 13)
    assert.match(name, /^[0-9]{13}_add_person_identity_active_uniques_to_people_table\.ts$/)
    assert.isTrue(prefix > PREVIOUS_LAST_PREFIX, `${prefix} debe ordenar después de ${PREVIOUS_LAST_PREFIX}`)
  })

  test('el censo va en defer y corre antes que cualquier DDL', ({ assert }) => {
    const { content } = readMigration()
    const upBody = content.slice(content.indexOf('async up()'), content.indexOf('async down()'))
    const deferIdx = upBody.indexOf('this.defer')
    assert.isAbove(deferIdx, -1, 'el censo vive en this.defer')
    assert.isBelow(deferIdx, upBody.indexOf('ADD COLUMN'), 'el censo se registra antes que el DDL')
    assert.notMatch(content, /await\s+this\.schema/, 'nunca await sobre this.schema (CLAUDE.md)')
    assert.notMatch(upBody, /\bUPDATE\b|\.update\(/i, 'sin backfill ni saneo: regla 11')
  })

  test('tres generadas VIRTUAL condicionadas a vivo + tres UNIQUE compuestos', ({ assert }) => {
    const { content } = readMigration()
    for (const hash of ['person_rfc_hash', 'person_curp_hash', 'person_imss_nss_hash']) {
      const active = hash.replace('_hash', '_active')
      assert.include(content, `ADD COLUMN \`${active}\` VARCHAR(64)`)
      assert.include(content, 'GENERATED ALWAYS AS')
      assert.include(content, ') VIRTUAL')
    }
    assert.include(content, 'ADD UNIQUE KEY `people_rfc_company_unique` (`business_unit_id`, `person_rfc_active`)')
    assert.include(content, 'ADD UNIQUE KEY `people_curp_company_unique` (`business_unit_id`, `person_curp_active`)')
    assert.include(
      content,
      'ADD UNIQUE KEY `people_imss_nss_company_unique` (`business_unit_id`, `person_imss_nss_active`)'
    )
  })

  test('el reporte lista person_id y empresa, nunca valores en claro', ({ assert }) => {
    const { content } = readMigration()
    assert.include(content, 'person_id=')
    assert.notInclude(content, '`person_rfc`')
    assert.notInclude(content, '`person_curp`')
    assert.notInclude(content, '`person_imss_nss`')
    assert.notInclude(content, '`person_email`')
  })

  test('down() tolerante a estado parcial vía information_schema', ({ assert }) => {
    const { content } = readMigration()
    const downBody = content.slice(content.indexOf('async down()'))
    assert.include(downBody, 'information_schema.STATISTICS')
    assert.include(downBody, 'information_schema.COLUMNS')
    assert.include(downBody, 'people_rfc_company_unique')
    assert.include(downBody, 'people_curp_company_unique')
    assert.include(downBody, 'people_imss_nss_company_unique')
  })
})
