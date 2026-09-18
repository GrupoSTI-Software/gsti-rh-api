import { BaseSeeder } from '@adonisjs/lucid/seeders'
import RoleSystemPermission from '../../app/models/role_system_permission.js'
import {
  resolveRoleIdsBySlug,
  resolveSystemModuleIdsBySlug,
  upsertSystemPermissionsBySlug,
} from '../../app/helpers/system_catalog_seed_resolver.js'

/**
 * Habilita el permiso `write` del módulo `compliance` (Aplicabilidad NOM-035)
 * para lanzar/eliminar aplicaciones de cuestionario, y lo asigna a los roles
 * super-administrador y rh-manager.
 *
 * Identificación por slug, nunca por id:
 *  - El módulo lo declara `0017_system_module_seeder`; aquí solo se REFERENCIA,
 *    resolviéndolo por su slug `compliance`.
 *  - El permiso `write` lo declara ESTE seeder: ningún otro lo siembra
 *    (`0018_system_permission_seeder` solo declara `read` sobre ese módulo).
 *    Se da de alta por el par (módulo, slug), así que la BD asigna el id.
 *  - Los roles se resuelven por `roleSlug`: el id 1 no es super-administrador
 *    sino `kiosco` (ver `app/helpers/system_catalog_seed_resolver.ts`).
 *
 * Idempotente: usa upsert por slug y firstOrCreate; se puede re-ejecutar sin
 * duplicar.
 */
export default class extends BaseSeeder {
  /** Nombre propio, para que los errores del resolver digan quién falló. */
  private readonly seederName = '0039_nom035_questionnaire_application_permissions_seeder'

  /** Slug del módulo que se referencia. Lo declara 0017_system_module_seeder. */
  private readonly moduleSlug = 'compliance'

  /** Roles que reciben el permiso, por slug estable. */
  private readonly roleSlugs = ['super-administrador', 'rh-manager']

  /** Permiso del módulo. El id lo asigna la BD; la identidad es (módulo, slug). */
  private readonly permissions = [
    { systemPermissionName: 'Gestionar', systemPermissionSlug: 'write' },
  ]

  async run() {
    const moduleIdBySlug = await resolveSystemModuleIdsBySlug([this.moduleSlug], this.seederName)
    const systemModuleId = moduleIdBySlug.get(this.moduleSlug)!

    const permissionIdBySlug = await upsertSystemPermissionsBySlug(
      systemModuleId,
      this.permissions,
      this.seederName
    )

    await this.assignPermissionsToRoles(permissionIdBySlug)
  }

  /** Asignación del permiso a los roles indicados. */
  private async assignPermissionsToRoles(permissionIdBySlug: Map<string, number>) {
    const roleIdBySlug = await resolveRoleIdsBySlug(this.roleSlugs, this.seederName)

    for (const roleSlug of this.roleSlugs) {
      const roleId = roleIdBySlug.get(roleSlug)!
      for (const permission of this.permissions) {
        const systemPermissionId = permissionIdBySlug.get(permission.systemPermissionSlug)!
        await RoleSystemPermission.firstOrCreate(
          { roleId, systemPermissionId },
          { roleId, systemPermissionId }
        )
      }
    }
  }
}
