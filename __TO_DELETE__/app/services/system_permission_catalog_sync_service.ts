import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import {
  SYSTEM_PERMISSION_CATALOG,
  validateCatalogIntegrity,
  type SystemPermissionCatalog,
} from '#constants/system_permission_catalog'
import type { ActionCatalogEntry } from '#constants/permission_catalog_types'

export interface SystemPermissionCatalogSyncResult {
  /** Slugs de acción para los que se creó una fila nueva en `system_permissions`. */
  createdPermissionSlugs: string[]
  /** Acciones que no se pudieron sincronizar (ej. el módulo dueño no existe en BD). */
  skippedActions: Array<{ slug: string; reason: string }>
}

/**
 * Deriva hacia `system_permissions` lo declarado en el índice maestro
 * (USRH1785766406720) para cada módulo presente en `actionsByModule` — hoy
 * solo Empleados tiene `actionsEnumerated: true` — en vez de mantenerlo a
 * mano en un seeder nuevo cada vez.
 *
 * Reglas de negocio que este servicio respeta siempre:
 *  - Regla 4: nada de lo ya registrado se renombra, se da de baja ni se
 *    borra. Si una acción ya existe (por slug, incluyendo soft-deleted), no
 *    se toca.
 *  - Regla 5: idempotente — correrlo N veces deja el mismo resultado, sin
 *    duplicar ni revivir una baja intencional.
 *  - Regla 6: identifica por slug, nunca reclama un id numérico fijo — el
 *    autoincrement de la base decide el id de lo que sea nuevo.
 *  - Regla 8: nunca escribe en `role_system_permissions`. Esta sincronización
 *    no concede ni retira ningún acceso a ningún rol.
 *
 * El módulo mismo solo se RECONOCE, nunca se crea aquí: una fila de
 * `system_modules` necesita metadata de UI (nombre, ícono, grupo, path) que
 * `ModuleCatalogEntry` no declara a propósito (este índice no es una
 * pantalla). Si el módulo declarado no existe en BD, la revisión de
 * consistencia lo reporta; esta sincronización no lo inventa.
 */
export default class SystemPermissionCatalogSyncService {
  constructor(private readonly catalog: SystemPermissionCatalog = SYSTEM_PERMISSION_CATALOG) {}

  async sync(): Promise<SystemPermissionCatalogSyncResult> {
    validateCatalogIntegrity(this.catalog)

    const result: SystemPermissionCatalogSyncResult = {
      createdPermissionSlugs: [],
      skippedActions: [],
    }

    for (const [moduleSlug, actions] of Object.entries(this.catalog.actionsByModule)) {
      await this.syncModuleActions(moduleSlug, actions, result)
    }

    return result
  }

  private async syncModuleActions(
    moduleSlug: string,
    actions: readonly ActionCatalogEntry<string>[],
    result: SystemPermissionCatalogSyncResult
  ): Promise<void> {
    const systemModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', moduleSlug)
      .first()

    if (!systemModule) {
      for (const action of actions) {
        result.skippedActions.push({
          slug: action.slug,
          reason: `módulo "${moduleSlug}" no encontrado (o dado de baja) en system_modules`,
        })
      }
      return
    }

    for (const action of actions) {
      const created = await this.ensureAction(systemModule.systemModuleId, action)
      if (created) {
        result.createdPermissionSlugs.push(action.slug)
      }
    }
  }

  private async ensureAction(
    systemModuleId: number,
    action: ActionCatalogEntry<string>
  ): Promise<boolean> {
    if (action.exemption) {
      return false // no registra apartados
    }

    const isExact = action.legacyEquivalence?.relation === 'exact'

    const slugToMatch = isExact ? action.legacyEquivalence!.systemPermissionSlug : action.slug

    const existing = await SystemPermission.query()
      .withTrashed()
      .where('systemModuleId', systemModuleId)
      .where('systemPermissionSlug', slugToMatch)
      .first()

    if (existing) {
      return false
    }

    await SystemPermission.create({
      systemPermissionName: action.displayName,
      systemPermissionSlug: action.slug,
      systemModuleId,
    })
    return true
  }
}
