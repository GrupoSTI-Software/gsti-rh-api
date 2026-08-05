import { test } from '@japa/runner'
import {
  SYSTEM_PERMISSION_CATALOG,
  KNOWN_DUPLICATE_IDS,
  validateCatalogIntegrity,
} from '#constants/system_permission_catalog'
import { SystemPermissionCatalogError } from '#exceptions/system_permission_catalog_error'
import type { LegacyPermissionEquivalence } from '#constants/permission_catalog_types'

/**
 * Tests unitarios del índice maestro de módulos y permisos
 * (USRH1785766406720): integridad estructural del catálogo real y de
 * `validateCatalogIntegrity()` — la pieza que materializa la regla de
 * negocio 3 ("nombrar una acción no declarada se detecta antes de
 * publicar"): cualquier violación de estructura debe lanzar aquí, no en
 * producción.
 */

test.group('Índice maestro — catálogo real', () => {
  test('el catálogo real no lanza al validarse', ({ assert }) => {
    assert.doesNotThrow(() => validateCatalogIntegrity())
  })

  test('no hay slugs de módulo duplicados', ({ assert }) => {
    const slugs = SYSTEM_PERMISSION_CATALOG.modules.map((moduleEntry) => moduleEntry.slug)
    assert.equal(new Set(slugs).size, slugs.length, 'debe haber un slug de módulo por entrada')
  })

  test('no hay slugs de acción duplicados en Empleados', ({ assert }) => {
    const slugs = SYSTEM_PERMISSION_CATALOG.actionsByModule.employees.map((action) => action.slug)
    assert.equal(new Set(slugs).size, slugs.length, 'debe haber un slug de acción por entrada')
  })

  test('el módulo "employees" está reconocido y marcado como enumerado', ({ assert }) => {
    const employeesModule = SYSTEM_PERMISSION_CATALOG.modules.find(
      (moduleEntry) => moduleEntry.slug === 'employees'
    )
    assert.exists(employeesModule, 'debe existir la entrada del módulo "employees"')
    assert.isTrue(employeesModule!.actionsEnumerated)
  })

  test('el resto de los módulos queda reconocido, sin acciones enumeradas (deuda conocida)', ({
    assert,
  }) => {
    const otherModules = SYSTEM_PERMISSION_CATALOG.modules.filter(
      (moduleEntry) => moduleEntry.slug !== 'employees'
    )
    assert.isAtLeast(otherModules.length, 40, 'el piloto reconoce ~44 módulos en total')
    assert.isTrue(
      otherModules.every((moduleEntry) => moduleEntry.actionsEnumerated === false),
      'ningún módulo distinto de "employees" debe declarar actionsEnumerated=true en esta HU'
    )
  })

  test('Empleados enumera las 28 legacy ya sembradas más el inventario granular nuevo (USRH1785766406722)', ({
    assert,
  }) => {
    const actions = SYSTEM_PERMISSION_CATALOG.actionsByModule.employees
    const legacy = actions.filter((action) => action.legacyEquivalence?.relation === 'exact')
    const exempt = actions.filter((action) => action.exemption)
    assert.lengthOf(legacy, 28, 'las 28 decisiones ya sembradas conservan relation exact')
    assert.lengthOf(exempt, 6, 'los apartados de app colaborador no crean fila en BD')
    assert.lengthOf(
      actions,
      108,
      '28 legacy + 56 pestaña + 4 listado + 4 descargas + 10 sensibles + 6 exemption'
    )
  })

  test('cada acción de Empleados declara kind, sección y nombre legible', ({ assert }) => {
    const validKinds = ['read', 'write', 'delete']
    for (const action of SYSTEM_PERMISSION_CATALOG.actionsByModule.employees) {
      assert.include(validKinds, action.kind, `kind inválido en "${action.slug}"`)
      assert.isNotEmpty(action.section, `sección vacía en "${action.slug}"`)
      assert.isNotEmpty(action.displayName, `displayName vacío en "${action.slug}"`)
    }
  })

  test('KNOWN_DUPLICATE_IDS documenta al menos las colisiones de módulo 41 y 46', ({ assert }) => {
    const moduleIds = KNOWN_DUPLICATE_IDS.filter((finding) => finding.kind === 'module').map(
      (finding) => finding.id
    )
    assert.includeMembers(moduleIds, [41, 46])
  })
})

test.group('Índice maestro — validateCatalogIntegrity() detecta estructura inválida', () => {
  test('slug de módulo duplicado', ({ assert }) => {
    assert.throws(() =>
      validateCatalogIntegrity({
        modules: [
          { slug: 'dup', actionsEnumerated: false },
          { slug: 'dup', actionsEnumerated: false },
        ],
        actionsByModule: {},
      })
    )
  })

  test('slug de acción duplicado dentro de Empleados', ({ assert }) => {
    assert.throws(() =>
      validateCatalogIntegrity({
        modules: [{ slug: 'employees', actionsEnumerated: true }],
        actionsByModule: {
          employees: [
            { slug: 'dup-action', displayName: 'x', kind: 'read', section: 's' },
            { slug: 'dup-action', displayName: 'y', kind: 'write', section: 's' },
          ],
        },
      })
    )
  })

  test('acciones declaradas sin que "employees" exista en el catálogo de módulos', ({ assert }) => {
    assert.throws(() =>
      validateCatalogIntegrity({
        modules: [],
        actionsByModule: {
          employees: [{ slug: 'a', displayName: 'x', kind: 'read', section: 's' }],
        },
      })
    )
  })

  test('acciones declaradas con actionsEnumerated=false en el módulo dueño', ({ assert }) => {
    assert.throws(() =>
      validateCatalogIntegrity({
        modules: [{ slug: 'employees', actionsEnumerated: false }],
        actionsByModule: {
          employees: [{ slug: 'a', displayName: 'x', kind: 'read', section: 's' }],
        },
      })
    )
  })

  test('lanza específicamente SystemPermissionCatalogError (no un Error genérico)', ({
    assert,
  }) => {
    let caught: unknown
    try {
      validateCatalogIntegrity({
        modules: [
          { slug: 'dup', actionsEnumerated: false },
          { slug: 'dup', actionsEnumerated: false },
        ],
        actionsByModule: {},
      })
    } catch (error) {
      caught = error
    }
    assert.instanceOf(caught, SystemPermissionCatalogError)
  })

  test('acepta un catálogo válido sin lanzar', ({ assert }) => {
    assert.doesNotThrow(() =>
      validateCatalogIntegrity({
        modules: [{ slug: 'employees', actionsEnumerated: true }],
        actionsByModule: {
          employees: [{ slug: 'a', displayName: 'x', kind: 'read', section: 's' }],
        },
      })
    )
  })
})

test.group('validateCatalogIntegrity — relation de equivalencia (USRH1785766406722)', () => {
  test('exige relation cuando hay legacyEquivalence', ({ assert }) => {
    let caught: unknown
    try {
      validateCatalogIntegrity({
        modules: [{ slug: 'employees', actionsEnumerated: true }],
        actionsByModule: {
          employees: [
            {
              slug: 'x',
              displayName: 'X',
              kind: 'read',
              section: 'listado',
              legacyEquivalence: {
                systemPermissionSlug: 'read',
              } as LegacyPermissionEquivalence,
            },
          ],
        },
      })
    } catch (error) {
      caught = error
    }
    assert.instanceOf(caught, SystemPermissionCatalogError)
  })

  test('acepta relation exact|broader|narrower', ({ assert }) => {
    assert.doesNotThrow(() =>
      validateCatalogIntegrity({
        modules: [{ slug: 'employees', actionsEnumerated: true }],
        actionsByModule: {
          employees: [
            {
              slug: 'read',
              displayName: 'Consultar listado',
              kind: 'read',
              section: 'listado',
              legacyEquivalence: { systemPermissionSlug: 'read', relation: 'exact' },
            },
            {
              slug: 'tab-bancos-read',
              displayName: 'Consultar Bancos',
              kind: 'read',
              section: 'bancos',
              legacyEquivalence: { systemPermissionSlug: 'read', relation: 'broader' },
            },
          ],
        },
      })
    )
  })
})
