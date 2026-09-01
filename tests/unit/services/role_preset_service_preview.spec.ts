import { test } from '@japa/runner'
import Role from '#models/role'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import SystemPermissionCatalogSyncSeeder from '#database/seeders/0055_system_permission_catalog_sync_seeder'
import { EMPLOYEES_PERMISSION_CATALOG } from '#constants/employees_permission_catalog'
import RolePresetService from '#services/role_preset_service'

async function findEmployeesPermission(slug: string): Promise<SystemPermission> {
  const permission = await SystemPermission.query()
    .whereNull('system_permission_deleted_at')
    .where('system_permission_slug', slug)
    .whereHas('systemModule', (query) => {
      query
        .whereNull('system_module_deleted_at')
        .where('system_module_slug', 'employees')
    })
    .first()

  if (!permission) {
    throw new Error(`El permiso employees:${slug} es requerido para este test.`)
  }

  return permission
}

const employeesPermissionBySlug = new Map(
  EMPLOYEES_PERMISSION_CATALOG.map((permission) => [permission.slug, permission] as const)
)

test.group('RolePresetService.computeDesiredPermissionIds / preview', (group) => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  let role: Role
  let customModule: SystemModule
  let customPermission: SystemPermission
  let employeesReadPermission: SystemPermission

  group.setup(async () => {
    await new SystemPermissionCatalogSyncSeeder({} as never).run()

    role = await Role.create({
      roleName: `TSP Preview ${stamp}`,
      roleSlug: `test-role-preset-preview-${stamp}`,
      roleDescription: 'Fixture de prueba',
      roleActive: 1,
      roleBusinessAccess: '',
    })

    employeesReadPermission = await findEmployeesPermission('read')

    customModule = await SystemModule.create({
      systemModuleName: `TSP Module ${stamp}`,
      systemModuleSlug: `tsp-prev-module-${stamp}`,
      systemModuleDescription: 'Fixture de prueba',
      systemModules: '1',
      systemModulePath: `/test-role-preset-preview-${stamp}`,
      systemModuleActive: 1,
      systemModuleOrder: 10,
      systemModuleIcon: '',
    })

    customPermission = await SystemPermission.create({
      systemPermissionName: 'Test Custom Read',
      systemPermissionSlug: `test-custom-read-${stamp}`,
      systemModuleId: customModule.systemModuleId,
    })

    // Se crea primero el permiso externo para verificar que baseline salga ordenado ASC.
    await RoleSystemPermission.create({
      roleId: role.roleId,
      systemPermissionId: customPermission.systemPermissionId,
    })
    await RoleSystemPermission.create({
      roleId: role.roleId,
      systemPermissionId: employeesReadPermission.systemPermissionId,
    })
  })

  group.teardown(async () => {
    await RoleSystemPermission.query().where('role_id', role.roleId).delete()
    await SystemPermission.query()
      .where('system_permission_id', customPermission.systemPermissionId)
      .delete()
    await SystemModule.query().where('system_module_id', customModule.systemModuleId).delete()
    await Role.query().where('role_id', role.roleId).delete()
  })

  test('merge une plantilla con permisos de otros módulos y no retira employees previos', ({
    assert,
  }) => {
    const service = new RolePresetService()
    const desired = service.computeDesiredPermissionIds({
      mode: 'merge',
      currentIds: [1, 2, 100],
      presetEmployeesIds: [2, 3],
      allEmployeesPermissionIds: [1, 2, 3, 4],
    })

    assert.deepEqual(desired, [1, 2, 3, 100])
  })

  test('replace sustituye solo employees y conserva otros módulos', ({ assert }) => {
    const service = new RolePresetService()
    const desired = service.computeDesiredPermissionIds({
      mode: 'replace',
      currentIds: [1, 2, 100],
      presetEmployeesIds: [3],
      allEmployeesPermissionIds: [1, 2, 3, 4],
    })

    assert.deepEqual(desired, [3, 100])
  })

  test('preview en merge deja revoked vacío y baseline ordenado', async ({ assert }) => {
    const service = new RolePresetService()
    const preview = await service.preview(role.roleId, 'data-entry', 'merge')
    const expectedBaseline = [employeesReadPermission.systemPermissionId, customPermission.systemPermissionId].sort(
      (a, b) => a - b
    )

    assert.equal(preview.mode, 'merge')
    assert.equal(preview.preset.slug, 'data-entry')
    assert.deepEqual(preview.baselinePermissionIds, expectedBaseline)
    assert.lengthOf(preview.revoked, 0)
    assert.isTrue(preview.unchanged.some((item) => item.slug === 'read'))
    assert.isTrue(preview.granted.length > 0)

    const readItem = preview.unchanged.find((item) => item.slug === 'read')
    assert.exists(readItem)
    assert.equal(readItem?.moduleSlug, 'employees')
    assert.equal(readItem?.displayName, employeesPermissionBySlug.get('read')!.displayName)
  })

  test('preview con rol inexistente lanza 404 estable', async ({ assert }) => {
    const service = new RolePresetService()

    try {
      await service.preview(999999999, 'data-entry', 'merge')
      assert.fail('La vista previa debía fallar con un rol inexistente.')
    } catch (error: any) {
      assert.equal(error.httpStatus, 404)
      assert.equal(error.key, 'rol-no-encontrado')
      assert.equal(error.code, 'PLT.RP.ROLE_NOT_FOUND')
    }
  })
})
