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
  /**
   * `false` para las acciones exentas del catálogo (`exemption`): se enumeran
   * en el árbol porque describen superficie real del producto, pero no tienen
   * fila en `system_permissions`, así que no se pueden otorgar ni revocar
   * desde la configuración de roles. Quien componga un editor debe omitirlas.
   */
  grantable: boolean
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
