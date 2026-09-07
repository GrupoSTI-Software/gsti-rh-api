import { test } from '@japa/runner'
import {
  ACCESS_POINT_MODULE_SLUG,
  ACCESS_POINT_PERMISSION_CATALOG,
} from '#constants/access_point_permission_catalog'
import { ACCESS_POINT_PERMISSION_DECLARATIONS } from '#constants/access_point_permission_declarations'
import type { ActionCatalogEntry } from '#constants/permission_catalog_types'
import {
  SYSTEM_PERMISSION_CATALOG,
  validateCatalogIntegrity,
} from '#constants/system_permission_catalog'

test.group('Catalogo de permisos de puntos de acceso', () => {
  test('el catalogo real sigue siendo integro con el modulo enumerado', ({ assert }) => {
    assert.doesNotThrow(() => validateCatalogIntegrity())
    const moduleEntry = SYSTEM_PERMISSION_CATALOG.modules.find(
      (entry) => entry.slug === ACCESS_POINT_MODULE_SLUG
    )
    assert.isTrue(moduleEntry?.actionsEnumerated)
    assert.strictEqual(
      SYSTEM_PERMISSION_CATALOG.actionsByModule[ACCESS_POINT_MODULE_SLUG],
      ACCESS_POINT_PERMISSION_CATALOG
    )
  })

  test('declara las cinco acciones nuevas y las cuatro legadas con equivalencia exacta', ({
    assert,
  }) => {
    const slugs = ACCESS_POINT_PERMISSION_CATALOG.map((action) => action.slug)
    assert.includeMembers(slugs, [
      'read',
      'create',
      'update',
      'delete',
      'read-health',
      'claim-device',
      'reset-upload-progress',
      'manage-commands',
      'reconcile-pins',
    ])
    const actions: readonly ActionCatalogEntry[] = ACCESS_POINT_PERMISSION_CATALOG
    for (const legacy of ['read', 'create', 'update', 'delete']) {
      const action = actions.find((entry) => entry.slug === legacy)
      assert.deepEqual(action?.legacyEquivalence, {
        systemPermissionSlug: legacy,
        relation: 'exact',
      })
    }
    // Las cinco nuevas no existen en la siembra vieja: declarar equivalencia
    // les daria un origen legado que nadie tiene.
    for (const nuevo of ['read-health', 'claim-device', 'reset-upload-progress']) {
      assert.isUndefined(actions.find((entry) => entry.slug === nuevo)?.legacyEquivalence)
    }
    assert.isTrue(
      ACCESS_POINT_PERMISSION_CATALOG.every((action) => action.section === 'dispositivos')
    )
  })

  test('las declaraciones apuntan al modulo y claim-device es estricto', ({ assert }) => {
    for (const declaration of Object.values(ACCESS_POINT_PERMISSION_DECLARATIONS)) {
      assert.equal(declaration.module, ACCESS_POINT_MODULE_SLUG)
    }
    assert.equal(ACCESS_POINT_PERMISSION_DECLARATIONS.claimDevice.bypass, 'strict')
    assert.equal(ACCESS_POINT_PERMISSION_DECLARATIONS.readHealth.bypass, 'standard')
    assert.equal(
      ACCESS_POINT_PERMISSION_DECLARATIONS.resetUploadProgress.action,
      'reset-upload-progress'
    )
  })
})
