import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import RoleSystemPermission from '#models/role_system_permission'
import SystemPermissionCatalogConsistencyService from '#services/system_permission_catalog_consistency_service'
import { KNOWN_DUPLICATE_IDS } from '#constants/system_permission_catalog'
import type { SystemPermissionCatalog } from '#constants/system_permission_catalog'

/**
 * Tests unitarios de `SystemPermissionCatalogConsistencyService`
 * (USRH1785766406720, regla 7): revisión de solo lectura — nunca corrige,
 * crea ni borra. Usa catálogos de prueba inyectados con slugs prefijados
 * `catalog-consistency-test-` para no interferir con el catálogo real.
 */

const TEST_SLUG_PREFIX = 'catalog-consistency-test-'

async function getEmployeesModuleId(): Promise<number> {
  const employeesModule = await SystemModule.query()
    .whereNull('system_module_deleted_at')
    .where('system_module_slug', 'employees')
    .first()
  if (!employeesModule) {
    throw new Error('El módulo "employees" debería existir ya en la BD de pruebas.')
  }
  return employeesModule.systemModuleId
}

test.group('SystemPermissionCatalogConsistencyService — hallazgos', (group) => {
  const createdModules: SystemModule[] = []
  const createdPermissions: SystemPermission[] = []

  group.teardown(async () => {
    for (const permission of createdPermissions) {
      await permission.forceDelete()
    }
    for (const moduleRow of createdModules) {
      await moduleRow.forceDelete()
    }
  })

  test('reporta un módulo declarado sin fila viva como declared-not-registered', async ({
    assert,
  }) => {
    const slug = `${TEST_SLUG_PREFIX}missing-module`
    const catalog: SystemPermissionCatalog = {
      modules: [
        { slug: 'employees', actionsEnumerated: false },
        { slug, actionsEnumerated: false },
      ],
      actionsByModule: {},
    }

    const report = await new SystemPermissionCatalogConsistencyService(catalog).checkConsistency()

    assert.isTrue(
      report.declaredNotRegistered.some(
        (finding) => finding.kind === 'module' && finding.slug === slug
      )
    )
  })

  test('reporta una acción de Empleados declarada sin fila viva como declared-not-registered', async ({
    assert,
  }) => {
    const slug = `${TEST_SLUG_PREFIX}missing-action`
    const catalog: SystemPermissionCatalog = {
      modules: [{ slug: 'employees', actionsEnumerated: true }],
      actionsByModule: {
        employees: [{ slug, displayName: 'x', kind: 'read', section: 's', exceptionProfile: 'standard' }],
      },
    }

    const report = await new SystemPermissionCatalogConsistencyService(catalog).checkConsistency()

    assert.isTrue(
      report.declaredNotRegistered.some(
        (finding) => finding.kind === 'permission' && finding.slug === slug
      )
    )
  })

  test('excluye del reporte las acciones marcadas como exentas (regla 9)', async ({ assert }) => {
    const slug = `${TEST_SLUG_PREFIX}exempt-action`
    const catalog: SystemPermissionCatalog = {
      modules: [{ slug: 'employees', actionsEnumerated: true }],
      actionsByModule: {
        employees: [
          {
            slug,
            displayName: 'x',
            kind: 'read',
            section: 's',
            exceptionProfile: 'standard',
            exemption: {
              reason: 'app móvil del empleado, fuera de este proyecto',
              owner: 'Wilvardo',
            },
          },
        ],
      },
    }

    const report = await new SystemPermissionCatalogConsistencyService(catalog).checkConsistency()

    assert.isFalse(report.declaredNotRegistered.some((finding) => finding.slug === slug))
  })

  test('reporta un permiso vivo de Empleados sin declarar como registered-not-declared', async ({
    assert,
  }) => {
    const employeesModuleId = await getEmployeesModuleId()
    const slug = `${TEST_SLUG_PREFIX}extra-permission`
    const extraPermission = await SystemPermission.create({
      systemPermissionName: 'Permiso no declarado',
      systemPermissionSlug: slug,
      systemModuleId: employeesModuleId,
    })
    createdPermissions.push(extraPermission)

    const catalog: SystemPermissionCatalog = {
      modules: [{ slug: 'employees', actionsEnumerated: false }],
      actionsByModule: { employees: [] },
    }

    const report = await new SystemPermissionCatalogConsistencyService(catalog).checkConsistency()

    assert.isTrue(report.registeredNotDeclared.some((finding) => finding.slug === slug))
  })

  test('lista como deuda conocida los módulos con actionsEnumerated=false', async ({ assert }) => {
    const debtSlug = `${TEST_SLUG_PREFIX}debt-module`
    const catalog: SystemPermissionCatalog = {
      modules: [
        { slug: 'employees', actionsEnumerated: true },
        { slug: debtSlug, actionsEnumerated: false },
      ],
      actionsByModule: {},
    }

    const report = await new SystemPermissionCatalogConsistencyService(catalog).checkConsistency()

    assert.include(report.knownDebtModules, debtSlug)
    assert.notInclude(report.knownDebtModules, 'employees')
  })

  test('anota informativamente un módulo inactivo, sin reportarlo como perdido (regla 10)', async ({
    assert,
  }) => {
    const slug = `${TEST_SLUG_PREFIX}inactive-module`
    const inactiveModule = await SystemModule.create({
      systemModuleName: 'Módulo inactivo de prueba',
      systemModuleSlug: slug,
      systemModuleDescription: 'test',
      systemModules: '0',
      systemModulePath: `/${slug}`,
      systemModuleActive: 0,
      systemModuleOrder: 10,
      systemModuleIcon: '',
      systemModuleUpdatedAt: DateTime.now(),
    })
    createdModules.push(inactiveModule)

    const catalog: SystemPermissionCatalog = {
      modules: [
        { slug: 'employees', actionsEnumerated: false },
        { slug, actionsEnumerated: false },
      ],
      actionsByModule: {},
    }

    const report = await new SystemPermissionCatalogConsistencyService(catalog).checkConsistency()

    assert.isTrue(report.inactiveModuleNotes.some((note) => note.includes(slug)))
    assert.isFalse(
      report.declaredNotRegistered.some((finding) => finding.slug === slug),
      'un módulo inactivo pero existente no es "no registrado"'
    )
  })

  test('expone las colisiones de id conocidas sin modificarlas', async ({ assert }) => {
    const catalog: SystemPermissionCatalog = {
      modules: [{ slug: 'employees', actionsEnumerated: false }],
      actionsByModule: {},
    }

    const report = await new SystemPermissionCatalogConsistencyService(catalog).checkConsistency()

    assert.deepEqual(report.knownDuplicateIds, KNOWN_DUPLICATE_IDS)
    assert.isTrue(
      report.knownDuplicateIds.some((finding) => finding.kind === 'module' && finding.id === 46)
    )
  })

  test('es de solo lectura: no cambia los conteos de filas al ejecutarse', async ({ assert }) => {
    async function snapshotCounts() {
      const modules = await SystemModule.query().whereNull('system_module_deleted_at')
      const permissions = await SystemPermission.query().whereNull('system_permission_deleted_at')
      const rolePermissions = await RoleSystemPermission.query().whereNull(
        'role_system_permission_deleted_at'
      )
      return {
        modules: modules.length,
        permissions: permissions.length,
        rolePermissions: rolePermissions.length,
      }
    }

    const countBefore = await snapshotCounts()

    await new SystemPermissionCatalogConsistencyService().checkConsistency()

    const countAfter = await snapshotCounts()

    assert.deepEqual(countAfter, countBefore, 'la revisión de consistencia nunca escribe en BD')
  })
})
