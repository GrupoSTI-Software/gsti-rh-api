import { test } from '@japa/runner'
import SystemPermissionCatalogSyncSeeder from '#database/seeders/0055_system_permission_catalog_sync_seeder'
import { EMPLOYEES_PERMISSION_CATALOG } from '#constants/employees_permission_catalog'
import { getRolePreset } from '#constants/role_presets'
import RolePresetService from '#services/role_preset_service'

const employeesPermissionBySlug = new Map(
  EMPLOYEES_PERMISSION_CATALOG.map((permission) => [permission.slug, permission] as const)
)

test.group('RolePresetService.resolveEmployeesPermissionIds', (group) => {
  group.setup(async () => {
    await new SystemPermissionCatalogSyncSeeder({} as never).run()
  })

  test('resuelve todos los slugs grantables de hr-admin a IDs del módulo employees', async ({
    assert,
  }) => {
    const service = new RolePresetService()
    const preset = getRolePreset('hr-admin')

    const { ids, missing } = await service.resolveEmployeesPermissionIds(preset.permissionSlugs)

    assert.isEmpty(missing)
    assert.lengthOf(ids, new Set(preset.permissionSlugs).size)
  })

  test('reporta slugs ausentes en BD sin resolver el resto a medias para apply', async ({
    assert,
  }) => {
    const service = new RolePresetService()
    const { ids, missing } = await service.resolveEmployeesPermissionIds([
      'read',
      'slug-que-no-existe-xyz',
    ])

    assert.include(missing, 'slug-que-no-existe-xyz')
    assert.lengthOf(ids, 1)
  })

  test('list() devuelve cuatro plantillas con permissionCount coherente', async ({ assert }) => {
    const items = await new RolePresetService().list()

    assert.lengthOf(items, 4)
    assert.deepEqual(
      items.map((item) => item.slug),
      ['hr-admin', 'branch-supervisor', 'read-only', 'data-entry']
    )

    for (const item of items) {
      assert.equal(item.permissionCount, item.permissions.length)
      assert.isAbove(item.permissionCount, 0)

      for (const permission of item.permissions) {
        const catalogPermission = employeesPermissionBySlug.get(permission.slug)
        assert.exists(catalogPermission, permission.slug)
        assert.equal(permission.displayName, catalogPermission!.displayName, permission.slug)
        assert.equal(permission.section, catalogPermission!.section, permission.slug)
        assert.equal(permission.kind, catalogPermission!.kind, permission.slug)
      }
    }
  })
})
