import { BaseSeeder } from '@adonisjs/lucid/seeders'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import RoleSystemPermission from '#models/role_system_permission'

const REVEAL_SLUG = 'reveal-sensitive-data'
const READ_SLUGS = [
  'sensitive-identificacion-read',
  'sensitive-contacto-read',
  'sensitive-financiero-read',
  'sensitive-salud-read',
  'sensitive-biometrico-read',
] as const

/**
 * Concesión de transición (USRH1787204602825, regla 9): los roles que ya
 * tienen `reveal-sensitive-data` reciben las cinco lecturas por categoría,
 * para que nadie pierda acceso el día del despliegue.
 *
 * Idempotente: `firstOrCreate`; se puede re-ejecutar sin duplicar.
 * No retira `reveal-sensitive-data`. No concede permisos de escritura.
 * Resuelve por slug, nunca por id numérico.
 */
export default class extends BaseSeeder {
  async run() {
    const employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .first()

    if (!employeesModule) {
      throw new Error(
        'Seeder 0058: no existe el módulo employees. Corre primero 0017_system_module_seeder.'
      )
    }

    const reveal = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('system_module_id', employeesModule.systemModuleId)
      .where('system_permission_slug', REVEAL_SLUG)
      .first()

    if (!reveal) {
      throw new Error(
        'Seeder 0058: no existe reveal-sensitive-data en employees. Corre primero 0047_pii_sensitive_data_module_seeder.ts.'
      )
    }

    const readPermissions = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('system_module_id', employeesModule.systemModuleId)
      .whereIn('system_permission_slug', [...READ_SLUGS])

    if (readPermissions.length !== READ_SLUGS.length) {
      const found = new Set(readPermissions.map((row) => row.systemPermissionSlug))
      const missing = READ_SLUGS.filter((slug) => !found.has(slug))
      throw new Error(
        `Seeder 0058: faltan permisos de lectura sensible (${missing.join(', ')}). Corre primero 0055_system_permission_catalog_sync_seeder.ts.`
      )
    }

    const revealGrants = await RoleSystemPermission.query()
      .whereNull('role_system_permission_deleted_at')
      .where('system_permission_id', reveal.systemPermissionId)

    for (const grant of revealGrants) {
      for (const permission of readPermissions) {
        await RoleSystemPermission.firstOrCreate(
          { roleId: grant.roleId, systemPermissionId: permission.systemPermissionId },
          { roleId: grant.roleId, systemPermissionId: permission.systemPermissionId }
        )
      }
    }
  }
}
