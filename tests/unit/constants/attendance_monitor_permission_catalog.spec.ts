import { test } from '@japa/runner'
import {
  ATTENDANCE_MONITOR_PERMISSION_CATALOG,
} from '#constants/attendance_monitor_permission_catalog'

/** Los 11 slugs sembrados con `systemModuleId: 7` en 0018_system_permission_seeder.ts. */
const SEEDED_MODULE_7_SLUGS = [
  'read',
  'read-time-worked',
  'consecutive-faults',
  'shift-coverage',
  'see-payroll',
  'display-payments-summary',
  'display-discounts-summary',
  'add-assist-manual',
  'sync-assist',
  'delete-check-assist',
  'download-summary',
] as const

test.group('Catálogo employees-attendance-monitor — USRH1787433076991', () => {
  test('enumera exactamente las 11 acciones ya sembradas del módulo 7', ({ assert }) => {
    assert.lengthOf(ATTENDANCE_MONITOR_PERMISSION_CATALOG, 11)
    assert.deepEqual(
      [...ATTENDANCE_MONITOR_PERMISSION_CATALOG.map((action) => action.slug)].sort(),
      [...SEEDED_MODULE_7_SLUGS].sort()
    )
  })

  test('las 11 llevan equivalencia legada exacta contra su propio slug (regla 8: enumerar no concede)', ({
    assert,
  }) => {
    for (const action of ATTENDANCE_MONITOR_PERMISSION_CATALOG) {
      assert.equal(action.legacyEquivalence?.relation, 'exact', action.slug)
      assert.equal(action.legacyEquivalence?.systemPermissionSlug, action.slug, action.slug)
    }
  })

  test('las 11 usan exceptionProfile standard: el rol privilegiado conserva su acceso', ({
    assert,
  }) => {
    for (const action of ATTENDANCE_MONITOR_PERMISSION_CATALOG) {
      assert.equal(action.exceptionProfile, 'standard', action.slug)
    }
  })

  test('reparte las 11 en las 4 secciones declaradas', ({ assert }) => {
    const bySection = new Map<string, string[]>()
    for (const action of ATTENDANCE_MONITOR_PERMISSION_CATALOG) {
      bySection.set(action.section, [...(bySection.get(action.section) ?? []), action.slug])
    }

    assert.deepEqual([...bySection.keys()].sort(), [
      'asistencia',
      'descargas',
      'listado',
      'nomina',
    ])
    assert.deepEqual(bySection.get('descargas'), ['download-summary'])
    assert.lengthOf(bySection.get('listado') ?? [], 4)
    assert.lengthOf(bySection.get('nomina') ?? [], 3)
    assert.lengthOf(bySection.get('asistencia') ?? [], 3)
  })

  test('ninguna acción se declara exenta de la revisión de consistencia', ({ assert }) => {
    for (const action of ATTENDANCE_MONITOR_PERMISSION_CATALOG) {
      assert.notProperty(action, 'exemption', action.slug)
    }
  })
})
