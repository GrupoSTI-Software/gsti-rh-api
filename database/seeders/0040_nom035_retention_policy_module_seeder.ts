import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import SystemModule from '../../app/models/system_module.js'
import SystemPermission from '../../app/models/system_permission.js'
import SystemSettingSystemModule from '../../app/models/system_setting_system_module.js'
import RoleSystemPermission from '../../app/models/role_system_permission.js'
import { resolveSystemModuleGroupIds } from '../../app/helpers/system_module_group_seed_resolver.js'

/**
 * Registra en el sistema el módulo de "Política de retención NOM-035" (ESB-08-06-03-03).
 *
 * Siembra únicamente configuración de sistema (no datos de negocio):
 *  1. El módulo en `system_modules` (id 43) para que aparezca en el menú del Backoffice.
 *  2. Los permisos read (id 175) y write (id 176) ligados al módulo.
 *  3. El vínculo del módulo con el system_setting activo (id 1).
 *  4. La asignación de ambos permisos a los roles super-administrador (1) y rh-manager (2).
 *
 * El API de retención (GET/PUT /api/nom035/retention-policy) guarda su guard de permisos
 * en el módulo `compliance` (id 42); este módulo 43 es exclusivo para visibilidad de menú.
 * Idempotente: usa updateOrCreate/firstOrCreate; se puede re-ejecutar sin duplicar.
 */
export default class extends BaseSeeder {
  private readonly moduleId = 43
  private readonly activeSettingId = 1
  private readonly roleIds = [1, 2]

  private readonly permissions = [
    { systemPermissionId: 175, systemPermissionName: 'Read', systemPermissionSlug: 'read' },
    { systemPermissionId: 176, systemPermissionName: 'Update', systemPermissionSlug: 'write' },
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
      '0040_nom035_retention_policy_module_seeder'
    )
    await SystemModule.updateOrCreate(
      { systemModuleId: this.moduleId },
      {
        systemModuleName: 'Política de retención',
        systemModuleSlug: 'retention-policy',
        systemModuleDescription:
          'Configura el período de conservación de evidencia NOM-035-STPS-2018 por empresa (piso legal 1 año, default 4 años)',
        systemModules: '1',
        systemModulePath: '/retention-policy',
        systemModuleActive: 1,
        systemModuleOrder: this.moduleId * 10,
        systemModuleGroupId: groupIdByKey.get('nom-035'),
        systemModuleIcon: `<svg
          xmlns='http://www.w3.org/2000/svg'
          width='48'
          height='48'
          viewBox='0 0 24 24'
          fill='none'
          stroke='currentColor'
          stroke-width='2'
          stroke-linecap='round'
          stroke-linejoin='round'
        >
          <path d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'/>
        </svg>`,
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
