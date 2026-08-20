import type { HttpContext } from '@adonisjs/core/http'
import Role from '#models/role'
import { isSystemRoleSlug } from '#constants/system_roles'

/**
 * Determina si el usuario actual puede reconfigurar un rol de sistema.
 */
export async function isSystemRoleLockedForUser(
  auth: HttpContext['auth'],
  role: Role
): Promise<boolean> {
  if (!isSystemRoleSlug(role.roleSlug)) {
    return false
  }

  await auth.check()
  const user = auth.user
  if (!user) {
    return true
  }

  if (!user.role) {
    await user.load('role')
  }

  return user.role?.roleSlug !== 'root'
}
