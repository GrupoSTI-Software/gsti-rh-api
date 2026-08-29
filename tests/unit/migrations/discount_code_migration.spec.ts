import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * USRH1787714804397 — DDL del catálogo de códigos de descuento.
 * Verifica por contenido (sin tocar BD compartida) que la migración
 * declara las reglas de unicidad/inmutabilidad esperadas.
 */

const MIGRATION_PATH =
  'database/migrations/1787699700000000_create_discount_codes_table.ts'

test.group('create_discount_codes_table — estructura', () => {
  test('declara UNIQUE sobre discount_code_code (regla 3: irrepetible)', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), MIGRATION_PATH), 'utf8')
    assert.include(content, "table.unique(['discount_code_code'], 'uq_discount_code_code')")
  })

  test('discount_code_redeemed_count nace en 0 y no es nullable', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), MIGRATION_PATH), 'utf8')
    const block = content.match(
      /table\s*\n\s*\.integer\('discount_code_redeemed_count'\)[\s\S]*?comment\([^)]*\)/
    )?.[0]
    assert.exists(block)
    assert.include(block ?? '', '.notNullable()')
    assert.include(block ?? '', '.defaultTo(0)')
  })

  test('discount_code_active nace en 1 (activo por defecto)', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), MIGRATION_PATH), 'utf8')
    const block = content.match(
      /table\s*\n\s*\.tinyint\('discount_code_active'\)[\s\S]*?comment\([^)]*\)/
    )?.[0]
    assert.exists(block)
    assert.include(block ?? '', '.defaultTo(1)')
  })

  test('discount_code_deleted_at es soft-delete de limpieza, sin endpoint (comentario explícito)', async ({
    assert,
  }) => {
    const content = await readFile(join(process.cwd(), MIGRATION_PATH), 'utf8')
    assert.include(content, "table\n        .timestamp('discount_code_deleted_at')")
    assert.include(content, 'sin endpoint en esta HU')
  })

  test('down() elimina la tabla completa (creación pura, sin backfill que revertir)', async ({
    assert,
  }) => {
    const content = await readFile(join(process.cwd(), MIGRATION_PATH), 'utf8')
    const downBlock = content.slice(content.indexOf('async down()'))
    assert.include(downBlock, 'this.schema.dropTable(this.tableName)')
  })

  test('no usa this.defer() — es tabla nueva, no hay backfill de negocio', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), MIGRATION_PATH), 'utf8')
    assert.notInclude(content, 'this.defer(')
  })
})
