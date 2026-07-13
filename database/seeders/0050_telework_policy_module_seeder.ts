import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import SystemModule from '../../app/models/system_module.js'
import SystemPermission from '../../app/models/system_permission.js'
import SystemSettingSystemModule from '../../app/models/system_setting_system_module.js'
import RoleSystemPermission from '../../app/models/role_system_permission.js'

/**
 * Módulo/sección "Política de Teletrabajo" (NOM-037, numeral 5.2,
 * USRH1783566072187). Operado por RH por empresa (no root-only como
 * `legal-documents`, que es plataforma GSTI): roles 1 (super-administrador) y
 * 2 (rh-manager), igual que `attention-program`/`retention-policy`/`disclosure`.
 */
export default class extends BaseSeeder {
  private readonly moduleId = 47
  private readonly activeSettingId = 1
  private readonly roleIds = [1, 2]
  private readonly permissions = [
    { systemPermissionId: 190, systemPermissionName: 'Read', systemPermissionSlug: 'read' },
    { systemPermissionId: 191, systemPermissionName: 'Create', systemPermissionSlug: 'create' },
    { systemPermissionId: 192, systemPermissionName: 'Update', systemPermissionSlug: 'update' },
    { systemPermissionId: 193, systemPermissionName: 'Delete', systemPermissionSlug: 'delete' },
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
        systemModuleName: 'Política de Teletrabajo',
        systemModuleSlug: 'telework-policy',
        systemModuleDescription:
          'Editor del borrador de la Política de Teletrabajo conforme a NOM-037-STPS-2023 numeral 5.2',
        systemModules: '1',
        systemModulePath: '/telework-policy',
        systemModuleGroup: '7. NOM-037',
        systemModuleActive: 1,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3h11l5 5v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M15 3v5h5" /><path d="M8 13h8" /><path d="M8 17h5" /></svg>',
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
