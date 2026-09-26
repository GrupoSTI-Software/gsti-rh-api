import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { assertModelHasColumns } from '../helpers/lucid_model_assertions.js'
import TeleworkPolicy from '#models/telework_policy'
import RetentionPolicy from '#models/retention_policy'
import WorkJournalSealRunItem from '#models/work_journal_seal_run_item'
import AccessPoint from '#models/access_point'
import AttentionProgram from '#models/attention_program'
import BusinessUnitCompetencyLevel from '#models/business_unit_competency_level'
import WorkingTimeRule from '#models/working_time_rule'

/**
 * USRH1784259058567 — componer el candado automático en entidades que ya
 * tenían `business_unit_id` poblado. Caso (b) del inventario: no se agrega
 * columna (salvo `business_unit_competency_level`, NULLABLE), solo se
 * compone el mixin y se retira el filtro manual redundante que ya cubre.
 */

const MODELS_DIR = join(process.cwd(), 'app/models')

const DIRECT_COMPOSE_TARGETS = [
  { fileName: 'telework_policy.ts', Model: TeleworkPolicy },
  { fileName: 'retention_policy.ts', Model: RetentionPolicy },
  { fileName: 'work_journal_seal_run_item.ts', Model: WorkJournalSealRunItem },
  { fileName: 'access_point.ts', Model: AccessPoint },
  { fileName: 'attention_program.ts', Model: AttentionProgram },
] as const

test.group('Entidades ya-columnadas — 5 composes directos (sin migración)', () => {
  for (const { fileName, Model } of DIRECT_COMPOSE_TARGETS) {
    test(`${fileName} importa y compone withBusinessUnitScope()`, ({ assert }) => {
      const content = readFileSync(join(MODELS_DIR, fileName), 'utf-8')

      assert.include(
        content,
        "import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'"
      )
      assert.include(content, 'withBusinessUnitScope()')
      assertModelHasColumns(assert, Model, ['businessUnitId'])
    })
  }

  test('attention_program.ts documenta que sus filtros crudos db.from son load-bearing', ({
    assert,
  }) => {
    const content = readFileSync(join(MODELS_DIR, 'attention_program.ts'), 'utf-8')
    assert.match(content, /CAVEAT/)
    assert.match(content, /db\.from.*crud[oa]/i)
  })

  test('work_journal_seal_run_item.ts documenta que el compose es defensivo (runUnscoped)', ({
    assert,
  }) => {
    const content = readFileSync(join(MODELS_DIR, 'work_journal_seal_run_item.ts'), 'utf-8')
    assert.include(content, 'runUnscoped')
  })
})

test.group('business_unit_competency_level — compose + pre-check + migración condicional', () => {
  test('compone withBusinessUnitScope() y documenta el pre-check de NULLs', ({ assert }) => {
    const content = readFileSync(join(MODELS_DIR, 'business_unit_competency_level.ts'), 'utf-8')

    assert.include(
      content,
      "import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'"
    )
    assert.include(content, 'withBusinessUnitScope()')
    assertModelHasColumns(assert, BusinessUnitCompetencyLevel, ['businessUnitId'])
    assert.match(content, /pre-check/i)
    assert.include(content, 'Wilvardo')
  })

  test('existe la migración condicional que aborta si hay NULLs antes de imponer NOT NULL', ({
    assert,
  }) => {
    const migrationsDir = join(process.cwd(), 'database/migrations')
    const match = readdirSync(migrationsDir).find((f) =>
      f.includes('add_not_null_to_business_unit_competency_levels')
    )
    assert.isDefined(match, 'debe existir la migración condicional')
    if (!match) return

    const content = readFileSync(join(migrationsDir, match), 'utf-8')
    assert.notMatch(content, /await\s+this\.schema/)
    assert.include(content, 'this.defer(')
    // Contenido fuente en template literal: backtick escapado con backslash.
    assert.include(content, 'WHERE \\`business_unit_id\\` IS NULL')
    assert.include(content, 'throw new Error(')
    assert.include(content, 'Wilvardo')
    assert.include(content, 'MODIFY COLUMN \\`business_unit_id\\` INT UNSIGNED NOT NULL')

    // El guard de huérfanas debe evaluarse ANTES del MODIFY (aborta, no fuerza a ciegas).
    const guardIndex = content.indexOf('throw new Error(')
    const modifyIndex = content.indexOf('MODIFY COLUMN')
    assert.isBelow(guardIndex, modifyIndex)
  })
})

test.group('working_time_rule — EXCLUIDO (blocker de reglas federales)', () => {
  test('NO compone withBusinessUnitScope()', ({ assert }) => {
    const content = readFileSync(join(MODELS_DIR, 'working_time_rule.ts'), 'utf-8')
    assert.notInclude(
      content,
      "import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'"
    )
    assert.notMatch(content, /extends compose\([^)]*withBusinessUnitScope/)
  })

  test('documenta la excepción federal en el modelo', ({ assert }) => {
    const content = readFileSync(join(MODELS_DIR, 'working_time_rule.ts'), 'utf-8')
    assert.match(content, /Excepción intencional/)
    assert.match(content, /USRH1784259058567/)
    assert.match(content, /BLOCKER/)
    assert.include(content, 'business_unit_id')
  })

  test('la columna businessUnitId sigue siendo nullable (reglas federales)', ({ assert }) => {
    assertModelHasColumns(assert, WorkingTimeRule, ['businessUnitId'])
    const column = WorkingTimeRule.$getColumn('businessUnitId')
    assert.exists(column)
  })
})
