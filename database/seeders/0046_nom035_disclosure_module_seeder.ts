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
 * Registra el módulo de difusión NOM-035 (5.7.e) para consulta de resultados
 * agregados y anonimizados por centro de trabajo.
 *
 * Siembra únicamente configuración de sistema, en 4 pasos:
 *  1. El módulo en `system_modules`, identificado por su slug
 *     (`nom035-disclosure`). No declara id: elegir un número libre a mano es lo
 *     que borró cinco módulos del catálogo (ver
 *     `app/helpers/system_catalog_seed_resolver.ts`).
 *  2. Los permisos read/read-all, identificados por el par (módulo, slug),
 *     también sin id declarado.
 *  3. El vínculo del módulo con el system_setting activo (id 1). VESTIGIAL:
 *     nada lo lee en runtime — la disponibilidad real la gobierna
 *     `system_module_active` del paso 1. Se siembra por espejo del pivote
 *     mientras siga existiendo.
 *  4. La asignación de los permisos a los roles super-administrador y
 *     rh-manager, resueltos por slug (nunca por id: el id 1 es `kiosco`).
 *
 * Idempotente: la identidad de cada fila es su slug, así que se puede
 * re-ejecutar sin duplicar ni pisar filas de otro seeder.
 */
export default class extends BaseSeeder {
  /** Nombre propio, para que los errores del resolver digan quién falló. */
  private readonly seederName = '0046_nom035_disclosure_module_seeder'

  /** Slug del módulo: su identidad. Nunca se declara un id. */
  private readonly moduleSlug = 'nom035-disclosure'

  /** Id del system_setting activo al que se vincula el módulo (paso vestigial). */
  private readonly activeSettingId = 1

  /** Roles que reciben los permisos del módulo, por slug estable. */
  private readonly roleSlugs = ['super-administrador', 'rh-manager']

  /** Permisos del módulo. El id lo asigna la BD; la identidad es (módulo, slug). */
  private readonly permissions = [
    { systemPermissionName: 'Read', systemPermissionSlug: 'read' },
    { systemPermissionName: 'Read all', systemPermissionSlug: 'read-all' },
  ]

  async run() {
    const systemModuleId = await this.seedModule()
    const permissionIdBySlug = await this.seedPermissions(systemModuleId)
    await this.linkModuleToActiveSetting(systemModuleId)
    await this.assignPermissionsToRoles(permissionIdBySlug)
  }

  /** 1. Alta del módulo en el catálogo. `systemModuleActive: 1` es el flag que realmente gatea menú y acceso. */
  private async seedModule(): Promise<number> {
    const groupIdByKey = await resolveSystemModuleGroupIds(['nom-035'], this.seederName)
    return upsertSystemModuleBySlug(
      {
        systemModuleName: 'Resultados por centro de trabajo',
        systemModuleSlug: this.moduleSlug,
        systemModuleDescription:
          'Difusión 5.7.e de resultados agregados y anonimizados por centro de trabajo conforme a NOM-035-STPS-2018',
        systemModules: '1',
        systemModulePath: '/disclosure',
        systemModuleActive: 1,
        systemModuleOrder: 60,
        systemModuleGroupId: groupIdByKey.get('nom-035') ?? null,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18" /><path d="M7 16V9" /><path d="M12 16V6" /><path d="M17 16v-4" /></svg>',
      },
      this.seederName
    )
  }

  /** 2. Alta de los permisos ligados al módulo. */
  private async seedPermissions(systemModuleId: number): Promise<Map<string, number>> {
    return upsertSystemPermissionsBySlug(systemModuleId, this.permissions, this.seederName)
  }

  /**
   * 3. Vínculo del módulo con el system_setting activo. VESTIGIAL: nada lo
   * lee en runtime (la disponibilidad real la gobierna `systemModuleActive`
   * del paso 1). Se mantiene por consistencia con el pivote mientras exista.
   */
  private async linkModuleToActiveSetting(systemModuleId: number) {
    await SystemSettingSystemModule.firstOrCreate(
      { systemSettingId: this.activeSettingId, systemModuleId },
      { systemSettingId: this.activeSettingId, systemModuleId }
    )
  }

  /** 4. Asignación de los permisos a los roles indicados. */
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
