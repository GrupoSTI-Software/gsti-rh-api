import { BaseSeeder } from '@adonisjs/lucid/seeders'
import SystemPermission from '../../app/models/system_permission.js'
import RoleSystemPermission from '../../app/models/role_system_permission.js'

/**
 * Habilita permiso write en compliance (módulo 42) para lanzar/eliminar
 * aplicaciones de cuestionario NOM-035.
 */
export default class extends BaseSeeder {
  private readonly moduleId = 42
  private readonly writePermissionId = 174
  private readonly roleIds = [1, 2]

  async run() {
    await SystemPermission.updateOrCreate(
      { systemPermissionId: this.writePermissionId },
      {
        systemPermissionId: this.writePermissionId,
        systemPermissionName: 'Gestionar',
        systemPermissionSlug: 'write',
        systemModuleId: this.moduleId,
      }
    )

    for (const roleId of this.roleIds) {
      await RoleSystemPermission.firstOrCreate(
        { roleId, systemPermissionId: this.writePermissionId },
        { roleId, systemPermissionId: this.writePermissionId }
      )
    }
  }
}
