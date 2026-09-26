import { test } from '@japa/runner'
import {
  SYSTEM_PERMISSION_CATALOG,
  validateCatalogIntegrity,
  validateSystemModulesDeclaration,
  type SystemCatalogDeclaration,
} from '#constants/system_permission_catalog'
import { SystemPermissionCatalogError } from '#exceptions/system_permission_catalog_error'
import type { LegacyPermissionEquivalence } from '#constants/permission_catalog_types'
import type { FlatSystemModuleDeclaration } from '#constants/system_modules_menu/system_modules.constant'

/**
 * Tests unitarios del índice maestro de módulos y permisos
 * (USRH1785766406720): integridad estructural del catálogo real, de
 * `validateCatalogIntegrity()` —la pieza que materializa la regla de negocio 3
 * ("nombrar una acción no declarada se detecta antes de publicar")— y de
 * `validateSystemModulesDeclaration()`, que corre antes de sembrar (0062) y en
 * `permissions:check-consistency`. Cualquier violación debe lanzar aquí, no en
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

  test('el módulo "employees" está reconocido y tiene catálogo tipado', ({ assert }) => {
    const employeesModule = SYSTEM_PERMISSION_CATALOG.modules.find(
      (moduleEntry) => moduleEntry.slug === 'employees'
    )
    assert.exists(employeesModule, 'debe existir la entrada del módulo "employees"')
    assert.property(SYSTEM_PERMISSION_CATALOG.actionsByModule, 'employees')
  })

  test('el módulo "positions" está reconocido y tiene catálogo tipado', ({ assert }) => {
    const positionsModule = SYSTEM_PERMISSION_CATALOG.modules.find(
      (moduleEntry) => moduleEntry.slug === 'positions'
    )
    assert.exists(positionsModule, 'debe existir la entrada del módulo "positions"')
    assert.property(SYSTEM_PERMISSION_CATALOG.actionsByModule, 'positions')
  })

  test('los módulos sin catálogo tipado no tienen clave en actionsByModule', ({ assert }) => {
    const enumeratedModuleSlugs = [
      'employees',
      'positions',
      'employees-attendance-monitor',
      'biometric-devices',
    ]
    const otherModules = SYSTEM_PERMISSION_CATALOG.modules.filter(
      (moduleEntry) => !enumeratedModuleSlugs.includes(moduleEntry.slug)
    )
    assert.isAtLeast(otherModules.length, 40, 'el índice reconoce ~44 módulos en total')
    assert.deepEqual(
      otherModules
        .filter((moduleEntry) =>
          Object.hasOwn(SYSTEM_PERMISSION_CATALOG.actionsByModule, moduleEntry.slug)
        )
        .map((moduleEntry) => moduleEntry.slug),
      [],
      'solo los módulos con catálogo tipado en SYSTEM_MODULE_ACTION_CATALOGS tienen acciones enumeradas'
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
      120,
      '28 legacy + 51 pestaña + 1 suministros + 5 listado + 18 descargas + 11 sensibles (incluye export-sensitive-data) + 6 exemption'
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
})

test.group('Índice maestro — validateCatalogIntegrity() detecta estructura inválida', () => {
  test('slug de módulo duplicado', ({ assert }) => {
    assert.throws(() =>
      validateCatalogIntegrity({
        modules: [{ slug: 'dup' }, { slug: 'dup' }],
        actionsByModule: {},
      })
    )
  })

  test('slug de acción duplicado dentro de Empleados', ({ assert }) => {
    assert.throws(() =>
      validateCatalogIntegrity({
        modules: [{ slug: 'employees' }],
        actionsByModule: {
          employees: [
            { slug: 'dup-action', displayName: 'x', kind: 'read', section: 's', exceptionProfile: 'standard' },
            { slug: 'dup-action', displayName: 'y', kind: 'write', section: 's', exceptionProfile: 'standard' },
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
          employees: [{ slug: 'a', displayName: 'x', kind: 'read', section: 's', exceptionProfile: 'standard' }],
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
        modules: [{ slug: 'dup' }, { slug: 'dup' }],
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
        modules: [{ slug: 'employees' }],
        actionsByModule: {
          employees: [{ slug: 'a', displayName: 'x', kind: 'read', section: 's', exceptionProfile: 'standard' }],
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
        modules: [{ slug: 'employees' }],
        actionsByModule: {
          employees: [
            {
              slug: 'x',
              displayName: 'X',
              kind: 'read',
              section: 'listado',
              exceptionProfile: 'standard',
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
        modules: [{ slug: 'employees' }],
        actionsByModule: {
          employees: [
            {
              slug: 'read',
              displayName: 'Consultar listado',
              kind: 'read',
              section: 'listado',
              exceptionProfile: 'standard',
              legacyEquivalence: { systemPermissionSlug: 'read', relation: 'exact' },
            },
            {
              slug: 'tab-bancos-read',
              displayName: 'Consultar Bancos',
              kind: 'read',
              section: 'bancos',
              exceptionProfile: 'standard',
              legacyEquivalence: { systemPermissionSlug: 'read', relation: 'broader' },
            },
          ],
        },
      })
    )
  })
})

const TEST_GROUP = { key: 'grupo', name: 'Grupo de prueba', order: 10, icon: '' }

function moduleDeclaration(
  slug: string,
  overrides: Partial<FlatSystemModuleDeclaration> = {}
): FlatSystemModuleDeclaration {
  return {
    systemModuleName: `Módulo ${slug}`,
    systemModuleSlug: slug,
    systemModuleDescription: '',
    systemModules: 1,
    systemModulePath: `/${slug}`,
    systemModuleOrder: 1,
    systemModuleActive: 1,
    systemModulePermissionEnforcementActive: true,
    systemModuleRetired: false,
    systemModuleIcon: '',
    systemModulePermissions: [
      { systemPermissionName: `Acceder a ${slug}`, systemPermissionSlug: 'read' },
    ],
    systemModuleGroupKey: TEST_GROUP.key,
    ...overrides,
  }
}

/** Mensaje del `SystemPermissionCatalogError` lanzado, o `null` si la declaración es válida. */
function catalogErrorMessage(declaration: SystemCatalogDeclaration): string | null {
  try {
    validateSystemModulesDeclaration(declaration)
    return null
  } catch (error) {
    if (error instanceof SystemPermissionCatalogError) {
      return error.message
    }
    throw error
  }
}

test.group('validateSystemModulesDeclaration — declaración que se siembra', () => {
  test('la declaración real no lanza', ({ assert }) => {
    assert.doesNotThrow(() => validateSystemModulesDeclaration())
  })

  test('acepta módulos con grupo, sueltos y el mismo slug de permiso en módulos distintos', ({
    assert,
  }) => {
    const message = catalogErrorMessage({
      groups: [TEST_GROUP],
      modules: [
        moduleDeclaration('modulo-a'),
        moduleDeclaration('modulo-b', { systemModuleGroupKey: null }),
      ],
    })

    assert.isNull(message)
  })

  test('slug de módulo duplicado, aunque uno esté retirado', ({ assert }) => {
    const message = catalogErrorMessage({
      groups: [TEST_GROUP],
      modules: [
        moduleDeclaration('modulo-a'),
        moduleDeclaration('modulo-a', {
          systemModuleRetired: true,
          systemModuleActive: 0,
          systemModulePermissions: [],
        }),
      ],
    })

    assert.include(message ?? '', 'Slug de módulo duplicado')
    assert.include(message ?? '', '"modulo-a"')
  })

  test('slug de permiso duplicado dentro de un módulo', ({ assert }) => {
    const message = catalogErrorMessage({
      groups: [TEST_GROUP],
      modules: [
        moduleDeclaration('modulo-a', {
          systemModulePermissions: [
            { systemPermissionName: 'Acceder a modulo-a', systemPermissionSlug: 'read' },
            { systemPermissionName: 'Consultar modulo-a', systemPermissionSlug: 'read' },
          ],
        }),
      ],
    })

    assert.include(message ?? '', 'Slug de permiso duplicado en el módulo "modulo-a"')
  })

  test('módulo que apunta a una clave de grupo no declarada', ({ assert }) => {
    const message = catalogErrorMessage({
      groups: [TEST_GROUP],
      modules: [moduleDeclaration('modulo-a', { systemModuleGroupKey: 'grupo-inexistente' })],
    })

    assert.include(message ?? '', '"grupo-inexistente"')
  })

  test('clave de grupo duplicada', ({ assert }) => {
    const message = catalogErrorMessage({
      groups: [TEST_GROUP, { ...TEST_GROUP, name: 'Otro grupo' }],
      modules: [moduleDeclaration('modulo-a')],
    })

    assert.include(message ?? '', 'Clave de grupo duplicada')
  })
})
