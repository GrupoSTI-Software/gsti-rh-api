import { createHash } from 'node:crypto'
import { DateTime } from 'luxon'
import Role from '#models/role'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import RoleSystemPermission from '#models/role_system_permission'
import type User from '#models/user'
import {
  SYSTEM_PERMISSION_CATALOG,
  type SystemPermissionCatalog,
} from '#constants/system_permission_catalog'
import type {
  SessionPermissionActionNode,
  SessionPermissionModuleNode,
  SessionPermissionSectionNode,
  SessionPermissionTree,
  SessionPermissionTreeVersion,
} from '#constants/session_permission_tree'
import type { ActionCatalogEntry } from '#constants/permission_catalog_types'
import { buildPermissionGateIdentity } from '#helpers/permission_gate_identity'
import type { PermissionGateIdentity } from '#helpers/permission_gate_identity'
import { decideSessionPermissionAction } from '#helpers/session_permission_decision'
import { isCatalogActionGranted } from '#helpers/session_permission_grant'
import SessionPermissionTreeUnresolvedError from '#exceptions/session_permission_tree_unresolved_error'

type ModulesBySlug = Map<string, SystemModule>
type GrantsByModuleId = Map<number, Set<string>>
type RoleGrantVersionComponents = {
  maxTimestamp: DateTime
  liveGrantDigest: string
}

const EPOCH = DateTime.fromMillis(0, { zone: 'utc' })

export default class SessionPermissionTreeService {
  constructor(private readonly catalog: SystemPermissionCatalog = SYSTEM_PERMISSION_CATALOG) {}

  async buildForUser(user: User): Promise<SessionPermissionTree> {
    const role = await this.resolveRole(user)
    const identity = buildPermissionGateIdentity(role)
    const modulesBySlug = await this.loadModulesBySlug()
    const grantsByModuleId = await this.loadGrantsByModuleId(role.roleId)
    const modules = this.assembleModules(identity, modulesBySlug, grantsByModuleId)
    const version = await this.computeVersion(role.roleId, modulesBySlug)

    return {
      role: { id: role.roleId, name: role.roleName, slug: role.roleSlug },
      modules,
      version,
      generatedAt: DateTime.utc().toISO()!,
    }
  }

  async getVersionForUser(user: User): Promise<SessionPermissionTreeVersion> {
    const role = await this.resolveRole(user)
    const modulesBySlug = await this.loadModulesBySlug()
    const version = await this.computeVersion(role.roleId, modulesBySlug)

    return { version, generatedAt: DateTime.utc().toISO()! }
  }

  private async resolveRole(user: User): Promise<Role> {
    const role = await Role.query().whereNull('role_deleted_at').where('role_id', user.roleId).first()
    if (!role) {
      throw new SessionPermissionTreeUnresolvedError()
    }
    return role
  }

  private async loadModulesBySlug(): Promise<ModulesBySlug> {
    const modules = await SystemModule.query().whereNull('system_module_deleted_at')
    return new Map(modules.map((moduleRow) => [moduleRow.systemModuleSlug, moduleRow]))
  }

  private async loadGrantsByModuleId(roleId: number): Promise<GrantsByModuleId> {
    const grants = await RoleSystemPermission.query()
      .whereNull('role_system_permission_deleted_at')
      .where('role_id', roleId)
      .preload('systemPermissions')

    const grantsByModuleId: GrantsByModuleId = new Map()

    for (const grant of grants) {
      const permission = grant.systemPermissions
      if (!permission) {
        continue
      }

      const grantedSlugs = grantsByModuleId.get(permission.systemModuleId) ?? new Set<string>()
      grantedSlugs.add(permission.systemPermissionSlug)
      grantsByModuleId.set(permission.systemModuleId, grantedSlugs)
    }

    return grantsByModuleId
  }

  private assembleModules(
    identity: PermissionGateIdentity,
    modulesBySlug: ModulesBySlug,
    grantsByModuleId: GrantsByModuleId
  ): SessionPermissionModuleNode[] {
    return this.catalog.modules.map((moduleEntry) => {
      const moduleRow = modulesBySlug.get(moduleEntry.slug)
      const active = Boolean(moduleRow && moduleRow.systemModuleActive === 1)
      const permissionEnforcementActive = moduleRow?.systemModulePermissionEnforcementActive ?? false
      const actions = this.catalog.actionsByModule[moduleEntry.slug] ?? []

      if (!moduleEntry.actionsEnumerated || actions.length === 0) {
        return {
          slug: moduleEntry.slug,
          active,
          permissionEnforcementActive,
          sections: [],
        }
      }

      return {
        slug: moduleEntry.slug,
        active,
        permissionEnforcementActive,
        sections: this.assembleSections(identity, active, moduleRow, actions, grantsByModuleId),
      }
    })
  }

  private assembleSections(
    identity: PermissionGateIdentity,
    moduleActive: boolean,
    moduleRow: SystemModule | undefined,
    actions: readonly ActionCatalogEntry<string>[],
    grantsByModuleId: GrantsByModuleId
  ): SessionPermissionSectionNode[] {
    const sections = new Map<string, SessionPermissionActionNode[]>()
    const grantedSlugs = moduleRow
      ? grantsByModuleId.get(moduleRow.systemModuleId) ?? new Set<string>()
      : new Set<string>()

    for (const action of actions) {
      const decision = decideSessionPermissionAction({
        identity,
        exceptionProfile: action.exceptionProfile,
        moduleActive,
        isGranted: isCatalogActionGranted(action, grantedSlugs),
      })

      const sectionActions = sections.get(action.section) ?? []
      sectionActions.push({
        slug: action.slug,
        displayName: action.displayName,
        kind: action.kind,
        allowed: decision.allowed,
        reason: decision.reason,
        revocableFromPrivileged: action.exceptionProfile === 'strict',
        exceptionProfile: action.exceptionProfile,
        grantable: !action.exemption,
      })
      sections.set(action.section, sectionActions)
    }

    return Array.from(sections.entries()).map(([slug, actionsInSection]) => ({
      slug,
      actions: actionsInSection,
    }))
  }

  private async computeVersion(roleId: number, modulesBySlug: ModulesBySlug): Promise<string> {
    const [grantComponents, permissionsMax] = await Promise.all([
      this.computeRoleGrantVersionComponents(roleId),
      this.computeEnumeratedPermissionMax(modulesBySlug),
    ])
    const modulesMax = this.computeCatalogModuleMax(modulesBySlug)
    const catalogDigest = this.computeCatalogDigest()

    return this.shortHash(
      [
        roleId,
        grantComponents.maxTimestamp.toUTC().toISO(),
        grantComponents.liveGrantDigest,
        permissionsMax.toUTC().toISO(),
        modulesMax.toUTC().toISO(),
        catalogDigest,
      ].join(':')
    )
  }

  private async computeRoleGrantVersionComponents(
    roleId: number
  ): Promise<RoleGrantVersionComponents> {
    const grants = await RoleSystemPermission.query()
      .whereNull('role_system_permission_deleted_at')
      .where('role_id', roleId)

    const grantedPermissionIds = Array.from(
      new Set(grants.map((grant) => grant.systemPermissionId))
    ).sort((left, right) => left - right)

    return {
      maxTimestamp: this.maxDateTime(
        grants.map(
          (grant) => grant.roleSystemPermissionUpdatedAt ?? grant.roleSystemPermissionCreatedAt
        )
      ),
      liveGrantDigest: this.shortHash(grantedPermissionIds.join('|')),
    }
  }

  private async computeEnumeratedPermissionMax(modulesBySlug: ModulesBySlug): Promise<DateTime> {
    const enumeratedModuleIds = this.catalog.modules
      .filter((moduleEntry) => moduleEntry.actionsEnumerated)
      .map((moduleEntry) => modulesBySlug.get(moduleEntry.slug)?.systemModuleId)
      .filter((systemModuleId): systemModuleId is number => typeof systemModuleId === 'number')

    if (enumeratedModuleIds.length === 0) {
      return EPOCH
    }

    const permissions = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .whereIn('system_module_id', enumeratedModuleIds)

    return this.maxDateTime(
      permissions.map(
        (permission) =>
          permission.systemPermissionUpdatedAt ?? permission.systemPermissionCreatedAt ?? EPOCH
      )
    )
  }

  private computeCatalogModuleMax(modulesBySlug: ModulesBySlug): DateTime {
    const dates = this.catalog.modules.map((moduleEntry) => {
      const moduleRow = modulesBySlug.get(moduleEntry.slug)
      return moduleRow?.systemModuleUpdatedAt ?? moduleRow?.systemModuleCreatedAt ?? EPOCH
    })

    return this.maxDateTime(dates)
  }

  private computeCatalogDigest(): string {
    const typedActions = this.catalog.modules.flatMap((moduleEntry) => {
      if (!moduleEntry.actionsEnumerated) {
        return []
      }

      const actions = this.catalog.actionsByModule[moduleEntry.slug] ?? []
      return actions.map(
        (action) => `${moduleEntry.slug}:${action.slug}:${action.exceptionProfile}`
      )
    })

    return this.shortHash(typedActions.join('|'))
  }

  private maxDateTime(dates: DateTime[]): DateTime {
    return dates.reduce((maxDate, date) => {
      if (!date || !date.isValid) {
        return maxDate
      }
      return date.toMillis() > maxDate.toMillis() ? date : maxDate
    }, EPOCH)
  }

  private shortHash(payload: string): string {
    return createHash('sha256').update(payload).digest('hex').slice(0, 16)
  }
}
