import { BaseSeeder } from '@adonisjs/lucid/seeders'
import SystemSettingSystemModule from '../../app/models/system_setting_system_module.js'
import SystemPermission from '../../app/models/system_permission.js'
import RoleSystemPermission from '../../app/models/role_system_permission.js'
import {
  resolveRoleIdsBySlug,
  resolveSystemModuleIdsBySlug,
} from '../../app/helpers/system_catalog_seed_resolver.js'

/**
 * Vincula el módulo "Teletrabajadores" (NOM-037 5.1) al sistema.
 *
 * Este seeder NO declara catálogo: el alta del módulo (slug `telework-workers`)
 * vive en `0017_system_module_seeder.ts` y la de su permiso read en
 * `0018_system_permission_seeder.ts`. Aquí ambos se REFERENCIAN por slug —el
 * módulo por `systemModuleSlug`, el permiso por el par (módulo, slug)—, nunca
 * por id: escribir ids literales es lo que hacía que cuatro seeders se
 * disputaran el mismo número de módulo y se sobrescribieran en silencio
 * (ver `app/helpers/system_catalog_seed_resolver.ts`).
 *
 * Cubre solo lo que los seeders base no siembran:
 *  1. El vínculo del módulo con el system_setting activo (id 1), requerido
 *     para que aparezca en el menú del Backoffice.
 *  2. La asignación del permiso read a los roles super-administrador y
 *     rh-manager, resueltos por slug.
 *
 * Si el permiso read del módulo no existe, este seeder FALLA nombrándolo en
 * vez de declararlo: su dueño es `0018_system_permission_seeder.ts`, que corre
 * antes; darlo de alta aquí duplicaría la declaración y dejaría dos seeders
 * peleándose el nombre del permiso. Que falte significa que el catálogo base no
 * corrió o quedó incompleto, y eso debe verse, no taparse.
 *
 * No hay permiso de escritura: el listado es una vista derivada de solo lectura.
 * Idempotente: verifica antes de insertar; se puede re-ejecutar sin duplicar.
 *
 * Ref: USRH1782792802491 — Listado de teletrabajadores del 5.1 (vista derivada).
 */
export default class extends BaseSeeder {
  /** Nombre propio, para que los errores del resolver digan quién falló. */
  private readonly seederName = '0048_nom037_telework_workers_module_seeder'

  /** Slug del módulo: su identidad. Nunca se declara ni se referencia un id. */
  private readonly moduleSlug = 'telework-workers'

  /** Slug del permiso que se concede, dentro del módulo anterior. */
  private readonly readPermissionSlug = 'read'

  /** Id del system_setting activo al que se vincula el módulo. */
  private readonly activeSettingId = 1

  /** Roles que reciben el permiso del módulo, por slug estable. */
  private readonly roleSlugs = ['super-administrador', 'rh-manager']

  async run() {
    const moduleIdBySlug = await resolveSystemModuleIdsBySlug([this.moduleSlug], this.seederName)
    const systemModuleId = moduleIdBySlug.get(this.moduleSlug)!

    await this.linkModuleToActiveSetting(systemModuleId)
    await this.assignPermissionToRoles(systemModuleId)
  }

  private async linkModuleToActiveSetting(systemModuleId: number) {
    // withTrashed: un vínculo con baja lógica bloquearía el INSERT del
    // firstOrCreate; si existe retirado, se deja tal cual (decisión manual).
    const existing = await SystemSettingSystemModule.query()
      .withTrashed()
      .where('systemSettingId', this.activeSettingId)
      .where('systemModuleId', systemModuleId)
      .first()

    if (existing) return

    await SystemSettingSystemModule.create({
      systemSettingId: this.activeSettingId,
      systemModuleId,
    })
  }

  private async assignPermissionToRoles(systemModuleId: number) {
    const systemPermissionId = await this.resolveReadPermissionId(systemModuleId)
    const roleIdBySlug = await resolveRoleIdsBySlug(this.roleSlugs, this.seederName)

    for (const roleSlug of this.roleSlugs) {
      const roleId = roleIdBySlug.get(roleSlug)!

      const existing = await RoleSystemPermission.query()
        .withTrashed()
        .where('roleId', roleId)
        .where('systemPermissionId', systemPermissionId)
        .first()

      if (existing) continue

      await RoleSystemPermission.create({
        roleId,
        systemPermissionId,
      })
    }
  }

  /**
   * Resuelve el permiso por el par (módulo, slug). withTrashed: un permiso dado
   * de baja sigue ocupando su fila y es el mismo permiso; lo que no se puede es
   * inventar uno nuevo aquí.
   */
  private async resolveReadPermissionId(systemModuleId: number): Promise<number> {
    const permission = await SystemPermission.query()
      .withTrashed()
      .where('systemModuleId', systemModuleId)
      .where('systemPermissionSlug', this.readPermissionSlug)
      .first()

    if (!permission) {
      throw new Error(
        `[${this.seederName}] Permiso '${this.readPermissionSlug}' no encontrado para el módulo ` +
          `'${this.moduleSlug}'. Verifica que 0018_system_permission_seeder haya corrido antes.`
      )
    }

    return permission.systemPermissionId
  }
}
