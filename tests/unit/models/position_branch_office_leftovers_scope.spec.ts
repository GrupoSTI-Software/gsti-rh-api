import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { assertModelHasColumns } from '../helpers/lucid_model_assertions.js'
import PositionApprovalHistory from '#models/position_approval_history'
import PositionCertificationRequirement from '#models/position_certification_requirement'
import BranchOfficeShiftQuota from '#models/branch_office_shift_quota'

/**
 * USRH1784259058555 — hijos restantes de posición y sucursal: marca propia
 * + candado, espejo directo de `position_kpi` (mismo padre, mismo salto de
 * backfill).
 */

const MODELS_DIR = join(process.cwd(), 'app/models')
const MIGRATIONS_DIR = join(process.cwd(), 'database/migrations')

test.group('PositionApprovalHistory — modelo con withBusinessUnitScope', () => {
  test('importa mixin, columna y hook desde el puesto padre', ({ assert }) => {
    const content = readFileSync(join(MODELS_DIR, 'position_approval_history.ts'), 'utf-8')

    assert.include(
      content,
      "import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'"
    )
    assert.include(content, 'withBusinessUnitScope()')
    assertModelHasColumns(assert, PositionApprovalHistory, ['businessUnitId'])
    assert.include(content, '@beforeCreate()')
    assert.match(content, /if \(instance\.businessUnitId\) return/)
    assert.match(
      content,
      /resolveParentBusinessUnitId\(\s*\(\)\s*=>\s*Position\.query\(\)\.where\('positionId', instance\.positionId\)/
    )
  })
})

test.group('PositionCertificationRequirement — dato por-posición, catálogo intacto', () => {
  test('importa mixin, columna y hook desde el puesto padre', ({ assert }) => {
    const content = readFileSync(
      join(MODELS_DIR, 'position_certification_requirement.ts'),
      'utf-8'
    )

    assert.include(
      content,
      "import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'"
    )
    assert.include(content, 'withBusinessUnitScope()')
    assertModelHasColumns(assert, PositionCertificationRequirement, ['businessUnitId'])
    assert.include(content, '@beforeCreate()')
    assert.match(
      content,
      /resolveParentBusinessUnitId\(\s*\(\)\s*=>\s*Position\.query\(\)\.where\('positionId', instance\.positionId\)/
    )
  })

  test('NO compone el mixin en el catálogo compartido Certification', ({ assert }) => {
    const content = readFileSync(join(MODELS_DIR, 'certification.ts'), 'utf-8')
    assert.notInclude(
      content,
      "import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'"
    )
  })
})

test.group('BranchOfficeShiftQuota — modelo con withBusinessUnitScope', () => {
  test('importa mixin, columna y hook desde la sucursal padre', ({ assert }) => {
    const content = readFileSync(join(MODELS_DIR, 'branch_office_shift_quota.ts'), 'utf-8')

    assert.include(
      content,
      "import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'"
    )
    assert.include(content, 'withBusinessUnitScope()')
    assertModelHasColumns(assert, BranchOfficeShiftQuota, ['businessUnitId'])
    assert.include(content, '@beforeCreate()')
    assert.match(
      content,
      /resolveParentBusinessUnitId\(\s*\(\)\s*=>\s*BranchOffice\.query\(\)\.where\('branchOfficeId', instance\.branchOfficeId\)/
    )
  })
})

test.group('Hijos restantes de posición/sucursal — migraciones de aislamiento', () => {
  test('position_approval_histories: limpia huérfanos con conteo en log antes de NOT NULL', ({
    assert,
  }) => {
    const match = readdirSync(MIGRATIONS_DIR).find((f) =>
      f.includes('add_business_unit_id_to_position_approval_histories')
    )
    assert.isDefined(match)
    if (!match) return

    const content = readFileSync(join(MIGRATIONS_DIR, match), 'utf-8')
    assert.notMatch(content, /await\s+this\.schema/)
    assert.include(content, 'this.defer(')
    // Limpieza de huérfanos con conteo en log, antes del backfill/NOT NULL.
    assert.include(content, 'WHERE \\`position_id\\` IS NULL')
    assert.include(content, 'console.warn(')
    assert.include(content, 'DELETE FROM')
    const orphanCleanupIndex = content.indexOf('DELETE FROM')
    const backfillIndex = content.indexOf('INNER JOIN \\`positions\\`')
    const notNullIndex = content.indexOf('MODIFY COLUMN \\`position_id\\` INT UNSIGNED NOT NULL')
    assert.isAbove(orphanCleanupIndex, -1)
    assert.isAbove(backfillIndex, -1)
    assert.isAbove(notNullIndex, -1)
    assert.isBelow(orphanCleanupIndex, backfillIndex, 'los huérfanos se limpian antes del backfill')
    assert.isBelow(backfillIndex, notNullIndex, 'el backfill precede al NOT NULL')
  })

  test('position_certification_requirements: backfill estándar desde positions, sin limpieza de huérfanos', ({
    assert,
  }) => {
    const match = readdirSync(MIGRATIONS_DIR).find((f) =>
      f.includes('add_business_unit_id_to_position_certification_requirements')
    )
    assert.isDefined(match)
    if (!match) return

    const content = readFileSync(join(MIGRATIONS_DIR, match), 'utf-8')
    assert.notMatch(content, /await\s+this\.schema/)
    assert.include(content, 'this.defer(')
    assert.include(
      content,
      'INNER JOIN \\`positions\\` p ON p.position_id = child.position_id'
    )
    assert.include(content, 'MODIFY COLUMN \\`business_unit_id\\` INT UNSIGNED NOT NULL')
    assert.notInclude(content, 'DELETE FROM')
  })

  test('branch_office_shift_quotas: backfill estándar desde branch_offices, sin soft-delete', ({
    assert,
  }) => {
    const match = readdirSync(MIGRATIONS_DIR).find((f) =>
      f.includes('add_business_unit_id_to_branch_office_shift_quotas')
    )
    assert.isDefined(match)
    if (!match) return

    const content = readFileSync(join(MIGRATIONS_DIR, match), 'utf-8')
    assert.notMatch(content, /await\s+this\.schema/)
    assert.include(content, 'this.defer(')
    assert.include(
      content,
      'INNER JOIN \\`branch_offices\\` bo ON bo.branch_office_id = child.branch_office_id'
    )
    assert.include(content, 'MODIFY COLUMN \\`business_unit_id\\` INT UNSIGNED NOT NULL')
    assert.notInclude(content, 'DELETE FROM')
  })
})
