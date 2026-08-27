import { test } from '@japa/runner'
import { POSITIONS_PERMISSION_CATALOG } from '#constants/positions_permission_catalog'
import {
  POSITIONS_READ_PERMISSION_DECLARATIONS,
  POSITIONS_WRITE_PERMISSION_DECLARATIONS,
  POSITIONS_DELETE_PERMISSION_DECLARATIONS,
  POSITIONS_AUDIT_READ_PERMISSION_DECLARATIONS,
} from '#constants/positions_permission_declarations'
import { SYSTEM_PERMISSION_CATALOG } from '#constants/system_permission_catalog'

test.group('Catálogo positions — USRH1787433076995', () => {
  test('enumera exactamente 4 acciones, todas en salary-ranges, sin legacyEquivalence', ({
    assert,
  }) => {
    assert.lengthOf(POSITIONS_PERMISSION_CATALOG, 4)
    const slugs = POSITIONS_PERMISSION_CATALOG.map((action) => action.slug)
    assert.deepEqual(slugs, [
      'salary-ranges-read',
      'salary-ranges-write',
      'salary-ranges-delete',
      'salary-ranges-audit-read',
    ])
    for (const action of POSITIONS_PERMISSION_CATALOG) {
      assert.equal(action.section, 'salary-ranges')
      assert.equal(action.exceptionProfile, 'standard')
      assert.isUndefined(action.legacyEquivalence)
    }
  })

  test('el índice maestro registra positions como enumerado con esas 4 acciones', ({ assert }) => {
    const moduleEntry = SYSTEM_PERMISSION_CATALOG.modules.find(
      (entry) => entry.slug === 'positions'
    )
    assert.exists(moduleEntry)
    assert.isTrue(moduleEntry!.actionsEnumerated)
    assert.deepEqual(
      SYSTEM_PERMISSION_CATALOG.actionsByModule.positions.map((action) => action.slug),
      POSITIONS_PERMISSION_CATALOG.map((action) => action.slug)
    )
  })

  test('las 7 declaraciones apuntan a positions + bypass standard + el slug correcto', ({
    assert,
  }) => {
    const expected = [
      [POSITIONS_READ_PERMISSION_DECLARATIONS.indexSalaryRanges, 'salary-ranges-read'],
      [POSITIONS_READ_PERMISSION_DECLARATIONS.currentSalaryRange, 'salary-ranges-read'],
      [POSITIONS_READ_PERMISSION_DECLARATIONS.historySalaryRanges, 'salary-ranges-read'],
      [POSITIONS_WRITE_PERMISSION_DECLARATIONS.storeSalaryRange, 'salary-ranges-write'],
      [POSITIONS_WRITE_PERMISSION_DECLARATIONS.updateSalaryRange, 'salary-ranges-write'],
      [POSITIONS_DELETE_PERMISSION_DECLARATIONS.closeSalaryRange, 'salary-ranges-delete'],
      [POSITIONS_AUDIT_READ_PERMISSION_DECLARATIONS.auditSalaryRange, 'salary-ranges-audit-read'],
    ] as const

    for (const [declaration, action] of expected) {
      assert.equal(declaration.module, 'positions')
      assert.equal(declaration.action, action)
      assert.equal(declaration.bypass, 'standard')
    }
  })
})
