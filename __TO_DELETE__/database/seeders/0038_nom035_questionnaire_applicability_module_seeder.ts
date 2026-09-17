import { BaseSeeder } from '@adonisjs/lucid/seeders'
import SystemSettingSystemModule from '../../app/models/system_setting_system_module.js'
import RoleSystemPermission from '../../app/models/role_system_permission.js'
import SystemPermission from '../../app/models/system_permission.js'
import {
  resolveRoleIdsBySlug,
  resolveSystemModuleIdsBySlug,
} from '../../app/helpers/system_catalog_seed_resolver.js'

/**
 * Vincula el módulo de "Aplicabilidad de cuestionarios NOM-035" con el
 * system_setting activo y asigna su permiso `read` al rol rh-manager.
 *
 * Este seeder NO declara nada del catálogo: solo lo referencia. El módulo
 * (slug `compliance`) lo declara `0017_system_module_seeder` y su permiso
 * `read` lo declara `0018_system_permission_seeder`; aquí ambos se resuelven
 * por slug —el módulo por `systemModuleSlug`, el permiso por el par
 * (módulo, slug)— y el rol por `roleSlug`. Ningún id literal de módulo,
 * permiso o rol sobrevive: elegir números a mano es lo que hacía que dos
 * seeders se pisaran y borraran módulos del catálogo en silencio (ver
 * `app/helpers/system_catalog_seed_resolver.ts`).
 *
 * Si el módulo o el permiso no existen todavía, se falla ruidosamente
 * nombrando lo que falta: son declaración ajena, no de este seeder.
 *
 * Idempotente: usa firstOrCreate; se puede re-ejecutar sin duplicar.
 */
export default class extends BaseSeeder {
  /** Nombre propio, para que los errores del resolver digan quién falló. */
  private readonly seederName = '0038_nom035_questionnaire_applicability_module_seeder'

  /** Slug del módulo referenciado: su identidad. Lo declara 0017. */
  private readonly moduleSlug = 'compliance'

  /** Id del system_setting activo al que se vincula el módulo. */
  private readonly activeSettingId = 1

  /** Roles que reciben los permisos, por slug estable. */
  private readonly roleSlugs = ['rh-manager']

  /** Permisos concedidos, por slug dentro del módulo. Los declara 0018. */
  private readonly permissionSlugs = ['read']

  async run() {
    const systemModuleId = await this.resolveModuleId()
    const permissionIdBySlug = await this.resolvePermissionIds(systemModuleId)
    await this.linkModuleToActiveSetting(systemModuleId)
    await this.assignPermissionsToRoles(permissionIdBySlug)
  }

  /** Resuelve el id del módulo por su slug; lanza si 0017 no ha corrido. */
  private async resolveModuleId(): Promise<number> {
    const moduleIdBySlug = await resolveSystemModuleIdsBySlug([this.moduleSlug], this.seederName)
    return moduleIdBySlug.get(this.moduleSlug)!
  }

  /**
   * Resuelve los permisos por el par (módulo, slug) —nunca por id— y lanza
   * nombrando los que falten: un permiso ausente es un error de siembra del
   * seeder que lo declara, no una concesión que se omite en silencio.
   */
  private async resolvePermissionIds(systemModuleId: number): Promise<Map<string, number>> {
    const permissions = await SystemPermission.query()
      .withTrashed()
      .where('systemModuleId', systemModuleId)
      .whereIn('systemPermissionSlug', this.permissionSlugs)

    const permissionIdBySlug = new Map(
      permissions.map((permission) => [
        permission.systemPermissionSlug,
        permission.systemPermissionId,
      ])
    )

    const missingSlugs = this.permissionSlugs.filter((slug) => !permissionIdBySlug.has(slug))
    if (missingSlugs.length > 0) {
      throw new Error(
        `[${this.seederName}] Permiso(s) no encontrado(s) en el módulo '${this.moduleSlug}': ` +
          `${missingSlugs.sort().join(', ')}. ` +
          'Verifica que 0018_system_permission_seeder haya corrido antes.'
      )
    }

    return permissionIdBySlug
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
      for (const permissionSlug of this.permissionSlugs) {
        const systemPermissionId = permissionIdBySlug.get(permissionSlug)!
        await RoleSystemPermission.firstOrCreate(
          { roleId, systemPermissionId },
          { roleId, systemPermissionId }
        )
      }
    }
  }
}
