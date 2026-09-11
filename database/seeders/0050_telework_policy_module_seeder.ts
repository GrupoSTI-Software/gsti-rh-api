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
 * Módulo/sección "Política de Teletrabajo" (NOM-037, numeral 5.2,
 * USRH1783566072187). Operado por RH por empresa (no root-only como
 * `legal-documents`, que es plataforma GSTI): roles `super-administrador` y
 * `rh-manager`, igual que `attention-program`/`retention-policy`/`disclosure`.
 *
 * Toda la identidad del catálogo es el slug: el módulo se resuelve por
 * `telework-policy`, sus permisos por el par (módulo, slug) y los roles
 * destinatarios por su `role_slug`. Ningún id literal se declara — elegir a
 * mano un número "libre" es lo que hizo que seeders distintos se pisaran la
 * fila y borraran módulos del catálogo (ver
 * `app/helpers/system_catalog_seed_resolver.ts`).
 *
 * Idempotente: usa updateOrCreate/firstOrCreate; se puede re-ejecutar sin duplicar.
 */
export default class extends BaseSeeder {
  /** Nombre propio, para que los errores del resolver digan quién falló. */
  private readonly seederName = '0050_telework_policy_module_seeder'

  /** Slug del módulo: su identidad. Nunca se declara un id. */
  private readonly moduleSlug = 'telework-policy'

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

  private async seedModule(): Promise<number> {
    const groupIdByKey = await resolveSystemModuleGroupIds(['nom-037'], this.seederName)
    return upsertSystemModuleBySlug(
      {
        systemModuleName: 'Política de Teletrabajo',
        systemModuleSlug: this.moduleSlug,
        systemModuleDescription:
          'Editor del borrador de la Política de Teletrabajo conforme a NOM-037-STPS-2023 numeral 5.2',
        systemModules: '1',
        systemModulePath: '/telework-policy',
        systemModuleActive: 1,
        systemModuleOrder: 20,
        systemModuleGroupId: groupIdByKey.get('nom-037') ?? null,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3h11l5 5v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M15 3v5h5" /><path d="M8 13h8" /><path d="M8 17h5" /></svg>',
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
