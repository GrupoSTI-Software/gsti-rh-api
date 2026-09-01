import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import SystemModule from '../../app/models/system_module.js'
import SystemPermission from '../../app/models/system_permission.js'
import SystemSettingSystemModule from '../../app/models/system_setting_system_module.js'
import RoleSystemPermission from '../../app/models/role_system_permission.js'

/**
 * Registra en el sistema el módulo de "Overrides de jornada" (pantalla HU-A del BO).
 *
 * Siembra únicamente configuración de sistema (no datos de negocio):
 *  1. El módulo en `system_modules` (id 39) para que exista en el catálogo.
 *  2. Los 4 permisos read/create/update/delete (ids 161-164) ligados al módulo.
 *  3. El vínculo del módulo con el system_setting activo (id 1) para que aparezca en el menú.
 *  4. La asignación de los 4 permisos a los roles super-administrador (1) y rh-manager (2).
 *
 * Los overrides en sí (business_unit_id con valor) se crean por el CRUD, no aquí.
 * Idempotente: usa updateOrCreate/firstOrCreate, se puede re-ejecutar sin duplicar.
 */
export default class extends BaseSeeder {
  /** Id del módulo (siguiente libre tras el 38). */
  private readonly moduleId = 39

  /** Id del system_setting activo al que se vincula el módulo. */
  private readonly activeSettingId = 1

  /** Roles que reciben los permisos del módulo (super-administrador y rh-manager). */
  private readonly roleIds = [1, 2]

  /** Permisos del módulo con sus ids fijos (siguientes libres tras el 160). */
  private readonly permissions = [
    { systemPermissionId: 161, systemPermissionName: 'Read', systemPermissionSlug: 'read' },
    { systemPermissionId: 162, systemPermissionName: 'Create', systemPermissionSlug: 'create' },
    { systemPermissionId: 163, systemPermissionName: 'Update', systemPermissionSlug: 'update' },
    { systemPermissionId: 164, systemPermissionName: 'Delete', systemPermissionSlug: 'delete' },
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
        systemModuleName: 'Overrides de jornada',
        systemModuleSlug: 'working-time-overrides',
        systemModuleDescription: 'Jornada propia de la empresa (overrides) sobre el tope federal',
        systemModules: '1',
        systemModulePath: '/working-time-overrides',
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
          <path d="M20.984 12.53a9 9 0 1 0 -7.552 8.355" />
          <path d="M12 7v5l2 2" />
          <path d="M18.42 15.61a2.1 2.1 0 0 1 2.97 2.97l-3.39 3.42h-3v-3l3.42 -3.39z" />
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
