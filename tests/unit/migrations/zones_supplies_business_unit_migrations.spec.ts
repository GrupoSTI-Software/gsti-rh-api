import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * Seis migraciones de aislamiento de Zonas y del catálogo de activos.
 * Validan el DDL leyendo el código fuente, sin ejecutar MySQL.
 *
 * A diferencia de tandas anteriores, estas NO tocan datos: la columna entra
 * NULLABLE y el relleno vive en `backfill:zones-supplies-business-unit`, que
 * aborta si hay más de una empresa viva en vez de adivinar. El NOT NULL se
 * impondrá después, cuando el backfill haya corrido en todos los entornos.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'database/migrations')

const TARGETS = [
  { migrationSlug: 'add_business_unit_id_to_zones', tableName: 'zones', afterColumn: 'zone_id' },
  {
    migrationSlug: 'add_business_unit_id_to_supply_types',
    tableName: 'supply_types',
    afterColumn: 'supply_type_id',
  },
  {
    migrationSlug: 'add_business_unit_id_to_supplies',
    tableName: 'supplies',
    afterColumn: 'supply_id',
  },
  {
    migrationSlug: 'add_business_unit_id_to_supplie_caracteristics',
    tableName: 'supplie_caracteristics',
    afterColumn: 'supplie_caracteristic_id',
  },
  {
    migrationSlug: 'add_business_unit_id_to_supplie_caracteristic_values',
    tableName: 'supplie_caracteristic_values',
    afterColumn: 'supplie_caracteristic_value_id',
  },
  {
    migrationSlug: 'add_business_unit_id_to_supply_value_histories',
    tableName: 'supply_value_histories',
    afterColumn: 'supply_value_history_id',
  },
] as const

/** Distingue `add_business_unit_id_to_supplies` de `..._to_supply_value_histories`. */
function findMigrationFile(slug: string): string | undefined {
  return readdirSync(MIGRATIONS_DIR).find((file) => file.endsWith(`_${slug}.ts`))
}

test.group('Zonas y activos — existencia y prefijo de las migraciones', () => {
  test('las seis existen con prefijo de 13 dígitos', ({ assert }) => {
    const faltantes = TARGETS.filter(({ migrationSlug }) => !findMigrationFile(migrationSlug)).map(
      ({ migrationSlug }) => migrationSlug
    )
    assert.deepEqual(faltantes, [])

    const prefijosInvalidos = TARGETS.map(({ migrationSlug }) => findMigrationFile(migrationSlug))
      .filter((file): file is string => file !== undefined)
      .filter((file) => !/^[0-9]{13}_/.test(file))

    assert.deepEqual(prefijosInvalidos, [])
  })
})

test.group('Zonas y activos — estructura DDL de las migraciones', () => {
  for (const { migrationSlug, tableName, afterColumn } of TARGETS) {
    test(`${migrationSlug} agrega la columna nullable con índice y FK, sin tocar datos`, ({
      assert,
    }) => {
      const match = findMigrationFile(migrationSlug)
      assert.isDefined(match)
      if (!match) return

      const content = readFileSync(join(MIGRATIONS_DIR, match), 'utf8')

      assert.include(content, `protected tableName = '${tableName}'`)
      // `await this.schema` ejecuta el SQL dos veces (ver CLAUDE.md).
      assert.notMatch(content, /await\s+this\.schema/)
      assert.include(content, `.after('${afterColumn}')`)
      assert.include(content, '.nullable()')
      assert.include(content, `${tableName}_business_unit_id_index`)
      assert.include(content, `${tableName}_business_unit_id_foreign`)
      assert.include(content, "'business_units'")

      // Sin datos: ni backfill diferido ni SQL crudo. Y sin imponer NOT NULL
      // todavía (eso va en otra migración, cuando el backfill haya corrido).
      assert.notInclude(content, 'this.defer(')
      assert.notInclude(content, 'rawQuery')
      assert.notInclude(content, 'this.schema.raw')
      assert.notInclude(content, '.notNullable()')
      assert.notInclude(content, 'MODIFY COLUMN')

      // La reversa deja la tabla como estaba.
      assert.include(content, 'dropForeign')
      assert.include(content, 'dropIndex')
      assert.include(content, 'dropColumn')

      // El porqué del nullable y quién lo rellena, en el propio archivo.
      assert.include(content, 'backfill:zones-supplies-business-unit')
    })
  }
})
