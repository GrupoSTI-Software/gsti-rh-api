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
 * Registra en el sistema el módulo de "Registro auditable NOM-035" (§5.8.c).
 *
 * Siembra únicamente configuración de sistema (no datos de negocio):
 *  1. El módulo en `system_modules`, identificado por su slug
 *     (`traumatic-event-reports-registry`), para que aparezca en el menú del BO.
 *     No declara id: elegir un número libre a mano es lo que hacía que dos
 *     seeders se pisaran en silencio (ver `app/helpers/system_catalog_seed_resolver.ts`).
 *  2. Un permiso `read` identificado por el par (módulo, slug) — es suficiente
 *     porque la vista es solo lectura; la API ya valida con el slug del módulo
 *     padre (traumatic-event-reports).
 *  3. El vínculo del módulo con el system_setting activo (id 1).
 *  4. La asignación del permiso read a los roles super-administrador y
 *     rh-manager, resueltos por slug, igual que el módulo padre.
 *
 * Idempotente: la identidad es el slug; se puede re-ejecutar sin duplicar.
 */
export default class extends BaseSeeder {
  /** Nombre propio, para que los errores del resolver digan quién falló. */
  private readonly seederName = '0038_traumatic_event_registry_module_seeder'

  /** Slug del módulo: su identidad. Nunca se declara un id. */
  private readonly moduleSlug = 'traumatic-event-reports-registry'

  /** Id del system_setting activo al que se vincula el módulo. */
  private readonly activeSettingId = 1

  /** Roles que reciben el permiso del módulo, por slug estable. */
  private readonly roleSlugs = ['super-administrador', 'rh-manager']

  /** Permisos del módulo. El id lo asigna la BD; la identidad es (módulo, slug). */
  private readonly permissions = [{ systemPermissionName: 'Read', systemPermissionSlug: 'read' }]

  async run() {
    const systemModuleId = await this.seedModule()
    const permissionIdBySlug = await this.seedPermissions(systemModuleId)
    await this.linkModuleToActiveSetting(systemModuleId)
    await this.assignPermissionsToRoles(permissionIdBySlug)
  }

  private async seedModule(): Promise<number> {
    const groupIdByKey = await resolveSystemModuleGroupIds(['nom-035'], this.seederName)
    return upsertSystemModuleBySlug(
      {
        systemModuleName: 'Registro auditable',
        systemModuleSlug: this.moduleSlug,
        systemModuleDescription:
          'Registro consolidado de eventos traumáticos con canalizaciones y exámenes, para inspección STPS (NOM-035-STPS-2018 §5.8.c)',
        systemModules: '1',
        systemModulePath: '/traumatic-event-reports-registry',
        systemModuleActive: 1,
        systemModuleOrder: 40,
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
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>`,
      },
      this.seederName
    )
  }

  private async seedPermissions(systemModuleId: number): Promise<Map<string, number>> {
    return upsertSystemPermissionsBySlug(systemModuleId, this.permissions, this.seederName)
  }

  private async linkModuleToActiveSetting(systemModuleId: number) {
    await SystemSettingSystemModule.firstOrCreate(
      { systemSettingId: this.activeSettingId, systemModuleId },
      { systemSettingId: this.activeSettingId, systemModuleId }
    )
  }

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
