import { BaseSeeder } from '@adonisjs/lucid/seeders'
import SystemSettingSystemModule from '../../app/models/system_setting_system_module.js'
import RoleSystemPermission from '../../app/models/role_system_permission.js'

/**
 * Vincula el módulo "Teletrabajadores" (NOM-037 5.1) al sistema.
 *
 * El alta del módulo (id 46) vive en `0017_system_module_seeder.ts` y su
 * permiso read (id 187) en `0018_system_permission_seeder.ts`. Este seeder
 * solo cubre lo que esos seeders base no siembran:
 *  1. El vínculo del módulo con el system_setting activo (id 1), requerido
 *     para que aparezca en el menú del Backoffice.
 *  2. La asignación del permiso read a los roles super-administrador (1)
 *     y rh-manager (2).
 *
 * No hay permiso de escritura: el listado es una vista derivada de solo lectura.
 * Idempotente: usa firstOrCreate; se puede re-ejecutar sin duplicar.
 *
 * Ref: USRH1782792802491 — Listado de teletrabajadores del 5.1 (vista derivada).
 */
export default class extends BaseSeeder {
  private readonly moduleId = 46
  private readonly readPermissionId = 187
  private readonly activeSettingId = 1
  private readonly roleIds = [1, 2]

  async run() {
    await this.linkModuleToActiveSetting()
    await this.assignPermissionToRoles()
  }

  private async linkModuleToActiveSetting() {
    // withTrashed: un vínculo con baja lógica bloquearía el INSERT del
    // firstOrCreate; si existe retirado, se deja tal cual (decisión manual).
    const existing = await SystemSettingSystemModule.query()
      .withTrashed()
      .where('systemSettingId', this.activeSettingId)
      .where('systemModuleId', this.moduleId)
      .first()

    if (existing) return

    await SystemSettingSystemModule.create({
      systemSettingId: this.activeSettingId,
      systemModuleId: this.moduleId,
    })
  }

  private async assignPermissionToRoles() {
    for (const roleId of this.roleIds) {
      const existing = await RoleSystemPermission.query()
        .withTrashed()
        .where('roleId', roleId)
        .where('systemPermissionId', this.readPermissionId)
        .first()

      if (existing) continue

      await RoleSystemPermission.create({
        roleId,
        systemPermissionId: this.readPermissionId,
      })
    }
  }
}
