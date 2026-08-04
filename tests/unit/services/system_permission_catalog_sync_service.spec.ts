import { test } from '@japa/runner'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import RoleSystemPermission from '#models/role_system_permission'
import SystemPermissionCatalogSyncService from '#services/system_permission_catalog_sync_service'
import type { SystemPermissionCatalog } from '#constants/system_permission_catalog'
import type { ActionCatalogEntry } from '#constants/permission_catalog_types'

/**
 * Tests unitarios de `SystemPermissionCatalogSyncService` (USRH1785766406720).
 *
 * Usa catálogos de prueba inyectados (no el catálogo real de producción) con
 * slugs prefijados `catalog-sync-test-` para no interferir con las ~28
 * acciones reales de Empleados, y los limpia en `group.teardown`.
 *
 * No ejercita el caso "módulo employees no existe en BD": ese módulo es
 * compartido por el resto de la suite y no se soft-elimina ni siquiera
 * temporalmente para probar la rama defensiva de `skippedActions`.
 */

const TEST_SLUG_PREFIX = 'catalog-sync-test-'

async function getEmployeesModule(): Promise<SystemModule> {
  const employeesModule = await SystemModule.query()
    .whereNull('system_module_deleted_at')
    .where('system_module_slug', 'employees')
    .first()
  if (!employeesModule) {
    throw new Error('El módulo "employees" debería existir ya en la BD de pruebas.')
  }
  return employeesModule
}

function buildCatalog(employees: readonly ActionCatalogEntry<string>[]): SystemPermissionCatalog {
  return {
    modules: [{ slug: 'employees', actionsEnumerated: true }],
    actionsByModule: { employees },
  }
}

test.group('SystemPermissionCatalogSyncService — sincronización', (group) => {
  group.teardown(async () => {
    const testRows = await SystemPermission.query()
      .where('systemPermissionSlug', 'like', `${TEST_SLUG_PREFIX}%`)
      .withTrashed()
    for (const row of testRows) {
      await row.forceDelete()
    }
  })

  test('crea una acción nueva declarada en el catálogo bajo el módulo employees', async ({
    assert,
  }) => {
    const employeesModule = await getEmployeesModule()
    const slug = `${TEST_SLUG_PREFIX}new-action`
    const catalog = buildCatalog([
      { slug, displayName: 'Acción de prueba', kind: 'write', section: 'test' },
    ])

    const result = await new SystemPermissionCatalogSyncService(catalog).sync()

    assert.include(result.createdPermissionSlugs, slug)
    const created = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('systemModuleId', employeesModule.systemModuleId)
      .where('systemPermissionSlug', slug)
      .first()
    assert.exists(created)
    assert.equal(created!.systemPermissionName, 'Acción de prueba')
  })

  test('correr sync() dos veces no duplica la acción creada (regla 5)', async ({ assert }) => {
    const employeesModule = await getEmployeesModule()
    const slug = `${TEST_SLUG_PREFIX}idempotent-action`
    const catalog = buildCatalog([
      { slug, displayName: 'Acción idempotente', kind: 'read', section: 'test' },
    ])

    await new SystemPermissionCatalogSyncService(catalog).sync()
    const secondRun = await new SystemPermissionCatalogSyncService(catalog).sync()

    assert.notInclude(
      secondRun.createdPermissionSlugs,
      slug,
      'la segunda corrida no crea nada nuevo'
    )
    const matches = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('systemModuleId', employeesModule.systemModuleId)
      .where('systemPermissionSlug', slug)
    assert.lengthOf(matches, 1, 'no debe duplicarse la fila')
  })

  test('nunca renombra una acción legacy ya existente (regla 4)', async ({ assert }) => {
    const employeesModule = await getEmployeesModule()
    const originalRead = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('systemModuleId', employeesModule.systemModuleId)
      .where('systemPermissionSlug', 'read')
      .first()
    assert.exists(originalRead, 'la acción legacy "read" de Empleados debe existir ya en BD')

    const catalog = buildCatalog([
      {
        slug: `${TEST_SLUG_PREFIX}legacy-alias-for-read`,
        displayName: 'Nombre nuevo que NO debe aplicarse',
        kind: 'write',
        section: 'test',
        legacyEquivalence: { systemPermissionSlug: 'read' },
      },
    ])

    const result = await new SystemPermissionCatalogSyncService(catalog).sync()

    assert.notInclude(
      result.createdPermissionSlugs,
      `${TEST_SLUG_PREFIX}legacy-alias-for-read`,
      'una acción con equivalencia legacy existente no debe crear una fila nueva'
    )

    const readAfterSync = await SystemPermission.find(originalRead!.systemPermissionId)
    assert.equal(readAfterSync!.systemPermissionSlug, 'read', 'el slug legacy no se renombra')
    assert.equal(
      readAfterSync!.systemPermissionName,
      originalRead!.systemPermissionName,
      'el nombre legacy no se modifica'
    )

    const noExtraRow = await SystemPermission.query()
      .where('systemPermissionSlug', `${TEST_SLUG_PREFIX}legacy-alias-for-read`)
      .withTrashed()
    assert.lengthOf(noExtraRow, 0, 'no debe crearse una fila paralela para la equivalencia')
  })

  test('nunca revive una baja intencional (regla 5)', async ({ assert }) => {
    const employeesModule = await getEmployeesModule()
    const slug = `${TEST_SLUG_PREFIX}soft-deleted-action`

    const softDeleted = await SystemPermission.create({
      systemPermissionName: 'Acción dada de baja a propósito',
      systemPermissionSlug: slug,
      systemModuleId: employeesModule.systemModuleId,
    })
    await softDeleted.delete()

    const catalog = buildCatalog([
      { slug, displayName: 'No debería revivir esto', kind: 'read', section: 'test' },
    ])

    const result = await new SystemPermissionCatalogSyncService(catalog).sync()

    assert.notInclude(result.createdPermissionSlugs, slug)
    const liveMatches = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('systemPermissionSlug', slug)
    assert.lengthOf(liveMatches, 0, 'la baja intencional no se revive')

    const allMatches = await SystemPermission.query()
      .where('systemPermissionSlug', slug)
      .withTrashed()
    assert.lengthOf(allMatches, 1, 'tampoco se duplica junto a la fila dada de baja')
  })

  test('nunca escribe en role_system_permissions (regla 8)', async ({ assert }) => {
    const beforeCount = await RoleSystemPermission.query().whereNull(
      'role_system_permission_deleted_at'
    )

    const catalog = buildCatalog([
      {
        slug: `${TEST_SLUG_PREFIX}no-role-grants`,
        displayName: 'No debe conceder nada',
        kind: 'write',
        section: 'test',
      },
    ])
    await new SystemPermissionCatalogSyncService(catalog).sync()

    const afterCount = await RoleSystemPermission.query().whereNull(
      'role_system_permission_deleted_at'
    )
    assert.lengthOf(
      afterCount,
      beforeCount.length,
      'la sincronización no debe conceder ni retirar ningún acceso'
    )
  })
})
