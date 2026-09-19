import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * Endurecimiento de `employees.employee_slug` a token opaco.
 *
 * El slug pasa de ser derivado (`nombre---codigoNomina---id`, que filtraba PII
 * al historial del navegador, a los logs de proxy y al header `Referer`) a un
 * UUIDv4 sin relación con los datos del empleado.
 *
 * La migración acota la columna para poder indexarla: el `varchar(255)` previo
 * heredaba el charset utf8mb4 de la tabla, así que un UNIQUE sobre él ocupaba
 * 1020 bytes por entrada. `CHAR(36) CHARACTER SET ascii` lo baja a 36.
 *
 * A diferencia de `business_units` (que usa columna generada VIRTUAL + UNIQUE
 * para liberar el slug al borrar lógicamente), aquí el UNIQUE es plano: un UUID
 * nunca se quiere reutilizar, y que el slug de un empleado dado de baja quede
 * ocupado para siempre es el comportamiento deseado.
 *
 * Valida el DDL en el código fuente, sin ejecutar MySQL.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'database/migrations')
const MIGRATION_SLUG = 'harden_employee_slug_to_uuid'

function findMigrationFile(slug: string): string | undefined {
  return readdirSync(MIGRATIONS_DIR).find((f) => f.includes(slug))
}

function readMigration(): string {
  const match = findMigrationFile(MIGRATION_SLUG)
  if (!match) return ''
  return readFileSync(join(MIGRATIONS_DIR, match), 'utf-8')
}

test.group('employee_slug — endurecimiento a UUID opaco', () => {
  test('la migración existe con prefijo posterior a la última previa', ({ assert }) => {
    const match = findMigrationFile(MIGRATION_SLUG)
    assert.isDefined(match, `debe existir la migración ${MIGRATION_SLUG}`)
    const timestamp = Number(match!.split('_')[0])
    assert.isAbove(timestamp, 1789757797666)
  })

  test('rellena los slugs existentes antes de aplicar las restricciones', ({ assert }) => {
    const source = readMigration()
    const backfillAt = source.search(/UPDATE[\s\S]*?\$\{COLUMN\}/)
    const modifyAt = source.search(/MODIFY[\s\S]*?\$\{COLUMN\}/)
    assert.isAbove(backfillAt, -1, 'debe existir el UPDATE de backfill')
    assert.isAbove(modifyAt, -1, 'debe existir el MODIFY de la columna')
    assert.isBelow(backfillAt, modifyAt, 'el backfill va antes del NOT NULL')
  })

  test('el backfill genera UUIDv4, no el v1 de MySQL', ({ assert }) => {
    const source = readMigration()

    assert.include(
      source,
      'randomUUID',
      'el relleno usa la misma fuente que el hook del modelo'
    )
    assert.notMatch(
      source,
      /=\s*UUID\(\)/i,
      'UUID() de MySQL emite v1: timestamp mas la MAC del servidor, adivinable por proximidad temporal'
    )
    assert.notMatch(
      source,
      /UUID_TO_BIN|uuid_v7|UUIDv7/i,
      'v7 lleva un timestamp ordenable al frente: revela cuando se dio de alta al empleado'
    )
  })

  test('el backfill tambien reemplaza tokens de otra version ya guardados', ({ assert }) => {
    const source = readMigration()

    assert.match(
      source,
      /SUBSTRING\([\s\S]*?,\s*15,\s*1\)\s*<>\s*'4'/,
      'el criterio mira el nibble de version para recuperar filas con un UUID que no sea v4'
    )
    assert.match(source, /CHAR_LENGTH\([\s\S]*?\)\s*<>\s*36/, 'y descarta lo que no mida 36')
  })

  test('la columna queda CHAR(36) ascii ascii_bin NOT NULL', ({ assert }) => {
    const source = readMigration()
    assert.match(source, /CHAR\(36\)/i, 'largo exacto del UUID canónico')
    assert.match(source, /CHARACTER SET ascii/i, 'evita los 4 bytes por char de utf8mb4 en el índice')
    assert.match(source, /COLLATE ascii_bin/i, 'el identificador opaco compara exacto')
    assert.match(source, /NOT NULL/i)
  })

  test('agrega un UNIQUE plano, sin columna generada', ({ assert }) => {
    const source = readMigration()
    assert.match(source, /ADD UNIQUE KEY/i)
    assert.notMatch(
      source,
      /GENERATED ALWAYS AS/i,
      'un UUID no se reutiliza: no aplica el patrón de business_units'
    )
  })

  test('el down() tolera estado parcial', ({ assert }) => {
    const source = readMigration()
    assert.match(source, /information_schema/i, 'verifica existencia antes de cada DROP')
    assert.match(source, /DROP INDEX/i)
  })

  test('ya no queda generación de slug derivada del nombre', ({ assert }) => {
    const service = readFileSync(join(process.cwd(), 'app/services/employee_service.ts'), 'utf-8')
    assert.notMatch(
      service,
      /---\$\{payrollPart\}---/,
      'el slug ya no concatena nombre, código de nómina ni id'
    )
    assert.notInclude(
      service,
      'normalizeSlugSegment',
      'el helper de normalización del slug derivado queda huérfano'
    )
  })
})
