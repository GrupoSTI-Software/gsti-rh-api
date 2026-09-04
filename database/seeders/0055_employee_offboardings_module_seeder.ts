import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import SystemModule from '../../app/models/system_module.js'
import SystemPermission from '../../app/models/system_permission.js'
import SystemSettingSystemModule from '../../app/models/system_setting_system_module.js'
import RoleSystemPermission from '../../app/models/role_system_permission.js'
import { resolveSystemModuleGroupIds } from '../../app/helpers/system_module_group_seed_resolver.js'

/**
 * Registra el módulo "Salidas de personal" (USRH1786568279581): la sección
 * del backoffice (`valanserh-bo/pages/employee-offboardings/`) que estrena la
 * configuración del catálogo de conceptos de salida; el listado de salidas
 * llega con USRH1786568279596 a la misma pantalla.
 *
 * Slug en PLURAL (`employee-offboardings`): `employee-offboarding` a secas ya
 * está tomado por un `system_feature` (`0032_system_feature_seeder.ts:44-50`).
 *
 * Siembra únicamente configuración de sistema, en 4 pasos (espejo de
 * `0053_regulatory_coverage_module_seeder.ts`):
 *  1. El módulo en `system_modules` (id 51, siguiente libre: el máximo en
 *     seeders era 50 en `0053_...:58` y el máximo en la BD real de este
 *     desarrollo era 50 — se usa el mayor de ambos + 1, regla documentada en
 *     `0053_...:22-28`; verificado contra la BD el 2026-08-13).
 *  2. Los 4 permisos read/create/update/delete (ids 206-209, siguientes
 *     libres tras el 205 de `0053_...:71`, también verificado contra la BD).
 *  3. El vínculo del módulo con el system_setting activo (id 1). VESTIGIAL:
 *     nada lo lee en runtime — la disponibilidad real la gobierna
 *     `system_module_active` del paso 1. Se siembra por espejo del pivote
 *     mientras siga existiendo.
 *  4. La asignación de los 4 permisos a los roles super-administrador (1) y
 *     rh-manager (2). `root` y `owner` NO se siembran: hacen bypass del
 *     catálogo en ambas capas (`app/services/role_service.ts:131-132`).
 *
 * Idempotente: usa updateOrCreate/firstOrCreate; se puede re-ejecutar sin duplicar.
 */
export default class extends BaseSeeder {
  /** Id del módulo (siguiente libre tras el 50 de cobertura regulatoria). */
  private readonly moduleId = 51

  /** Id del system_setting activo al que se vincula el módulo (paso vestigial). */
  private readonly activeSettingId = 1

  /** Roles que reciben los permisos del módulo (super-administrador y rh-manager). */
  private readonly roleIds = [1, 2]

  /** Permisos del módulo con sus ids fijos (siguientes libres tras el 205). */
  private readonly permissions = [
    { systemPermissionId: 206, systemPermissionName: 'Read', systemPermissionSlug: 'read' },
    { systemPermissionId: 207, systemPermissionName: 'Create', systemPermissionSlug: 'create' },
    { systemPermissionId: 208, systemPermissionName: 'Update', systemPermissionSlug: 'update' },
    { systemPermissionId: 209, systemPermissionName: 'Delete', systemPermissionSlug: 'delete' },
  ]

  async run() {
    await this.seedModule()
    await this.seedPermissions()
    await this.linkModuleToActiveSetting()
    await this.assignPermissionsToRoles()
  }

  /** 1. Alta del módulo en el catálogo. `systemModuleActive: 1` es el flag que realmente gatea menú y acceso. */
  private async seedModule() {
    const groupIdByKey = await resolveSystemModuleGroupIds(
      ['empresa'],
      '0055_employee_offboardings_module_seeder'
    )
    await SystemModule.updateOrCreate(
      { systemModuleId: this.moduleId },
      {
        systemModuleName: 'Salidas de personal',
        systemModuleSlug: 'employee-offboardings',
        systemModuleDescription:
          'Configuración del catálogo de conceptos de salida por empresa: la lista contra la cual se revisa cada salida de personal (entrega de activos, finiquito, adeudos, documentos y accesos)',
        systemModules: '1',
        systemModulePath: '/employee-offboardings',
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
          <path d="M13 12v.01" />
          <path d="M3 21h18" />
          <path d="M5 21v-16a2 2 0 0 1 2 -2h7.5m2.5 10.5v7.5" />
          <path d="M14 7h7m-3 -3l3 3l-3 3" />
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

  /**
   * 3. Vínculo del módulo con el system_setting activo. VESTIGIAL: nada lo
   * lee en runtime (la disponibilidad real la gobierna `systemModuleActive`
   * del paso 1). Se mantiene por consistencia con el pivote mientras exista.
   */
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
