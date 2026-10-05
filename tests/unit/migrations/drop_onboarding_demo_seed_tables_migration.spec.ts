import { test } from '@japa/runner'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * USRH1789079078168 — DDL de baja de la siembra demo del onboarding.
 * Verifica por contenido (sin tocar BD compartida, la suite no migra —
 * `tests/bootstrap.ts:46`) que la migración es fail-closed: precheck de las
 * tres condiciones ANTES de cualquier DDL, sin datos personales en el
 * mensaje de error, guardas de idempotencia y un `down()` que nunca inserta.
 *
 * Localiza el archivo por SUFIJO (no por prefijo fijo): el prefijo es
 * `Date.now()` al momento de `make:migration` y no se conoce de antemano.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'database/migrations')
const SUFFIX = '_drop_onboarding_demo_seed_tables.ts'

async function readMigrationContent(): Promise<string> {
  const files = await readdir(MIGRATIONS_DIR)
  const matches = files.filter((f) => f.endsWith(SUFFIX))
  if (matches.length !== 1) {
    throw new Error(
      `Se esperaba exactamente un archivo terminado en "${SUFFIX}" en ${MIGRATIONS_DIR}, se encontraron ${matches.length}: ${matches.join(', ')}`
    )
  }
  return readFile(join(MIGRATIONS_DIR, matches[0]), 'utf8')
}

test.group('drop_onboarding_demo_seed_tables — estructura', () => {
  test('existe exactamente un archivo de migración con el sufijo esperado', async ({ assert }) => {
    const files = await readdir(MIGRATIONS_DIR)
    const matches = files.filter((f) => f.endsWith(SUFFIX))
    assert.lengthOf(matches, 1)
  })

  test('el precheck (throw) va ANTES de cualquier DDL (DROP TABLE / DROP COLUMN)', async ({
    assert,
  }) => {
    const content = await readMigrationContent()
    const throwIndex = content.indexOf('throw new Error')
    const dropTableIndex = content.indexOf('DROP TABLE')
    const dropColumnIndex = content.indexOf('DROP COLUMN')
    assert.isAbove(throwIndex, -1)
    assert.isAbove(dropTableIndex, -1)
    assert.isAbove(dropColumnIndex, -1)
    assert.isBelow(throwIndex, dropTableIndex)
    assert.isBelow(throwIndex, dropColumnIndex)
  })

  test('cubre las tres condiciones: (a) filas de constancia, (b) estados sembrados sin limpiar, (c) usuarios demo por correo', async ({
    assert,
  }) => {
    const content = await readMigrationContent()
    assert.include(content, 'onboarding_seeded_records')
    assert.include(content, 'IS NOT NULL AND')
    assert.include(content, 'IS NULL')
    assert.include(content, 'demo+bu%@onboarding.valanserh.invalid')
  })

  test('el mensaje del precheck no interpola user_email, user_id ni onboarding_user_state_id (S6)', async ({
    assert,
  }) => {
    const content = await readMigrationContent()
    const throwBlock = content.slice(
      content.indexOf('if (offenders.length > 0)'),
      content.indexOf('// Hija primero')
    )
    assert.notMatch(throwBlock, /\$\{[^}]*user_email[^}]*\}/)
    assert.notMatch(throwBlock, /\$\{[^}]*user_id[^}]*\}/)
    assert.notMatch(throwBlock, /\$\{[^}]*onboarding_user_state_id[^}]*\}/)

    // Los tres `offenders.push` tampoco interpolan esos campos directamente.
    const pushBlocks = content.match(/offenders\.push\(`[^`]*`\)/g) ?? []
    assert.isAbove(pushBlocks.length, 0)
    for (const block of pushBlocks) {
      assert.notMatch(block, /\$\{[^}]*user_email[^}]*\}/)
      assert.notMatch(block, /\$\{[^}]*\bu\.user_id\b[^}]*\}/)
      assert.notMatch(block, /\$\{[^}]*onboarding_user_state_id[^}]*\}/)
    }
  })

  test('usa guardas de idempotencia contra information_schema.TABLES e information_schema.COLUMNS', async ({
    assert,
  }) => {
    const content = await readMigrationContent()
    assert.include(content, 'information_schema.TABLES')
    assert.include(content, 'information_schema.COLUMNS')
  })

  test('down() no inserta datos (S7): recrea estructura vacía, nunca contenido', async ({
    assert,
  }) => {
    const content = await readMigrationContent()
    const downBlock = content.slice(content.indexOf('async down()'))
    assert.notInclude(downBlock, 'INSERT')
    assert.notInclude(downBlock, '.insert(')
  })

  test('la clave de error del precheck es la exacta del spec', async ({ assert }) => {
    const content = await readMigrationContent()
    assert.include(content, 'no-se-puede-dar-de-baja-la-siembra-demo')
  })
})
