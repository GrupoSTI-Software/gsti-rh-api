import { test } from '@japa/runner'
import SystemPermissionCatalogSyncSeeder from '#database/seeders/0055_system_permission_catalog_sync_seeder'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import { EMPLOYEES_PERMISSION_CATALOG } from '#constants/system_permission_catalog'

/**
 * Tests del seeder 0055_system_permission_catalog_sync_seeder
 * (USRH1785766406720).
 *
 * No asume que las 28 acciones ya estén sembradas de antemano: por las
 * colisiones de id ya documentadas (ej. 194 compartido entre
 * `register-physical-consent` y `reform-simulation`), un ambiente puede
 * tener alguna acción realmente ausente — ese es justo el defecto que esta
 * HU existe para dejar de esconder. El CA que sí es universal es la
 * idempotencia (regla 5): correr el seeder una segunda vez, después de que
 * ya sincronizó lo que faltaba, no debe crear nada adicional ni renombrar
 * nada (regla 4).
 */

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

test.group('0055_system_permission_catalog_sync_seeder — idempotencia', () => {
  test('la segunda corrida no crea nada adicional a lo que ya dejó la primera (regla 4 y 5)', async ({
    assert,
  }) => {
    const employeesModule = await getEmployeesModule()

    // Primera corrida: puede sincronizar acciones que faltaban de verdad
    // (ej. una colisión de id histórica que nunca dejó persistir la acción).
    await new SystemPermissionCatalogSyncSeeder({} as never).run()
    const afterFirstRun = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('systemModuleId', employeesModule.systemModuleId)

    await new SystemPermissionCatalogSyncSeeder({} as never).run()
    const afterSecondRun = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('systemModuleId', employeesModule.systemModuleId)

    assert.lengthOf(
      afterSecondRun,
      afterFirstRun.length,
      'una vez sincronizado, correr el seeder otra vez no debe crear nada nuevo'
    )
  })

  test('cada acción declarada de Empleados sigue existiendo, sin renombrarse', async ({
    assert,
  }) => {
    const employeesModule = await getEmployeesModule()

    await new SystemPermissionCatalogSyncSeeder({} as never).run()

    for (const action of EMPLOYEES_PERMISSION_CATALOG) {
      const expectedSlug = action.legacyEquivalence?.systemPermissionSlug ?? action.slug
      const permission = await SystemPermission.query()
        .whereNull('system_permission_deleted_at')
        .where('systemModuleId', employeesModule.systemModuleId)
        .where('systemPermissionSlug', expectedSlug)
        .first()
      assert.exists(
        permission,
        `debe existir la acción "${action.slug}" (equivalencia "${expectedSlug}")`
      )
    }
  })
})
