import { BaseSeeder } from '@adonisjs/lucid/seeders'
import SystemSettingSystemModule from '../../app/models/system_setting_system_module.js'
import RoleSystemPermission from '../../app/models/role_system_permission.js'
import { resolveSystemModuleGroupIds } from '../../app/helpers/system_module_group_seed_resolver.js'
import {
  resolveRoleIdsBySlug,
  upsertSystemModuleBySlug,
  upsertSystemPermissionsBySlug,
} from '../../app/helpers/system_catalog_seed_resolver.js'

/**
 * Registra en el sistema el módulo "Simulador reforma 40h" (pantalla BO
 * USRH1784143726951).
 *
 * Siembra únicamente configuración de sistema (no datos de negocio):
 *  1. El módulo en `system_modules`, identificado por su slug
 *     (`reform-simulation`). No declara id: elegir un número libre a mano es lo
 *     que borró cinco módulos del catálogo (ver
 *     `app/helpers/system_catalog_seed_resolver.ts`).
 *  2. Los 4 permisos read/create/update/delete, identificados por el par
 *     (módulo, slug), también sin id declarado.
 *  3. El vínculo del módulo con el system_setting activo (id 1) para el menú.
 *  4. La asignación de los 4 permisos a los roles super-administrador y
 *     rh-manager, resueltos por slug.
 *
 * El cálculo de impacto vive en el endpoint de USRH1784143725946; este seeder
 * solo habilita la entrada de menú y el RBAC de la pantalla.
 * Idempotente: usa updateOrCreate/firstOrCreate, se puede re-ejecutar sin duplicar.
 */
export default class extends BaseSeeder {
  /** Nombre propio, para que los errores del resolver digan quién falló. */
  private readonly seederName = '0051_reform_simulation_module_seeder'

  /** Slug del módulo: su identidad. Nunca se declara un id. */
  private readonly moduleSlug = 'reform-simulation'

  /** Id del system_setting activo al que se vincula el módulo. */
  private readonly activeSettingId = 1

  /** Roles que reciben los permisos del módulo, por slug estable. */
  private readonly roleSlugs = ['super-administrador', 'rh-manager']

  /** Permisos del módulo. El id lo asigna la BD; la identidad es (módulo, slug). */
  private readonly permissions = [
    { systemPermissionName: 'Read', systemPermissionSlug: 'read' },
    { systemPermissionName: 'Create', systemPermissionSlug: 'create' },
    { systemPermissionName: 'Update', systemPermissionSlug: 'update' },
    { systemPermissionName: 'Delete', systemPermissionSlug: 'delete' },
  ]

  async run() {
    const systemModuleId = await this.seedModule()
    const permissionIdBySlug = await this.seedPermissions(systemModuleId)
    await this.linkModuleToActiveSetting(systemModuleId)
    await this.assignPermissionsToRoles(permissionIdBySlug)
  }

  /** 1. Alta del módulo en el catálogo. */
  private async seedModule(): Promise<number> {
    const groupIdByKey = await resolveSystemModuleGroupIds(['empresa'], this.seederName)
    return upsertSystemModuleBySlug(
      {
        systemModuleName: 'Simulador reforma 40h',
        systemModuleSlug: this.moduleSlug,
        systemModuleDescription:
          'Proyección del impacto de la reforma de jornada de 40 horas sobre el personal activo',
        systemModules: '1',
        systemModulePath: '/reform-simulation',
        systemModuleActive: 1,
        systemModuleOrder: 150,
        systemModuleGroupId: groupIdByKey.get('empresa') ?? null,
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
      },
      this.seederName
    )
  }

  /** 2. Alta de los 4 permisos ligados al módulo. */
  private async seedPermissions(systemModuleId: number): Promise<Map<string, number>> {
    return upsertSystemPermissionsBySlug(systemModuleId, this.permissions, this.seederName)
  }

  /** 3. Vínculo del módulo con el system_setting activo (para que salga en el menú). */
  private async linkModuleToActiveSetting(systemModuleId: number) {
    await SystemSettingSystemModule.firstOrCreate(
      { systemSettingId: this.activeSettingId, systemModuleId },
      { systemSettingId: this.activeSettingId, systemModuleId }
    )
  }

  /** 4. Asignación de los 4 permisos a los roles indicados. */
  private async assignPermissionsToRoles(permissionIdBySlug: Map<string, number>) {
    const roleIdBySlug = await resolveRoleIdsBySlug(this.roleSlugs, this.seederName)

    for (const roleSlug of this.roleSlugs) {
      const roleId = roleIdBySlug.get(roleSlug)!
      for (const permission of this.permissions) {
        const systemPermissionId = permissionIdBySlug.get(permission.systemPermissionSlug)!
        await RoleSystemPermission.firstOrCreate(
          { roleId, systemPermissionId },
          { roleId, systemPermissionId }
        )
      }
    }
  }
}
