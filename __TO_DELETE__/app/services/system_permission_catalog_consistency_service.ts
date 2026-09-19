import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import {
  SYSTEM_PERMISSION_CATALOG,
  KNOWN_DUPLICATE_IDS,
  validateCatalogIntegrity,
  type SystemPermissionCatalog,
  type KnownDuplicateIdFinding,
} from '#constants/system_permission_catalog'
import type { ActionCatalogEntry } from '#constants/permission_catalog_types'

export interface DeclaredNotRegisteredFinding {
  kind: 'module' | 'permission'
  slug: string
  detail: string
}

export interface RegisteredNotDeclaredFinding {
  slug: string
  systemPermissionId: number
}

export interface SystemPermissionCatalogConsistencyReport {
  /** Declarado en el catálogo, sin fila viva equivalente en BD. */
  declaredNotRegistered: DeclaredNotRegisteredFinding[]
  /** Permisos vivos en BD, de un módulo enumerado, que el catálogo ya no declara. */
  registeredNotDeclared: RegisteredNotDeclaredFinding[]
  /** Módulos reconocidos pero sin acciones enumeradas — deuda conocida, no error. */
  knownDebtModules: string[]
  /** Notas informativas para módulos con system_module_active=0 (regla 10). */
  inactiveModuleNotes: string[]
  /** Colisiones de id ya existentes en los seeders, informativas (decisión confirmada con el usuario). */
  knownDuplicateIds: KnownDuplicateIdFinding[]
}

/**
 * Revisión de consistencia del índice maestro (USRH1785766406720, regla 7):
 * de **solo lectura** — nunca corrige, crea ni borra. Compara lo declarado
 * en el catálogo contra lo registrado en `system_modules` /
 * `system_permissions` y señala de qué lado está cada diferencia.
 */
export default class SystemPermissionCatalogConsistencyService {
  constructor(private readonly catalog: SystemPermissionCatalog = SYSTEM_PERMISSION_CATALOG) {}

  async checkConsistency(): Promise<SystemPermissionCatalogConsistencyReport> {
    validateCatalogIntegrity(this.catalog)

    const report: SystemPermissionCatalogConsistencyReport = {
      declaredNotRegistered: [],
      registeredNotDeclared: [],
      knownDebtModules: this.catalog.modules
        .filter((moduleEntry) => !moduleEntry.actionsEnumerated)
        .map((moduleEntry) => moduleEntry.slug),
      inactiveModuleNotes: [],
      knownDuplicateIds: KNOWN_DUPLICATE_IDS,
    }

    await this.checkModules(report)
    for (const [moduleSlug, actions] of Object.entries(this.catalog.actionsByModule)) {
      await this.checkModuleActions(moduleSlug, actions, report)
    }

    return report
  }

  private async checkModules(report: SystemPermissionCatalogConsistencyReport): Promise<void> {
    for (const moduleEntry of this.catalog.modules) {
      const systemModule = await SystemModule.query()
        .whereNull('system_module_deleted_at')
        .where('system_module_slug', moduleEntry.slug)
        .first()

      if (!systemModule) {
        report.declaredNotRegistered.push({
          kind: 'module',
          slug: moduleEntry.slug,
          detail: 'módulo declarado en el catálogo sin fila viva en system_modules',
        })
        continue
      }

      if (systemModule.systemModuleActive !== 1) {
        report.inactiveModuleNotes.push(
          `"${moduleEntry.slug}": módulo inactivo (system_module_active=0); sus acciones no ` +
            'cuentan para hasAccess y no se reportan como perdidas por esta causa (regla 10)'
        )
      }
    }
  }

  private async checkModuleActions(
    moduleSlug: string,
    actions: readonly ActionCatalogEntry<string>[],
    report: SystemPermissionCatalogConsistencyReport
  ): Promise<void> {
    const systemModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', moduleSlug)
      .first()

    if (!systemModule) {
      // Ya quedó reportado como módulo faltante en checkModules; sin el módulo
      // no hay nada más que comparar.
      return
    }

    const registeredPermissions = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('system_module_id', systemModule.systemModuleId)

    const registeredSlugs = new Set(registeredPermissions.map((p) => p.systemPermissionSlug))

    for (const action of actions) {
      if (action.exemption) {
        continue
      }
      const slugToMatch =
        action.legacyEquivalence?.relation === 'exact'
          ? action.legacyEquivalence.systemPermissionSlug
          : action.slug
      if (!registeredSlugs.has(slugToMatch)) {
        report.declaredNotRegistered.push({
          kind: 'permission',
          slug: action.slug,
          detail:
            `acción declarada en el módulo "${moduleSlug}" sin fila viva en ` +
            `system_permissions (buscada como "${slugToMatch}")`,
        })
      }
    }

    const declaredSlugsInDb = new Set(
      actions
        .filter((action) => !action.exemption)
        .map((action) =>
          action.legacyEquivalence?.relation === 'exact'
            ? action.legacyEquivalence.systemPermissionSlug
            : action.slug
        )
    )
    for (const permission of registeredPermissions) {
      if (!declaredSlugsInDb.has(permission.systemPermissionSlug)) {
        report.registeredNotDeclared.push({
          slug: permission.systemPermissionSlug,
          systemPermissionId: permission.systemPermissionId,
        })
      }
    }
  }
}
