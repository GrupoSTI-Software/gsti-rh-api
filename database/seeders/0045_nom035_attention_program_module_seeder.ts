import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import SystemModule from '../../app/models/system_module.js'
import SystemPermission from '../../app/models/system_permission.js'
import SystemSettingSystemModule from '../../app/models/system_setting_system_module.js'
import RoleSystemPermission from '../../app/models/role_system_permission.js'

export default class extends BaseSeeder {
  private readonly moduleId = 44
  private readonly activeSettingId = 1
  private readonly roleIds = [1, 2]
  private readonly permissions = [
    { systemPermissionId: 179, systemPermissionName: 'Read', systemPermissionSlug: 'read' },
    { systemPermissionId: 180, systemPermissionName: 'Create', systemPermissionSlug: 'create' },
    { systemPermissionId: 181, systemPermissionName: 'Update', systemPermissionSlug: 'update' },
    { systemPermissionId: 182, systemPermissionName: 'Delete', systemPermissionSlug: 'delete' },
  ]

  async run() {
    await this.seedModule()
    await this.seedPermissions()
    await this.linkModuleToActiveSetting()
    await this.assignPermissionsToRoles()
  }

  private async seedModule() {
    await SystemModule.updateOrCreate(
      { systemModuleId: this.moduleId },
      {
        systemModuleName: 'Programa de atención',
        systemModuleSlug: 'attention-program',
        systemModuleDescription:
          'Programa de atención de factores de riesgo conforme a NOM-035-STPS-2018 numerales 8.2–8.5',
        systemModules: '1',
        systemModulePath: '/attention-program',
        systemModuleActive: 1,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>',
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
