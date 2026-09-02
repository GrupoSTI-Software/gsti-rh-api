import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import SystemModule from '../../app/models/system_module.js'
import SystemPermission from '../../app/models/system_permission.js'
import SystemSettingSystemModule from '../../app/models/system_setting_system_module.js'
import RoleSystemPermission from '../../app/models/role_system_permission.js'
import { resolveSystemModuleGroupIds } from '../../app/helpers/system_module_group_seed_resolver.js'

/**
 * Registra el módulo de difusión NOM-035 (5.7.e) para consulta de resultados
 * agregados y anonimizados por centro de trabajo.
 */
export default class extends BaseSeeder {
  private readonly moduleId = 45
  private readonly activeSettingId = 1
  private readonly roleIds = [1, 2]
  private readonly permissions = [
    { systemPermissionId: 183, systemPermissionName: 'Read', systemPermissionSlug: 'read' },
    {
      systemPermissionId: 184,
      systemPermissionName: 'Read all',
      systemPermissionSlug: 'read-all',
    },
  ]

  async run() {
    await this.seedModule()
    await this.seedPermissions()
    await this.linkModuleToActiveSetting()
    await this.assignPermissionsToRoles()
  }

  private async seedModule() {
    const groupIdByKey = await resolveSystemModuleGroupIds(
      ['nom-035'],
      '0046_nom035_disclosure_module_seeder'
    )
    await SystemModule.updateOrCreate(
      { systemModuleId: this.moduleId },
      {
        systemModuleName: 'Resultados por centro de trabajo',
        systemModuleSlug: 'nom035-disclosure',
        systemModuleDescription:
          'Difusión 5.7.e de resultados agregados y anonimizados por centro de trabajo conforme a NOM-035-STPS-2018',
        systemModules: '1',
        systemModulePath: '/disclosure',
        systemModuleActive: 1,
        systemModuleOrder: this.moduleId * 10,
        systemModuleGroupId: groupIdByKey.get('nom-035'),
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18" /><path d="M7 16V9" /><path d="M12 16V6" /><path d="M17 16v-4" /></svg>',
        systemModuleUpdatedAt: DateTime.now(),
      }
    )
  }

  private async seedPermissions() {
    for (const permission of this.permissions) {
      await SystemPermission.updateOrCreate(
        { systemPermissionId: permission.systemPermissionId },
        { ...permission, systemModuleId: this.moduleId }
      )
    }
  }

  private async linkModuleToActiveSetting() {
    await SystemSettingSystemModule.firstOrCreate(
      { systemSettingId: this.activeSettingId, systemModuleId: this.moduleId },
      { systemSettingId: this.activeSettingId, systemModuleId: this.moduleId }
    )
  }

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
