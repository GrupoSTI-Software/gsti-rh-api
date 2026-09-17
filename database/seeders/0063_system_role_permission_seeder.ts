import { BaseSeeder } from '@adonisjs/lucid/seeders'
import RoleSystemPermission from '#models/role_system_permission'
import SystemPermission from '#models/system_permission'
import {
  resolveRoleIdsBySlug,
  resolveSystemModuleIdsBySlug,
} from '../../app/helpers/system_catalog_seed_resolver.js'

/**
 * Concede los permisos que ningún atajo por rol cubre y que nadie puede darse
 * desde la pantalla de Roles y permisos.
 *
 * Hoy es uno solo: `consent-evidence:reveal` para `root`. El API lo verifica
 * con `RoleService.hasExplicitAccess`, que a propósito no tiene el atajo de
 * root (revelar la evidencia de un consentimiento debe ser una concesión real,
 * auditable y revocable), y el backoffice oculta a root en la pantalla de
 * roles. Sin esta fila, en una base nueva nadie puede revelar.
 *
 * Corre después de `0006_role_seeder` (crea root) y de
 * `0062_system_module_seeder` (crea el módulo y su permiso).
 * Idempotente: `firstOrCreate` por el par (rol, permiso).
 */
export default class extends BaseSeeder {
  /** Nombre propio, para que los errores de los resolvers digan quién falló. */
  private readonly seederName = 'system_role_permission_seeder'

  private readonly grants = [
    { roleSlug: 'root', systemModuleSlug: 'consent-evidence', systemPermissionSlug: 'reveal' },
  ]

  async run() {
    const roleIdBySlug = await resolveRoleIdsBySlug(
      this.grants.map((grant) => grant.roleSlug),
      this.seederName
    )
    const systemModuleIdBySlug = await resolveSystemModuleIdsBySlug(
      this.grants.map((grant) => grant.systemModuleSlug),
      this.seederName
    )

    for (const grant of this.grants) {
      const systemPermission = await SystemPermission.query()
        .where('systemModuleId', systemModuleIdBySlug.get(grant.systemModuleSlug)!)
        .where('systemPermissionSlug', grant.systemPermissionSlug)
        .first()

      if (!systemPermission) {
        throw new Error(
          `[${this.seederName}] Permiso no encontrado: ${grant.systemModuleSlug}:${grant.systemPermissionSlug}. ` +
            'Verifica que 0062_system_module_seeder haya corrido antes.'
        )
      }

      const roleId = roleIdBySlug.get(grant.roleSlug)!
      await RoleSystemPermission.firstOrCreate(
        { roleId, systemPermissionId: systemPermission.systemPermissionId },
        { roleId, systemPermissionId: systemPermission.systemPermissionId }
      )
    }
  }
}
