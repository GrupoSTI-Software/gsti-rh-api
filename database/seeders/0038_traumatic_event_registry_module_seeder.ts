import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import SystemModule from '../../app/models/system_module.js'
import SystemPermission from '../../app/models/system_permission.js'
import SystemSettingSystemModule from '../../app/models/system_setting_system_module.js'
import RoleSystemPermission from '../../app/models/role_system_permission.js'

/**
 * Registra en el sistema el módulo de "Registro auditable NOM-035" (§5.8.c).
 *
 * Siembra únicamente configuración de sistema (no datos de negocio):
 *  1. El módulo en `system_modules` (id 41) para que aparezca en el menú del BO.
 *  2. Un permiso `read` (id 169) ligado al módulo — es suficiente porque la vista
 *     es solo lectura; la API ya valida con el slug del módulo padre
 *     (traumatic-event-reports).
 *  3. El vínculo del módulo con el system_setting activo (id 1).
 *  4. La asignación del permiso read a los roles super-administrador (1) y
 *     rh-manager (2), igual que el módulo padre.
 *
 * Idempotente: usa updateOrCreate/firstOrCreate; se puede re-ejecutar sin duplicar.
 */
export default class extends BaseSeeder {
  private readonly moduleId = 41
  private readonly activeSettingId = 1
  private readonly roleIds = [1, 2]
  private readonly readPermission = {
    systemPermissionId: 169,
    systemPermissionName: 'Read',
    systemPermissionSlug: 'read',
  }

  async run() {
    await this.seedModule()
    await this.seedPermission()
    await this.linkModuleToActiveSetting()
    await this.assignPermissionToRoles()
  }

  private async seedModule() {
    await SystemModule.updateOrCreate(
      { systemModuleId: this.moduleId },
      {
        systemModuleName: 'Registro auditable',
        systemModuleSlug: 'traumatic-event-reports-registry',
        systemModuleDescription:
          'Registro consolidado de eventos traumáticos con canalizaciones y exámenes, para inspección STPS (NOM-035-STPS-2018 §5.8.c)',
        systemModules: '1',
        systemModulePath: '/traumatic-event-reports-registry',
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
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>`,
        systemModuleUpdatedAt: DateTime.now(),
      }
    )
  }

  private async seedPermission() {
    await SystemPermission.updateOrCreate(
      { systemPermissionId: this.readPermission.systemPermissionId },
      { ...this.readPermission, systemModuleId: this.moduleId }
    )
  }

  private async linkModuleToActiveSetting() {
    await SystemSettingSystemModule.firstOrCreate(
      { systemSettingId: this.activeSettingId, systemModuleId: this.moduleId },
      { systemSettingId: this.activeSettingId, systemModuleId: this.moduleId }
    )
  }

  private async assignPermissionToRoles() {
    for (const roleId of this.roleIds) {
      await RoleSystemPermission.firstOrCreate(
        { roleId, systemPermissionId: this.readPermission.systemPermissionId },
        { roleId, systemPermissionId: this.readPermission.systemPermissionId }
      )
    }
  }
}
