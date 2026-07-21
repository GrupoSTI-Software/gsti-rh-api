import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { assertModelHasColumns } from '../helpers/lucid_model_assertions.js'
import WorkDisabilityNote from '#models/work_disability_note'
import WorkDisabilityPeriod from '#models/work_disability_period'
import WorkDisabilityPeriodExpense from '#models/work_disability_period_expense'

/**
 * USRH1784259058498 — hijos encadenados de incapacidades: marca propia con
 * backfill multi-salto y hook desde el padre inmediato (no empleado).
 */

const MODELS_DIR = join(process.cwd(), 'app/models')
const MIGRATIONS_DIR = join(process.cwd(), 'database/migrations')

const TARGETS = [
  {
    fileName: 'work_disability_note.ts',
    Model: WorkDisabilityNote,
    migrationSlug: 'add_business_unit_id_to_work_disability_notes',
    parentLabel: 'la incapacidad',
    joinChain: 'INNER JOIN \\`work_disabilities\\` wd',
  },
  {
    fileName: 'work_disability_period.ts',
    Model: WorkDisabilityPeriod,
    migrationSlug: 'add_business_unit_id_to_work_disability_periods',
    parentLabel: 'la incapacidad',
    joinChain: 'INNER JOIN \\`work_disabilities\\` wd',
  },
  {
    fileName: 'work_disability_period_expense.ts',
    Model: WorkDisabilityPeriodExpense,
    migrationSlug: 'add_business_unit_id_to_work_disability_period_expenses',
    parentLabel: 'el periodo de incapacidad',
    joinChain: 'INNER JOIN \\`work_disability_periods\\` wdp',
  },
] as const

test.group('Hijos de incapacidades — modelos componen withBusinessUnitScope', () => {
  for (const { fileName, Model, parentLabel } of TARGETS) {
    test(`${fileName} importa mixin, columna y hook desde padre inmediato`, ({ assert }) => {
      const content = readFileSync(join(MODELS_DIR, fileName), 'utf-8')
      assert.include(content, 'withBusinessUnitScope()')
      assertModelHasColumns(assert, Model, ['businessUnitId'])
      assert.include(content, '@beforeCreate()')
      assert.include(content, 'resolveParentBusinessUnitId(')
      assert.include(content, parentLabel)
      // No debe resolver vía Employee en el hook (patrón distinto al de un salto).
      assert.notMatch(content, /resolveParentBusinessUnitId\(\s*\(\)\s*=>\s*Employee\.query/)
    })
  }
})

test.group('Hijos de incapacidades — migraciones multi-salto', () => {
  for (const { migrationSlug, joinChain } of TARGETS) {
    test(`${migrationSlug} encadena JOIN hasta employees sin filtrar deleted_at de padres`, ({
      assert,
    }) => {
      const migrationFiles = readdirSync(MIGRATIONS_DIR)
      const match = migrationFiles.find((f) => f.includes(migrationSlug))
      assert.isDefined(match, `debe existir la migración ${migrationSlug}`)
      if (!match) return

      const content = readFileSync(join(MIGRATIONS_DIR, match), 'utf-8')
      assert.notMatch(content, /await\s+this\.schema/)
      assert.include(content, 'this.defer(')
      assert.include(content, joinChain)
      assert.include(content, 'INNER JOIN \\`employees\\` e ON e.employee_id = wd.employee_id')
      assert.include(content, 'NOT NULL')
      // Crítico: no filtrar soft-delete de padres (dejaría NULLs).
      assert.notInclude(content, 'work_disability_deleted_at')
      assert.notInclude(content, 'work_disability_period_deleted_at')
    })
  }
})
