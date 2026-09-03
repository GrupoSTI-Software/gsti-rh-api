import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import SystemModule from '../../app/models/system_module.js'
import SystemPermission from '../../app/models/system_permission.js'
import SystemSettingSystemModule from '../../app/models/system_setting_system_module.js'
import RoleSystemPermission from '../../app/models/role_system_permission.js'
import { resolveSystemModuleGroupIds } from '../../app/helpers/system_module_group_seed_resolver.js'

/**
 * Registra en el sistema el módulo "Proveedores REPSE" (USRH1784259105646,
 * lado contratante): catálogo de proveedores REPSE del tenant y bitácora de
 * validaciones periódicas de folio.
 *
 * A diferencia del módulo "Repse" (id 38, `repse-registrations`, lado
 * prestador — el tenant registra SU PROPIO folio), este módulo es el lado
 * contratante: el tenant cataloga a SUS proveedores y vigila que el folio de
 * cada uno siga vigente. Es un módulo de negocio nuevo y separado.
 *
 * Siembra únicamente configuración de sistema (no datos de negocio):
 *  1. El módulo en `system_modules` (id 49, siguiente libre tras el 48 de
 *     `0051_reform_simulation_module_seeder.ts`; verificado también contra la
 *     BD real, cuyo máximo era 47 al momento de este desarrollo).
 *  2. Los 4 permisos read/create/update/delete (ids 198-201, siguientes
 *     libres tras el 197 de `0051_reform_simulation_module_seeder.ts`).
 *  3. El vínculo del módulo con el system_setting activo (id 1) para que
 *     aparezca en el menú.
 *  4. La asignación de los 4 permisos a los roles super-administrador (1) y
 *     rh-manager (2) — uso libre, sin gate de configuración de tenant.
 *
 * Idempotente: usa updateOrCreate/firstOrCreate; se puede re-ejecutar sin duplicar.
 */
export default class extends BaseSeeder {
  /** Id del módulo (siguiente libre tras el 48 de reform-simulation). */
  private readonly moduleId = 49

  /** Id del system_setting activo al que se vincula el módulo. */
  private readonly activeSettingId = 1

  /** Roles que reciben los permisos del módulo (super-administrador y rh-manager). */
  private readonly roleIds = [1, 2]

  /** Permisos del módulo con sus ids fijos (siguientes libres tras el 197). */
  private readonly permissions = [
    { systemPermissionId: 198, systemPermissionName: 'Read', systemPermissionSlug: 'read' },
    { systemPermissionId: 199, systemPermissionName: 'Create', systemPermissionSlug: 'create' },
    { systemPermissionId: 200, systemPermissionName: 'Update', systemPermissionSlug: 'update' },
    { systemPermissionId: 201, systemPermissionName: 'Delete', systemPermissionSlug: 'delete' },
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
      ['empresa'],
      '0052_repse_providers_module_seeder'
    )
    await SystemModule.updateOrCreate(
      { systemModuleId: this.moduleId },
      {
        systemModuleName: 'Proveedores REPSE',
        systemModuleSlug: 'repse-providers',
        systemModuleDescription:
          'Catálogo de proveedores REPSE del contratante y bitácora de validaciones periódicas de folio',
        systemModules: '1',
        systemModulePath: '/repse-providers',
        systemModuleActive: 1,
        systemModuleOrder: this.moduleId * 10,
        systemModuleGroupId: groupIdByKey.get('empresa'),
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
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
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
