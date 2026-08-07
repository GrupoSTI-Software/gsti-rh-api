import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Role from '#models/role'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import SystemPermissionCatalogSyncSeeder from '#database/seeders/0055_system_permission_catalog_sync_seeder'
import RolePresetService from '#services/role_preset_service'
import { RolePresetServiceError } from '#exceptions/role_preset_service_error'
import { getRolePreset } from '#constants/role_presets'

async function findEmployeesPermission(slug: string): Promise<SystemPermission> {
  const permission = await SystemPermission.query()
    .whereNull('system_permission_deleted_at')
    .where('system_permission_slug', slug)
    .whereHas('systemModule', (query) => {
      query.whereNull('system_module_deleted_at').where('system_module_slug', 'employees')
    })
    .first()

  if (!permission) {
    throw new Error(`El permiso employees:${slug} es requerido para este test.`)
  }

  return permission
}

test.group('RolePresetService.apply', (group) => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  let role: Role
  let customModule: SystemModule
  let customPermission: SystemPermission
  let employeesReadPermission: SystemPermission

  group.setup(async () => {
    await new SystemPermissionCatalogSyncSeeder({} as never).run()

    role = await Role.create({
      roleName: `TSP Apply ${stamp}`,
      roleSlug: `test-role-preset-apply-${stamp}`,
      roleDescription: 'Fixture de prueba',
      roleActive: 1,
      roleBusinessAccess: '',
      roleManagementDays: 17,
    })
    employeesReadPermission = await findEmployeesPermission('read')
    customModule = await SystemModule.create({
      systemModuleName: `TSP Apply Module ${stamp}`,
      systemModuleSlug: `tsp-apply-module-${stamp}`,
      systemModuleDescription: 'Fixture de prueba',
      systemModules: '1',
      systemModulePath: `/test-role-preset-apply-${stamp}`,
      systemModuleGroup: 'test',
      systemModuleActive: 1,
      systemModuleIcon: '',
    })
    customPermission = await SystemPermission.create({
      systemPermissionName: 'Payroll Read',
      systemPermissionSlug: 'payroll-read',
      systemModuleId: customModule.systemModuleId,
    })
  })

  group.each.setup(async () => {
    await RoleSystemPermission.query().where('role_id', role.roleId).delete()
    await RoleSystemPermission.create({
      roleId: role.roleId,
      systemPermissionId: employeesReadPermission.systemPermissionId,
    })
    await RoleSystemPermission.create({
      roleId: role.roleId,
      systemPermissionId: customPermission.systemPermissionId,
    })
  })

  group.teardown(async () => {
    await RoleSystemPermission.query().where('role_id', role.roleId).delete()
    await SystemPermission.query().where('system_permission_id', customPermission.systemPermissionId).delete()
    await SystemModule.query().where('system_module_id', customModule.systemModuleId).delete()
    await Role.query().where('role_id', role.roleId).delete()
  })

  test('replace deja exactamente la plantilla en employees y conserva otro módulo', async ({ assert }) => {
    const service = new RolePresetService()
    const preview = await service.preview(role.roleId, 'branch-supervisor', 'replace')

    await db.transaction(async (trx) => {
      await service.apply(
        role.roleId,
        {
          presetSlug: 'branch-supervisor',
          mode: 'replace',
          expectedPresetVersion: '1.0.0',
          baselinePermissionIds: preview.baselinePermissionIds,
        },
        trx
      )
    })

    const resolvedPreset = await service.resolveEmployeesPermissionIds(
      getRolePreset('branch-supervisor').permissionSlugs
    )
    const expectedEmployeesIds = resolvedPreset.ids
    const grants = await RoleSystemPermission.query()
      .where('role_id', role.roleId)
      .whereNull('role_system_permission_deleted_at')
    assert.includeMembers(
      grants.map((grant) => grant.systemPermissionId),
      [customPermission.systemPermissionId]
    )
    const employeeGrants = await RoleSystemPermission.query()
      .where('role_id', role.roleId)
      .whereHas('systemPermissions', (query) =>
        query.whereHas('systemModule', (moduleQuery) => moduleQuery.where('system_module_slug', 'employees'))
      )
    assert.deepEqual(
      employeeGrants.map((grant) => grant.systemPermissionId).sort((a, b) => a - b),
      expectedEmployeesIds.sort((a, b) => a - b)
    )
  })

  test('merge no retira permisos employees previos fuera de la plantilla', async ({ assert }) => {
    const sensitive = await findEmployeesPermission('sensitive-financiero-read')
    await RoleSystemPermission.create({
      roleId: role.roleId,
      systemPermissionId: sensitive.systemPermissionId,
    })
    const service = new RolePresetService()
    const preview = await service.preview(role.roleId, 'data-entry', 'merge')

    await db.transaction(async (trx) => {
      await service.apply(
        role.roleId,
        {
          presetSlug: 'data-entry',
          mode: 'merge',
          expectedPresetVersion: '1.0.0',
          baselinePermissionIds: preview.baselinePermissionIds,
        },
        trx
      )
    })

    const grants = await RoleSystemPermission.query().where('role_id', role.roleId)
    assert.include(grants.map((grant) => grant.systemPermissionId), sensitive.systemPermissionId)
    assert.include(grants.map((grant) => grant.systemPermissionId), customPermission.systemPermissionId)
  })

  test('versión de plantilla distinta aborta sin escribir', async ({ assert }) => {
    const service = new RolePresetService()
    const preview = await service.preview(role.roleId, 'read-only', 'replace')

    try {
      await db.transaction((trx) =>
        service.apply(
          role.roleId,
          {
            presetSlug: 'read-only',
            mode: 'replace',
            expectedPresetVersion: '0.0.0',
            baselinePermissionIds: preview.baselinePermissionIds,
          },
          trx
        )
      )
      assert.fail('La versión obsoleta debía fallar.')
    } catch (error) {
      assert.instanceOf(error, RolePresetServiceError)
      assert.equal((error as RolePresetServiceError).key, 'plantilla-version-obsoleta')
    }
    assert.lengthOf(await RoleSystemPermission.query().where('role_id', role.roleId), 2)
  })

  test('baseline obsoleta aborta sin escribir', async ({ assert }) => {
    const service = new RolePresetService()
    const preview = await service.preview(role.roleId, 'read-only', 'replace')
    const extra = await findEmployeesPermission('create')
    await RoleSystemPermission.create({ roleId: role.roleId, systemPermissionId: extra.systemPermissionId })

    try {
      await db.transaction((trx) =>
        service.apply(
          role.roleId,
          {
            presetSlug: 'read-only',
            mode: 'replace',
            expectedPresetVersion: '1.0.0',
            baselinePermissionIds: preview.baselinePermissionIds,
          },
          trx
        )
      )
      assert.fail('La baseline obsoleta debía fallar.')
    } catch (error) {
      assert.instanceOf(error, RolePresetServiceError)
      assert.equal((error as RolePresetServiceError).key, 'rol-permisos-cambiaron')
    }
  })

  test('fallo a mitad hace rollback cuando el caller revierte la trx', async ({ assert }) => {
    const service = new RolePresetService()
    const preview = await service.preview(role.roleId, 'read-only', 'replace')

    await assert.rejects(() =>
      db.transaction(async (trx) => {
        await service.apply(
          role.roleId,
          {
            presetSlug: 'read-only',
            mode: 'replace',
            expectedPresetVersion: '1.0.0',
            baselinePermissionIds: preview.baselinePermissionIds,
          },
          trx
        )
        throw new Error('rollback forzado para el test')
      })
    )

    const grants = await RoleSystemPermission.query().where('role_id', role.roleId)
    assert.lengthOf(grants, 2)
    const reloadedRole = await Role.query().where('role_id', role.roleId).firstOrFail()
    assert.equal(reloadedRole.roleManagementDays, 17)
  })
})
