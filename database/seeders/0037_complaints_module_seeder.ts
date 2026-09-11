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
 * Registra en el sistema el módulo de "Buzón de quejas" (NOM-035 §8.1.b).
 *
 * Siembra únicamente configuración de sistema (no datos de negocio):
 *  1. El módulo en `system_modules`, identificado por su slug `complaints`. No
 *     declara id: el id literal que usaba (41) lo reclamaba también
 *     `0038_traumatic_event_registry_module_seeder`, que al correr después
 *     sobrescribía esta fila y borraba el módulo del catálogo en silencio
 *     (ver `app/helpers/system_catalog_seed_resolver.ts`).
 *  2. Los 6 permisos del módulo, identificados por el par (módulo, slug),
 *     también sin id declarado: los 4 de CRUD read/create/update/delete más
 *     reveal-identity y report.
 *  3. El vínculo del módulo con el system_setting activo (id 1) para que
 *     aparezca en el menú.
 *  4. La asignación de los 4 permisos CRUD a los roles super-administrador y
 *     rh-manager, resueltos por slug. `reveal-identity` y `report` solo se
 *     registran: su asignación se configura manualmente en el sistema.
 *
 * El módulo es confidencial: solo super-administrador y rh-manager tienen acceso;
 * el supervisor directo no accede (criterio NOM-035 buzón confidencial).
 * Idempotente: la identidad es el slug; se puede re-ejecutar sin duplicar.
 */
export default class extends BaseSeeder {
  /** Nombre propio, para que los errores del resolver digan quién falló. */
  private readonly seederName = '0037_complaints_module_seeder'

  /** Slug del módulo: su identidad. Nunca se declara un id. */
  private readonly moduleSlug = 'complaints'

  /** Id del system_setting activo al que se vincula el módulo. */
  private readonly activeSettingId = 1

  /** Roles que reciben los permisos CRUD del módulo, por slug estable. */
  private readonly roleSlugs = ['super-administrador', 'rh-manager']

  /** Permisos CRUD del módulo; son los únicos que se asignan a roles en el paso 4. */
  private readonly crudPermissions = [
    { systemPermissionName: 'Read', systemPermissionSlug: 'read' },
    { systemPermissionName: 'Create', systemPermissionSlug: 'create' },
    { systemPermissionName: 'Update', systemPermissionSlug: 'update' },
    { systemPermissionName: 'Delete', systemPermissionSlug: 'delete' },
  ]

  /**
   * Permisos dedicados de revelación de identidad y del reporte agregado STPS:
   * solo se registran, no se asignan a roles (se configura manualmente).
   */
  private readonly unassignedPermissions = [
    { systemPermissionName: 'Reveal identity', systemPermissionSlug: 'reveal-identity' },
    { systemPermissionName: 'Report', systemPermissionSlug: 'report' },
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
        systemModuleName: 'Buzón de quejas',
        systemModuleSlug: this.moduleSlug,
        systemModuleDescription:
          'Canal confidencial de quejas conforme a NOM-035-STPS-2018 numeral 8.1.b',
        systemModules: '1',
        systemModulePath: '/complaints',
        systemModuleActive: 1,
        systemModuleOrder: 50,
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
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <polyline points="22,6 12,13 2,6" />
        </svg>`,
      },
      this.seederName
    )
  }

  /** 2. Alta de los permisos ligados al módulo: los 4 de CRUD más reveal-identity y report. */
  private async seedPermissions(systemModuleId: number): Promise<Map<string, number>> {
    return upsertSystemPermissionsBySlug(
      systemModuleId,
      [...this.crudPermissions, ...this.unassignedPermissions],
      this.seederName
    )
  }

  /** 3. Vínculo del módulo con el system_setting activo (para que salga en el menú). */
  private async linkModuleToActiveSetting(systemModuleId: number) {
    await SystemSettingSystemModule.firstOrCreate(
      { systemSettingId: this.activeSettingId, systemModuleId },
      { systemSettingId: this.activeSettingId, systemModuleId }
    )
  }

  /** 4. Asignación de los permisos CRUD a los roles indicados. */
  private async assignPermissionsToRoles(permissionIdBySlug: Map<string, number>) {
    const roleIdBySlug = await resolveRoleIdsBySlug(this.roleSlugs, this.seederName)

    for (const roleSlug of this.roleSlugs) {
      const roleId = roleIdBySlug.get(roleSlug)!
      for (const permission of this.crudPermissions) {
        const systemPermissionId = permissionIdBySlug.get(permission.systemPermissionSlug)!
        await RoleSystemPermission.firstOrCreate(
          { roleId, systemPermissionId },
          { roleId, systemPermissionId }
        )
      }
    }
  }
}
