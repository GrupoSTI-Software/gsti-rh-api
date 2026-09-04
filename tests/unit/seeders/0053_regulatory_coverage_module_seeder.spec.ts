import { test } from '@japa/runner'
import RegulatoryCoverageModuleSeeder from '#database/seeders/0053_regulatory_coverage_module_seeder'
import SystemModule from '#models/system_module'
import SystemModuleGroup from '#models/system_module_group'
import SystemPermission from '#models/system_permission'
import SystemSettingSystemModule from '#models/system_setting_system_module'
import RoleSystemPermission from '#models/role_system_permission'

/**
 * Tests del seeder 0053_regulatory_coverage_module_seeder (USRH1785246338065).
 *
 * Cubre los criterios de aceptación del spec:
 *  - CA-1: alta completa del catálogo (módulo activo, 4 permisos, vínculo
 *    vestigial, 8 filas de role_system_permissions para los roles 1 y 2).
 *  - CA-4: idempotencia — correr el seeder dos veces no duplica ni pisa filas
 *    de otros módulos.
 *
 * No usa ids hardcodeados de otras suites: lee todo por `system_module_slug`
 * / `system_module_id` resuelto en runtime, para no acoplarse a la numeración
 * exacta (que puede rotar en otros ambientes) — solo a la fila que este
 * seeder efectivamente creó.
 */

const MODULE_SLUG = 'regulatory-coverage'
const EXPECTED_PERMISSION_SLUGS = ['read', 'create', 'update', 'delete'] as const
const EXPECTED_ROLE_IDS = [1, 2] as const

async function findModule() {
  return SystemModule.query()
    .whereNull('system_module_deleted_at')
    .where('system_module_slug', MODULE_SLUG)
    .first()
}

test.group('0053_regulatory_coverage_module_seeder — alta del módulo', () => {
  test('CA-1: siembra el módulo activo con nombre, grupo, path y slug correctos', async ({
    assert,
  }) => {
    await new RegulatoryCoverageModuleSeeder({} as never).run()

    const systemModule = await findModule()
    assert.exists(systemModule, 'debe existir el módulo regulatory-coverage')
    assert.equal(systemModule!.systemModuleName, 'Cobertura regulatoria')
    assert.equal(systemModule!.systemModulePath, '/regulatory-coverage')
    const empresaGroup = await SystemModuleGroup.findBy('system_module_group_key', 'empresa')
    assert.equal(
      systemModule!.systemModuleGroupId,
      empresaGroup?.systemModuleGroupId,
      'el módulo debe apuntar al grupo "empresa" del catálogo'
    )
    assert.equal(
      systemModule!.systemModuleActive,
      1,
      'systemModuleActive=1 es el flag que gatea menú y acceso (regla 2)'
    )
    assert.isNull(systemModule!.deletedAt)
  })

  test('CA-1: siembra exactamente los 4 permisos estándar ligados al módulo', async ({
    assert,
  }) => {
    await new RegulatoryCoverageModuleSeeder({} as never).run()

    const systemModule = await findModule()
    const permissions = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('system_module_id', systemModule!.systemModuleId)
      .orderBy('system_permission_id')

    assert.lengthOf(permissions, 4)
    assert.deepEqual(
      permissions.map((p) => p.systemPermissionSlug),
      [...EXPECTED_PERMISSION_SLUGS]
    )
  })

  test('CA-1: siembra el vínculo vestigial con el system_setting activo (id 1)', async ({
    assert,
  }) => {
    await new RegulatoryCoverageModuleSeeder({} as never).run()

    const systemModule = await findModule()
    const link = await SystemSettingSystemModule.query()
      .whereNull('system_setting_system_module_deleted_at')
      .where('system_setting_id', 1)
      .where('system_module_id', systemModule!.systemModuleId)
      .first()

    assert.exists(link, 'debe existir el vínculo (vestigial, no gatea nada por sí solo)')
  })

  test('CA-1: asigna el permiso read (y los otros 3) a los roles 1 y 2, nunca a root/owner', async ({
    assert,
  }) => {
    await new RegulatoryCoverageModuleSeeder({} as never).run()

    const systemModule = await findModule()
    const permissions = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('system_module_id', systemModule!.systemModuleId)
      .orderBy('system_permission_id')

    const rolePermissions = await RoleSystemPermission.query()
      .whereNull('role_system_permission_deleted_at')
      .whereIn(
        'system_permission_id',
        permissions.map((p) => p.systemPermissionId)
      )

    assert.lengthOf(rolePermissions, 8, '2 roles x 4 permisos = 8 filas')

    const roleIdsSeen = new Set(rolePermissions.map((rp) => rp.roleId))
    assert.deepEqual([...roleIdsSeen].sort(), [...EXPECTED_ROLE_IDS])

    for (const permission of permissions) {
      for (const roleId of EXPECTED_ROLE_IDS) {
        const found = rolePermissions.find(
          (rp) => rp.roleId === roleId && rp.systemPermissionId === permission.systemPermissionId
        )
        assert.exists(
          found,
          `debe existir role_system_permission para roleId=${roleId} / ${permission.systemPermissionSlug}`
        )
      }
    }
  })
})

test.group('0053_regulatory_coverage_module_seeder — idempotencia (CA-4, regla 5)', () => {
  test('correr el seeder dos veces no duplica el módulo, sus permisos ni las asignaciones de rol', async ({
    assert,
  }) => {
    await new RegulatoryCoverageModuleSeeder({} as never).run()
    await new RegulatoryCoverageModuleSeeder({} as never).run()

    const modules = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', MODULE_SLUG)
    assert.lengthOf(modules, 1, 'no debe duplicarse la fila del módulo')

    const systemModule = modules[0]
    const permissions = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('system_module_id', systemModule.systemModuleId)
    assert.lengthOf(permissions, 4, 'no deben duplicarse los 4 permisos')

    const link = await SystemSettingSystemModule.query()
      .whereNull('system_setting_system_module_deleted_at')
      .where('system_setting_id', 1)
      .where('system_module_id', systemModule.systemModuleId)
    assert.lengthOf(link, 1, 'no debe duplicarse el vínculo vestigial')

    const rolePermissions = await RoleSystemPermission.query()
      .whereNull('role_system_permission_deleted_at')
      .whereIn(
        'system_permission_id',
        permissions.map((p) => p.systemPermissionId)
      )
    assert.lengthOf(rolePermissions, 8, 'no deben duplicarse las 8 asignaciones de rol')
  })
})
