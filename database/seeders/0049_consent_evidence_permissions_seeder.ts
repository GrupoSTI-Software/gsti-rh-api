import { BaseSeeder } from '@adonisjs/lucid/seeders'
import SystemPermission from '../../app/models/system_permission.js'
import RoleSystemPermission from '../../app/models/role_system_permission.js'

/**
 * Permisos del módulo "Evidencia de aceptaciones" (USRH1783368377327): acceso
 * (`read`) y revelado de metadatos sensibles (`reveal`), ambos otorgados
 * ÚNICAMENTE al rol `root` (id 3 — ver `database/seeders/0006_role_seeder.ts`).
 *
 * NO se asignan a `super-administrador` (id 1): ese rol es el "Director general"
 * de una empresa CLIENTE (`app/modules/demo/factories/user_factory.ts:41`), no un
 * rol de plataforma GSTI — asignarle acceso filtraría evidencia global de todas
 * las empresas a un usuario de empresa cliente (viola la regla 1 de la HU).
 *
 * `reveal` se siembra a root con `RoleService.hasExplicitAccess` (sin el atajo de
 * `root` que sí tiene `hasAccess`): revocar esta fila deja a root sin poder
 * revelar IP/user-agent en claro, aunque siga pasando la reserva de acceso al
 * módulo. Real y revocable, tal como pide el spec técnico.
 *
 * Idempotente: usa updateOrCreate/firstOrCreate; se puede re-ejecutar sin duplicar.
 */
export default class extends BaseSeeder {
  private readonly moduleId = 46
  private readonly rootRoleId = 3
  private readonly permissions = [
    { systemPermissionId: 187, systemPermissionName: 'Read', systemPermissionSlug: 'read' },
    { systemPermissionId: 188, systemPermissionName: 'Reveal', systemPermissionSlug: 'reveal' },
  ]

  async run() {
    await this.seedPermissions()
    await this.assignPermissionsToRoot()
  }

  private async seedPermissions() {
    for (const permission of this.permissions) {
      await SystemPermission.updateOrCreate(
        { systemPermissionId: permission.systemPermissionId },
        { ...permission, systemModuleId: this.moduleId }
      )
    }
  }

  private async assignPermissionsToRoot() {
    for (const permission of this.permissions) {
      await RoleSystemPermission.firstOrCreate(
        { roleId: this.rootRoleId, systemPermissionId: permission.systemPermissionId },
        { roleId: this.rootRoleId, systemPermissionId: permission.systemPermissionId }
      )
    }
  }
}
