import { BaseSeeder } from '@adonisjs/lucid/seeders'
import RoleSystemPermission from '../../app/models/role_system_permission.js'
import {
  resolveRoleIdsBySlug,
  resolveSystemModuleIdsBySlug,
  upsertSystemPermissionsBySlug,
} from '../../app/helpers/system_catalog_seed_resolver.js'

/**
 * Permisos del módulo "Evidencia de aceptaciones" (USRH1783368377327): acceso
 * (`read`) y revelado de metadatos sensibles (`reveal`), ambos otorgados
 * ÚNICAMENTE al rol `root` (ver `database/seeders/0006_role_seeder.ts`).
 *
 * NO se asignan a `super-administrador`: ese rol es el "Director general" de una
 * empresa CLIENTE (`app/modules/demo/factories/user_factory.ts:41`), no un rol de
 * plataforma GSTI — asignarle acceso filtraría evidencia global de todas las
 * empresas a un usuario de empresa cliente (viola la regla 1 de la HU).
 *
 * Identificación por SLUG, nunca por id literal:
 *  - El módulo lo DECLARA `0048_consent_evidence_module_seeder.ts`; aquí solo se
 *    referencia por su slug (`consent-evidence`) y se resuelve su id. Si ese
 *    seeder no corrió antes, el resolver lanza nombrando el módulo faltante en
 *    vez de colgar los permisos del módulo equivocado.
 *  - Los permisos los declara este seeder, identificados por el par
 *    (módulo, slug). El id lo asigna la BD y se usa el mapa devuelto para
 *    concederlos.
 *  - El rol destinatario se resuelve por slug (`root`), porque los ids de rol
 *    tampoco son estables (ver `app/helpers/system_catalog_seed_resolver.ts`).
 *
 * `reveal` se siembra a root con `RoleService.hasExplicitAccess` (sin el atajo de
 * `root` que sí tiene `hasAccess`): revocar esta fila deja a root sin poder
 * revelar IP/user-agent en claro, aunque siga pasando la reserva de acceso al
 * módulo. Real y revocable, tal como pide el spec técnico.
 *
 * Idempotente: usa updateOrCreate/firstOrCreate; se puede re-ejecutar sin duplicar.
 */
export default class extends BaseSeeder {
  /** Nombre propio, para que los errores del resolver digan quién falló. */
  private readonly seederName = '0049_consent_evidence_permissions_seeder'

  /** Slug del módulo que declara `0048_consent_evidence_module_seeder`. */
  private readonly moduleSlug = 'consent-evidence'

  /** Rol destinatario de los permisos, por slug estable. */
  private readonly rootRoleSlug = 'root'

  /** Permisos del módulo. El id lo asigna la BD; la identidad es (módulo, slug). */
  private readonly permissions = [
    { systemPermissionName: 'Read', systemPermissionSlug: 'read' },
    { systemPermissionName: 'Reveal', systemPermissionSlug: 'reveal' },
  ]

  async run() {
    const permissionIdBySlug = await this.seedPermissions()
    await this.assignPermissionsToRoot(permissionIdBySlug)
  }

  /** Alta de los permisos sobre el módulo referenciado, resuelto por slug. */
  private async seedPermissions(): Promise<Map<string, number>> {
    const moduleIdBySlug = await resolveSystemModuleIdsBySlug([this.moduleSlug], this.seederName)
    const systemModuleId = moduleIdBySlug.get(this.moduleSlug)!

    return upsertSystemPermissionsBySlug(systemModuleId, this.permissions, this.seederName)
  }

  /** Asignación de ambos permisos al rol root. */
  private async assignPermissionsToRoot(permissionIdBySlug: Map<string, number>) {
    const roleIdBySlug = await resolveRoleIdsBySlug([this.rootRoleSlug], this.seederName)
    const roleId = roleIdBySlug.get(this.rootRoleSlug)!

    for (const permission of this.permissions) {
      const systemPermissionId = permissionIdBySlug.get(permission.systemPermissionSlug)!
      await RoleSystemPermission.firstOrCreate(
        { roleId, systemPermissionId },
        { roleId, systemPermissionId }
      )
    }
  }
}
