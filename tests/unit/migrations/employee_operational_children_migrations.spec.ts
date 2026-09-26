import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1784259058533 — migraciones de aislamiento de los 6 hijos operativos
 * directos del empleado (patrón espejo de `1783300000014_...employee_shifts`).
 * Validan estructura DDL en código fuente sin ejecutar MySQL.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'database/migrations')

const TARGETS = [
  {
    migrationSlug: 'add_business_unit_id_to_employee_branch_offices',
    tableName: 'employee_branch_offices',
  },
  {
    migrationSlug: 'add_business_unit_id_to_employee_temporary_assignments',
    tableName: 'employee_temporary_assignments',
  },
  {
    migrationSlug: 'add_business_unit_id_to_vacation_deductions',
    tableName: 'vacation_deductions',
  },
  {
    migrationSlug: 'add_business_unit_id_to_employee_proceeding_files_types',
    tableName: 'employee_proceeding_files_types',
  },
  {
    migrationSlug: 'add_business_unit_id_to_user_responsible_employees',
    tableName: 'user_responsible_employees',
  },
  {
    migrationSlug: 'add_business_unit_id_to_access_point_employees',
    tableName: 'access_point_employees',
  },
] as const

function findMigrationFile(slug: string): string | undefined {
  return readdirSync(MIGRATIONS_DIR).find((f) => f.includes(slug))
}

test.group('Hijos operativos del empleado — existencia y orden de migraciones', () => {
  test('las 6 migraciones existen', ({ assert }) => {
    for (const { migrationSlug } of TARGETS) {
      const match = findMigrationFile(migrationSlug)
      assert.isDefined(match, `debe existir la migración ${migrationSlug}`)
    }
  })

  test('las 6 migraciones tienen timestamp posterior a la última migración previa a esta HU (1784300000015)', ({
    assert,
  }) => {
    for (const { migrationSlug } of TARGETS) {
      const match = findMigrationFile(migrationSlug)
      if (!match) continue
      const timestamp = Number(match.split('_')[0])
      assert.isAbove(timestamp, 1784300000015)
    }
  })
})

test.group('Hijos operativos del empleado — estructura DDL (patrón employee_shifts)', () => {
  for (const { migrationSlug, tableName } of TARGETS) {
    test(`${migrationSlug} sigue el patrón: nullable → defer(backfill) → NOT NULL + índice + FK`, ({
      assert,
    }) => {
      const match = findMigrationFile(migrationSlug)
      assert.isDefined(match)
      if (!match) return

      const content = readFileSync(join(MIGRATIONS_DIR, match), 'utf-8')

      assert.include(content, `protected tableName = '${tableName}'`)

      // Regla del proyecto (CLAUDE.md): nunca `await this.schema` dentro de up()/down().
      assert.notMatch(content, /await\s+this\.schema/)

      // Columna nullable en un primer paso síncrono.
      assert.match(content, /business_unit_id.*\.unsigned\(\)\.nullable\(\)/)

      // Backfill diferido, 1 salto directo a employees por employee_id.
      // (contenido fuente en template literal: backtick escapado con backslash)
      assert.include(content, 'this.defer(')
      assert.include(
        content,
        'INNER JOIN \\`employees\\` e ON e.employee_id = child.employee_id'
      )
      assert.include(content, 'SET child.business_unit_id = e.business_unit_id')

      // Backfill no debe filtrar soft-deleted del hijo: cubre borrados lógicos.
      assert.notMatch(content, /WHERE\s+child\.\w*deleted_at/i)

      // NOT NULL + índice + FK a business_units.
      assert.include(content, 'MODIFY COLUMN \\`business_unit_id\\` INT UNSIGNED NOT NULL')
      assert.include(content, `ADD INDEX \\\`${tableName}_business_unit_id_index\\\``)
      assert.include(content, `ADD CONSTRAINT \\\`${tableName}_business_unit_id_foreign\\\``)
      assert.include(content, 'REFERENCES \\`business_units\\` (\\`business_unit_id\\`)')
    })

    test(`${migrationSlug} define down() reversible sin fallos (drop FK, índice, columna)`, ({
      assert,
    }) => {
      const match = findMigrationFile(migrationSlug)
      assert.isDefined(match)
      if (!match) return

      const content = readFileSync(join(MIGRATIONS_DIR, match), 'utf-8')

      assert.include(content, 'async down()')
      // Robusto a que el nombre de constraint/índice se envuelva en varias líneas.
      assert.match(
        content,
        new RegExp(
          `dropForeign\\(\\s*\\['business_unit_id'\\],\\s*'${tableName}_business_unit_id_foreign'\\s*\\)`
        )
      )
      assert.match(
        content,
        new RegExp(
          `dropIndex\\(\\s*\\['business_unit_id'\\],\\s*'${tableName}_business_unit_id_index'\\s*\\)`
        )
      )
      assert.include(content, "dropColumn('business_unit_id')")
    })
  }
})
