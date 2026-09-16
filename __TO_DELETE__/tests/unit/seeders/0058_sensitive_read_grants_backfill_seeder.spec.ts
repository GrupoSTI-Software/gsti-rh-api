import { test } from '@japa/runner'
import Role from '#models/role'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import RoleSystemPermission from '#models/role_system_permission'
import SensitiveReadGrantsBackfillSeeder from '#database/seeders/0058_sensitive_read_grants_backfill_seeder'

const READ_SLUGS = [
  'sensitive-identificacion-read',
  'sensitive-contacto-read',
  'sensitive-financiero-read',
  'sensitive-salud-read',
  'sensitive-biometrico-read',
] as const

async function employeesModule(): Promise<SystemModule> {
  const row = await SystemModule.query()
    .whereNull('system_module_deleted_at')
    .where('system_module_slug', 'employees')
    .first()
  if (!row) {
    throw new Error('El módulo employees debe existir en la BD de pruebas.')
  }
  return row
}

test.group('0058_sensitive_read_grants_backfill_seeder', (group) => {
  let fixtureRole: Role
  let reveal: SystemPermission

  group.setup(async () => {
    const module = await employeesModule()
    const found = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('system_module_id', module.systemModuleId)
      .where('system_permission_slug', 'reveal-sensitive-data')
      .first()
    if (!found) {
      throw new Error('reveal-sensitive-data debe existir. Corre 0047 y 0055 antes.')
    }
    reveal = found

    fixtureRole = await Role.create({
      roleName: 'Backfill Sensitive Read Fixture',
      roleSlug: `backfill-sens-read-${Date.now()}`,
      roleDescription: 'Fixture',
      roleActive: 1,
      roleBusinessAccess: '',
    })
    await RoleSystemPermission.firstOrCreate(
      { roleId: fixtureRole.roleId, systemPermissionId: reveal.systemPermissionId },
      { roleId: fixtureRole.roleId, systemPermissionId: reveal.systemPermissionId }
    )
  })

  group.teardown(async () => {
    const module = await employeesModule()
    const reads = await SystemPermission.query()
      .where('system_module_id', module.systemModuleId)
      .whereIn('system_permission_slug', [...READ_SLUGS])
    const ids = reads.map((row) => row.systemPermissionId)
    await RoleSystemPermission.query()
      .where('role_id', fixtureRole.roleId)
      .whereIn('system_permission_id', [...ids, reveal.systemPermissionId])
      .delete()
    await Role.query().where('role_id', fixtureRole.roleId).delete()
  })

  test('concede las cinco lecturas al rol con reveal-sensitive-data y no duplica al correr dos veces', async ({
    assert,
  }) => {
    const seeder = new SensitiveReadGrantsBackfillSeeder({} as never)
    await seeder.run()
    await seeder.run()

    const module = await employeesModule()
    const reads = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('system_module_id', module.systemModuleId)
      .whereIn('system_permission_slug', [...READ_SLUGS])
    assert.equal(reads.length, 5)

    for (const permission of reads) {
      const grants = await RoleSystemPermission.query()
        .whereNull('role_system_permission_deleted_at')
        .where('role_id', fixtureRole.roleId)
        .where('system_permission_id', permission.systemPermissionId)
      assert.equal(grants.length, 1, permission.systemPermissionSlug)
    }

    const revealGrants = await RoleSystemPermission.query()
      .whereNull('role_system_permission_deleted_at')
      .where('role_id', fixtureRole.roleId)
      .where('system_permission_id', reveal.systemPermissionId)
    assert.equal(revealGrants.length, 1)
  })
})
