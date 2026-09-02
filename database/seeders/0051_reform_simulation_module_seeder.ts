import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import SystemModule from '../../app/models/system_module.js'
import SystemPermission from '../../app/models/system_permission.js'
import SystemSettingSystemModule from '../../app/models/system_setting_system_module.js'
import RoleSystemPermission from '../../app/models/role_system_permission.js'

/**
 * Registra en el sistema el módulo "Simulador reforma 40h" (pantalla BO
 * USRH1784143726951).
 *
 * Siembra únicamente configuración de sistema (no datos de negocio):
 *  1. El módulo en `system_modules` (id 48) para que exista en el catálogo.
 *  2. Los 4 permisos read/create/update/delete (ids 194-197) ligados al módulo.
 *  3. El vínculo del módulo con el system_setting activo (id 1) para el menú.
 *  4. La asignación de los 4 permisos a los roles super-administrador (1) y
 *     rh-manager (2).
 *
 * El cálculo de impacto vive en el endpoint de USRH1784143725946; este seeder
 * solo habilita la entrada de menú y el RBAC de la pantalla.
 * Idempotente: usa updateOrCreate/firstOrCreate, se puede re-ejecutar sin duplicar.
 */
export default class extends BaseSeeder {
  /** Id del módulo (siguiente libre tras el 47). */
  private readonly moduleId = 48

  /** Id del system_setting activo al que se vincula el módulo. */
  private readonly activeSettingId = 1

  /** Roles que reciben los permisos del módulo (super-administrador y rh-manager). */
  private readonly roleIds = [1, 2]

  /** Permisos del módulo con sus ids fijos (siguientes libres tras el 193). */
  private readonly permissions = [
    { systemPermissionId: 194, systemPermissionName: 'Read', systemPermissionSlug: 'read' },
    { systemPermissionId: 195, systemPermissionName: 'Create', systemPermissionSlug: 'create' },
    { systemPermissionId: 196, systemPermissionName: 'Update', systemPermissionSlug: 'update' },
    { systemPermissionId: 197, systemPermissionName: 'Delete', systemPermissionSlug: 'delete' },
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
        systemModuleName: 'Simulador reforma 40h',
        systemModuleSlug: 'reform-simulation',
        systemModuleDescription:
          'Proyección del impacto de la reforma de jornada de 40 horas sobre el personal activo',
        systemModules: '1',
        systemModulePath: '/reform-simulation',
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
          <path d="M4 20h16" />
          <path d="M7 16v-6" />
          <path d="M12 16v-10" />
          <path d="M17 16v-3" />
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
