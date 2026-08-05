import type { PermissionGateBypass } from '#constants/permission_gate'
import type { PermissionActionKind } from '#constants/permission_catalog_types'

export type SessionPermissionAllowedReason = 'assignment' | 'privileged-role'
export type SessionPermissionDeniedReason =
  | 'missing-assignment'
  | 'explicit-revocation'
  | 'module-inactive'

export type SessionPermissionReason =
  | SessionPermissionAllowedReason
  | SessionPermissionDeniedReason

export interface SessionPermissionActionNode {
  slug: string
  displayName: string
  kind: PermissionActionKind
  allowed: boolean
  reason: SessionPermissionReason
  /** true cuando exceptionProfile === 'strict' (retiro posible incluso a privilegiados). */
  revocableFromPrivileged: boolean
  exceptionProfile: PermissionGateBypass
}

export interface SessionPermissionSectionNode {
  slug: string
  actions: SessionPermissionActionNode[]
}

export interface SessionPermissionModuleNode {
  slug: string
  active: boolean
  permissionEnforcementActive: boolean
  sections: SessionPermissionSectionNode[]
}

export interface SessionPermissionTreeRole {
  id: number
  name: string
  slug: string
}

export interface SessionPermissionTree {
  role: SessionPermissionTreeRole
  modules: SessionPermissionModuleNode[]
  version: string
  generatedAt: string // ISO-8601
}

export interface SessionPermissionTreeVersion {
  version: string
  generatedAt: string
}
