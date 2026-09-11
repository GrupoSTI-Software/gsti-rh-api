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
 * Registra en el sistema el módulo de "Reportes de evento traumático" (NOM-035 §6.5).
 *
 * Siembra únicamente configuración de sistema (no datos de negocio):
 *  1. El módulo en `system_modules`, identificado por su slug
 *     (`traumatic-event-reports`). No declara id: elegir un número libre a mano
 *     es lo que borró cinco módulos del catálogo (ver
 *     `app/helpers/system_catalog_seed_resolver.ts`).
 *  2. Los 4 permisos read/create/update/delete, identificados por el par
 *     (módulo, slug), también sin id declarado.
 *  3. El vínculo del módulo con el system_setting activo (id 1) para que aparezca en el menú.
 *  4. La asignación de los 4 permisos a los roles super-administrador y
 *     rh-manager, resueltos por slug.
 *
 * El módulo es confidencial: solo super-administrador y rh-manager tienen acceso;
 * el supervisor directo no accede (criterio NOM-035 buzón confidencial).
 * Idempotente: resuelve por slug y usa firstOrCreate; se puede re-ejecutar sin duplicar.
 */
export default class extends BaseSeeder {
  /** Nombre propio, para que los errores del resolver digan quién falló. */
  private readonly seederName = '0036_traumatic_event_reports_module_seeder'

  /** Slug del módulo: su identidad. Nunca se declara un id. */
  private readonly moduleSlug = 'traumatic-event-reports'

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

  /** 1. Alta del módulo en el catálogo, identificado por su slug. */
  private async seedModule(): Promise<number> {
    const groupIdByKey = await resolveSystemModuleGroupIds(['nom-035'], this.seederName)
    return upsertSystemModuleBySlug(
      {
        systemModuleName: 'Eventos traumáticos',
        systemModuleSlug: this.moduleSlug,
        systemModuleDescription:
          'Registro de acontecimiento traumático severo conforme a NOM-035-STPS-2018 numeral 6.5',
        systemModules: '1',
        systemModulePath: '/traumatic-event-reports',
        systemModuleActive: 1,
        systemModuleOrder: 30,
        systemModuleGroupId: groupIdByKey.get('nom-035') ?? null,
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
