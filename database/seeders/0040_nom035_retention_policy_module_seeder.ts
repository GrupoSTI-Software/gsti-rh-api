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
 * Registra en el sistema el módulo de "Política de retención NOM-035" (ESB-08-06-03-03).
 *
 * Siembra únicamente configuración de sistema (no datos de negocio), en 4 pasos:
 *  1. El módulo en `system_modules`, identificado por su slug `retention-policy`,
 *     para que aparezca en el menú del Backoffice. No declara id: elegir un número
 *     libre a mano es lo que borró cinco módulos del catálogo
 *     (ver `app/helpers/system_catalog_seed_resolver.ts`).
 *  2. Los permisos read y write, identificados por el par (módulo, slug), también
 *     sin id declarado.
 *  3. El vínculo del módulo con el system_setting activo (id 1).
 *  4. La asignación de ambos permisos a los roles super-administrador y rh-manager,
 *     resueltos por slug.
 *
 * El API de retención (GET/PUT /api/nom035/retention-policy) guarda su guard de permisos
 * en el módulo `compliance`; este módulo `retention-policy` es exclusivo para visibilidad
 * de menú.
 * Idempotente: la identidad es el slug y los pivotes usan firstOrCreate; se puede
 * re-ejecutar sin duplicar.
 */
export default class extends BaseSeeder {
  /** Nombre propio, para que los errores del resolver digan quién falló. */
  private readonly seederName = '0040_nom035_retention_policy_module_seeder'

  /** Slug del módulo: su identidad. Nunca se declara un id. */
  private readonly moduleSlug = 'retention-policy'

  /** Id del system_setting activo al que se vincula el módulo. */
  private readonly activeSettingId = 1

  /** Roles que reciben los permisos del módulo, por slug estable. */
  private readonly roleSlugs = ['super-administrador', 'rh-manager']

  /** Permisos del módulo. El id lo asigna la BD; la identidad es (módulo, slug). */
  private readonly permissions = [
    { systemPermissionName: 'Read', systemPermissionSlug: 'read' },
    { systemPermissionName: 'Update', systemPermissionSlug: 'write' },
  ]

  async run() {
    const systemModuleId = await this.seedModule()
    const permissionIdBySlug = await this.seedPermissions(systemModuleId)
    await this.linkModuleToActiveSetting(systemModuleId)
    await this.assignPermissionsToRoles(permissionIdBySlug)
  }

  /** 1. Alta del módulo en el catálogo, identificado por slug. */
  private async seedModule(): Promise<number> {
    const groupIdByKey = await resolveSystemModuleGroupIds(['nom-035'], this.seederName)
    return upsertSystemModuleBySlug(
      {
        systemModuleName: 'Política de retención',
        systemModuleSlug: this.moduleSlug,
        systemModuleDescription:
          'Configura el período de conservación de evidencia NOM-035-STPS-2018 por empresa (piso legal 1 año, default 4 años)',
        systemModules: '1',
        systemModulePath: '/retention-policy',
        systemModuleActive: 1,
        systemModuleOrder: 70,
        systemModuleGroupId: groupIdByKey.get('nom-035') ?? null,
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
      },
      this.seederName
    )
  }

  /** 2. Alta de los permisos read/write ligados al módulo. */
  private async seedPermissions(systemModuleId: number): Promise<Map<string, number>> {
    return upsertSystemPermissionsBySlug(systemModuleId, this.permissions, this.seederName)
  }

  /** 3. Vínculo del módulo con el system_setting activo. */
  private async linkModuleToActiveSetting(systemModuleId: number) {
    await SystemSettingSystemModule.firstOrCreate(
      { systemSettingId: this.activeSettingId, systemModuleId },
      { systemSettingId: this.activeSettingId, systemModuleId }
    )
  }

  /** 4. Asignación de ambos permisos a los roles indicados, resueltos por slug. */
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
