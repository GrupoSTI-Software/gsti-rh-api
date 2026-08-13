import logger from '@adonisjs/core/services/logger'
import Role from '#models/role'
import SystemModule from '#models/system_module'
import RoleSystemPermission from '#models/role_system_permission'
import SystemPermission from '#models/system_permission'
import type User from '#models/user'
import type { PermissionGateOptions } from '#constants/permission_gate'
import {
  buildPermissionGateIdentity,
  hasPermissionGateBypass,
  type PermissionGateIdentity,
} from '#helpers/permission_gate_identity'

export type PermissionGateDecisionReason =
  | 'module-not-enforced'
  | 'bypass'
  | 'granted'
  | 'denied'
  | 'unresolved'

export interface PermissionGateDecision {
  allowed: boolean
  reason: PermissionGateDecisionReason
}

/**
 * Resuelve declarativamente qué puede hacer quien envía la petición
 * (USRH1785766406721). Se instancia una sola vez por petición (ver
 * `app/middleware/permission_gate_middleware.ts`, que la cachea en
 * `ctx.permissionGate`); todas las resoluciones de esa instancia se
 * cachean en memoria para no repetir consultas dentro de la misma petición.
 */
export default class PermissionGateService {
  private identityCache = new Map<number, PermissionGateIdentity | null>()
  private moduleEnforcementCache = new Map<string, boolean>()
  private grantedActionsCache = new Map<string, Set<string> | null>()

  async evaluate(
    user: User | null | undefined,
    options: PermissionGateOptions
  ): Promise<PermissionGateDecision> {
    try {
      const enforced = await this.isModuleEnforced(options.module)
      if (!enforced) {
        return { allowed: true, reason: 'module-not-enforced' }
      }

      if (!user) {
        return { allowed: false, reason: 'unresolved' }
      }

      const identity = await this.resolveIdentity(user)
      if (!identity) {
        return { allowed: false, reason: 'unresolved' }
      }

      if (hasPermissionGateBypass(identity, options.bypass)) {
        return { allowed: true, reason: 'bypass' }
      }

      const granted = await this.grantedActionSlugs(identity.roleId, options.module)
      const actions = Array.isArray(options.action) ? options.action : [options.action]
      if (actions.some((slug) => granted?.has(slug))) {
        return { allowed: true, reason: 'granted' }
      }
      return { allowed: false, reason: 'denied' }
    } catch (error) {
      logger.error(
        { err: error, module: options.module, action: options.action },
        'PermissionGateService: no se pudo determinar el permiso; se niega la operación'
      )
      return { allowed: false, reason: 'unresolved' }
    }
  }

  private async resolveIdentity(user: User): Promise<PermissionGateIdentity | null> {
    if (this.identityCache.has(user.userId)) {
      return this.identityCache.get(user.userId)!
    }

    const role = await Role.query().whereNull('role_deleted_at').where('role_id', user.roleId).first()
    if (!role) {
      this.identityCache.set(user.userId, null)
      return null
    }

    const identity = buildPermissionGateIdentity(role)
    this.identityCache.set(user.userId, identity)
    return identity
  }

  private async isModuleEnforced(moduleSlug: string): Promise<boolean> {
    if (this.moduleEnforcementCache.has(moduleSlug)) {
      return this.moduleEnforcementCache.get(moduleSlug)!
    }

    const systemModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', moduleSlug)
      .first()

    // Fail-closed ("ante la duda, se niega"): un slug que no resuelve a
    // ninguna fila se trata como exigido, nunca como apagado.
    const enforced = systemModule ? systemModule.systemModulePermissionEnforcementActive : true
    this.moduleEnforcementCache.set(moduleSlug, enforced)
    return enforced
  }

  private async grantedActionSlugs(roleId: number, moduleSlug: string): Promise<Set<string> | null> {
    const cacheKey = `${roleId}:${moduleSlug}`
    if (this.grantedActionsCache.has(cacheKey)) {
      return this.grantedActionsCache.get(cacheKey)!
    }

    const systemModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', moduleSlug)
      .where('system_module_active', 1)
      .first()

    if (!systemModule) {
      this.grantedActionsCache.set(cacheKey, null)
      return null
    }

    const modulePermissions = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('system_module_id', systemModule.systemModuleId)

    if (modulePermissions.length === 0) {
      this.grantedActionsCache.set(cacheKey, new Set())
      return new Set()
    }

    const modulePermissionIds = modulePermissions.map((p) => p.systemPermissionId)
    const grants = await RoleSystemPermission.query()
      .whereNull('role_system_permission_deleted_at')
      .where('role_id', roleId)
      .whereIn('system_permission_id', modulePermissionIds)

    const grantedIds = new Set(grants.map((g) => g.systemPermissionId))
    const slugs = new Set(
      modulePermissions
        .filter((p) => grantedIds.has(p.systemPermissionId))
        .map((p) => p.systemPermissionSlug)
    )
    this.grantedActionsCache.set(cacheKey, slugs)
    return slugs
  }
}
