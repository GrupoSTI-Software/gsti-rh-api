import { BaseSeeder } from '@adonisjs/lucid/seeders'
import SystemSettingSystemModule from '../../app/models/system_setting_system_module.js'
import RoleSystemPermission from '../../app/models/role_system_permission.js'

/**
 * Vincula el módulo de "Aplicabilidad de cuestionarios NOM-035" (id 42)
 * con el system_setting activo y asigna el permiso read (id 173)
 * a los roles super-administrador (1) y rh-manager (2).
 *
 * El módulo y el permiso son sembrados por 0017 y 0018 respectivamente.
 * Idempotente: usa firstOrCreate; se puede re-ejecutar sin duplicar.
 */
export default class extends BaseSeeder {
  private readonly moduleId = 42
  private readonly activeSettingId = 1
  private readonly roleIds = [2]
  private readonly permissionIds = [173]

  async run() {
    await this.linkModuleToActiveSetting()
    await this.assignPermissionsToRoles()
  }

  private async linkModuleToActiveSetting() {
    await SystemSettingSystemModule.firstOrCreate(
      { systemSettingId: this.activeSettingId, systemModuleId: this.moduleId },
      { systemSettingId: this.activeSettingId, systemModuleId: this.moduleId }
    )
  }

  private async assignPermissionsToRoles() {
    for (const roleId of this.roleIds) {
      for (const permissionId of this.permissionIds) {
        await RoleSystemPermission.firstOrCreate(
          { roleId, systemPermissionId: permissionId },
          { roleId, systemPermissionId: permissionId }
        )
      }
    }
  }
}
