import type Role from '#models/role'
import type { PermissionGateBypass } from '#constants/permission_gate'

export interface PermissionGateIdentity {
  roleId: number
  isPlatformAccount: boolean
  isCompanyOwnerAccount: boolean
  isDireccionGeneralAccount: boolean
}

export function buildPermissionGateIdentity(role: Role): PermissionGateIdentity {
  return {
    roleId: role.roleId,
    isPlatformAccount: role.roleSlug === 'root',
    isCompanyOwnerAccount: role.roleSlug === 'owner',
    isDireccionGeneralAccount: role.roleSlug === 'super-administrador',
  }
}

export function hasPermissionGateBypass(
  identity: PermissionGateIdentity,
  bypass: PermissionGateBypass
): boolean {
  switch (bypass) {
    case 'standard':
      return identity.isPlatformAccount || identity.isCompanyOwnerAccount
    case 'expanded':
      return (
        identity.isPlatformAccount ||
        identity.isCompanyOwnerAccount ||
        identity.isDireccionGeneralAccount
      )
    case 'platformReserved':
      return identity.isPlatformAccount
    case 'strict':
      return false
    default:
      return false
  }
}
