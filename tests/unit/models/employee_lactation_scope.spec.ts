import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { assertModelHasColumns } from '../helpers/lucid_model_assertions.js'
import EmployeeLactationPeriod from '#models/employee_lactation_period'
import EmployeeLactationPeriodEvidence from '#models/employee_lactation_period_evidence'
import EmployeeLactationPeriodNotification from '#models/employee_lactation_period_notification'

/**
 * USRH1784259058510 — dominio de lactancia: marca propia + mixin.
 * Periodos: 1 salto desde empleada. Evidencias/avisos: 2 saltos vía periodo.
 */

const MODELS_DIR = join(process.cwd(), 'app/models')
const MIGRATIONS_DIR = join(process.cwd(), 'database/migrations')

const TARGETS = [
  {
    fileName: 'employee_lactation_period.ts',
    Model: EmployeeLactationPeriod,
    migrationSlug: 'add_business_unit_id_to_employee_lactation_periods',
    parentLabel: 'la empleada',
    joinHint: 'INNER JOIN \\`employees\\` e ON e.employee_id = child.employee_id',
  },
  {
    fileName: 'employee_lactation_period_evidence.ts',
    Model: EmployeeLactationPeriodEvidence,
    migrationSlug: 'add_business_unit_id_to_employee_lactation_period_evidences',
    parentLabel: 'el periodo de lactancia',
    joinHint: 'INNER JOIN \\`employee_lactation_periods\\` p',
  },
  {
    fileName: 'employee_lactation_period_notification.ts',
    Model: EmployeeLactationPeriodNotification,
    migrationSlug: 'add_business_unit_id_to_employee_lactation_period_notifications',
    parentLabel: 'el periodo de lactancia',
    joinHint: 'INNER JOIN \\`employee_lactation_periods\\` p',
  },
] as const

test.group('Lactancia — modelos componen withBusinessUnitScope', () => {
  for (const { fileName, Model, parentLabel } of TARGETS) {
    test(`${fileName} mixin + columna + hook`, ({ assert }) => {
      const content = readFileSync(join(MODELS_DIR, fileName), 'utf-8')
      assert.include(content, 'withBusinessUnitScope()')
      assertModelHasColumns(assert, Model, ['businessUnitId'])
      assert.include(content, '@beforeCreate()')
      assert.include(content, 'resolveParentBusinessUnitId(')
      assert.include(content, parentLabel)
    })
  }
})

test.group('Lactancia — migraciones de aislamiento', () => {
  for (const { migrationSlug, joinHint } of TARGETS) {
    test(`${migrationSlug} backfill sin filtrar soft-delete de padres`, ({ assert }) => {
      const match = readdirSync(MIGRATIONS_DIR).find((f) => f.includes(migrationSlug))
      assert.isDefined(match)
      if (!match) return
      const content = readFileSync(join(MIGRATIONS_DIR, match), 'utf-8')
      assert.notMatch(content, /await\s+this\.schema/)
      assert.include(content, 'this.defer(')
      assert.include(content, joinHint)
      assert.include(content, 'NOT NULL')
      assert.notInclude(content, 'employee_lactation_period_deleted_at')
    })
  }
})
