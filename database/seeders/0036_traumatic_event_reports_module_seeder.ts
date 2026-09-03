import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import SystemModule from '../../app/models/system_module.js'
import SystemPermission from '../../app/models/system_permission.js'
import SystemSettingSystemModule from '../../app/models/system_setting_system_module.js'
import RoleSystemPermission from '../../app/models/role_system_permission.js'
import { resolveSystemModuleGroupIds } from '../../app/helpers/system_module_group_seed_resolver.js'

/**
 * Registra en el sistema el módulo de "Reportes de evento traumático" (NOM-035 §6.5).
 *
 * Siembra únicamente configuración de sistema (no datos de negocio):
 *  1. El módulo en `system_modules` (id 40) para que exista en el catálogo.
 *  2. Los 4 permisos read/create/update/delete (ids 165-168) ligados al módulo.
 *  3. El vínculo del módulo con el system_setting activo (id 1) para que aparezca en el menú.
 *  4. La asignación de los 4 permisos a los roles super-administrador (1) y rh-manager (2).
 *
 * El módulo es confidencial: solo super-administrador y rh-manager tienen acceso;
 * el supervisor directo no accede (criterio NOM-035 buzón confidencial).
 * Idempotente: usa updateOrCreate/firstOrCreate; se puede re-ejecutar sin duplicar.
 */
export default class extends BaseSeeder {
  /** Id del módulo (siguiente libre tras el 39 de working-time-overrides). */
  private readonly moduleId = 40

  /** Id del system_setting activo al que se vincula el módulo. */
  private readonly activeSettingId = 1

  /** Roles que reciben los permisos del módulo (super-administrador y rh-manager). */
  private readonly roleIds = [1, 2]

  /** Permisos del módulo con sus ids fijos (siguientes libres tras el 164). */
  private readonly permissions = [
    { systemPermissionId: 165, systemPermissionName: 'Read', systemPermissionSlug: 'read' },
    { systemPermissionId: 166, systemPermissionName: 'Create', systemPermissionSlug: 'create' },
    { systemPermissionId: 167, systemPermissionName: 'Update', systemPermissionSlug: 'update' },
    { systemPermissionId: 168, systemPermissionName: 'Delete', systemPermissionSlug: 'delete' },
  ]

  async run() {
    await this.seedModule()
    await this.seedPermissions()
    await this.linkModuleToActiveSetting()
    await this.assignPermissionsToRoles()
  }

  /** 1. Alta del módulo en el catálogo. */
  private async seedModule() {
    const groupIdByKey = await resolveSystemModuleGroupIds(
      ['nom-035'],
      '0036_traumatic_event_reports_module_seeder'
    )
    await SystemModule.updateOrCreate(
      { systemModuleId: this.moduleId },
      {
        systemModuleName: 'Eventos traumáticos',
        systemModuleSlug: 'traumatic-event-reports',
        systemModuleDescription:
          'Registro de acontecimiento traumático severo conforme a NOM-035-STPS-2018 numeral 6.5',
        systemModules: '1',
        systemModulePath: '/traumatic-event-reports',
        systemModuleActive: 1,
        systemModuleOrder: this.moduleId * 10,
        systemModuleGroupId: groupIdByKey.get('nom-035'),
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
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
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
