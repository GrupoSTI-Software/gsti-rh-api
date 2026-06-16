import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import SystemModule from '../../app/models/system_module.js'
import SystemPermission from '../../app/models/system_permission.js'
import SystemSettingSystemModule from '../../app/models/system_setting_system_module.js'
import RoleSystemPermission from '../../app/models/role_system_permission.js'

/**
 * Registra en el sistema el módulo de "Buzón de quejas" (NOM-035 §8.1.b).
 *
 * Siembra únicamente configuración de sistema (no datos de negocio):
 *  1. El módulo en `system_modules` (id 41) para que exista en el catálogo.
 *  2. Los 4 permisos read/create/update/delete (ids 169-172) ligados al módulo.
 *  3. El vínculo del módulo con el system_setting activo (id 1) para que aparezca en el menú.
 *  4. La asignación de los 4 permisos a los roles super-administrador (1) y rh-manager (2).
 *
 * El módulo es confidencial: solo super-administrador y rh-manager tienen acceso;
 * el supervisor directo no accede (criterio NOM-035 buzón confidencial).
 * Idempotente: usa updateOrCreate/firstOrCreate; se puede re-ejecutar sin duplicar.
 */
export default class extends BaseSeeder {
  /** Id del módulo (siguiente libre tras el 40 de eventos traumáticos). */
  private readonly moduleId = 41

  /** Id del system_setting activo al que se vincula el módulo. */
  private readonly activeSettingId = 1

  /** Roles que reciben los permisos del módulo (super-administrador y rh-manager). */
  private readonly roleIds = [1, 2]

  /** Permisos del módulo con sus ids fijos (siguientes libres tras el 168). */
  private readonly permissions = [
    { systemPermissionId: 169, systemPermissionName: 'Read', systemPermissionSlug: 'read' },
    { systemPermissionId: 170, systemPermissionName: 'Create', systemPermissionSlug: 'create' },
    { systemPermissionId: 171, systemPermissionName: 'Update', systemPermissionSlug: 'update' },
    { systemPermissionId: 172, systemPermissionName: 'Delete', systemPermissionSlug: 'delete' },
  ]

  async run() {
    await this.seedModule()
    await this.seedPermissions()
    await this.linkModuleToActiveSetting()
    await this.assignPermissionsToRoles()
  }

  /** 1. Alta del módulo en el catálogo. */
  private async seedModule() {
    await SystemModule.updateOrCreate(
      { systemModuleId: this.moduleId },
      {
        systemModuleName: 'Buzón de quejas',
        systemModuleSlug: 'complaints',
        systemModuleDescription:
          'Canal confidencial de quejas conforme a NOM-035-STPS-2018 numeral 8.1.b',
        systemModules: '1',
        systemModulePath: '/complaints',
        systemModuleGroup: '5. NOM-035',
        systemModuleActive: 1,
        systemModuleIcon: `<svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <polyline points="22,6 12,13 2,6" />
        </svg>`,
        systemModuleUpdatedAt: DateTime.now(),
      }
    )
  }

  /** 2. Alta de los 4 permisos ligados al módulo. */
  private async seedPermissions() {
    for (const permission of this.permissions) {
      await SystemPermission.updateOrCreate(
        { systemPermissionId: permission.systemPermissionId },
        { ...permission, systemModuleId: this.moduleId }
      )
    }
  }

  /** 3. Vínculo del módulo con el system_setting activo (para que salga en el menú). */
  private async linkModuleToActiveSetting() {
    await SystemSettingSystemModule.firstOrCreate(
      { systemSettingId: this.activeSettingId, systemModuleId: this.moduleId },
      { systemSettingId: this.activeSettingId, systemModuleId: this.moduleId }
    )
  }

  /** 4. Asignación de los 4 permisos a los roles indicados. */
  private async assignPermissionsToRoles() {
    for (const roleId of this.roleIds) {
      for (const permission of this.permissions) {
        await RoleSystemPermission.firstOrCreate(
          { roleId, systemPermissionId: permission.systemPermissionId },
          { roleId, systemPermissionId: permission.systemPermissionId }
        )
      }
    }
  }
}
