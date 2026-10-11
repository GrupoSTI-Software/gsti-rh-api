import type User from '#models/user'

/** Puerto: qué claves `<modulo>:<permiso>` tiene concedidas el usuario. */
export interface AnnouncementPermissionResolver {
  grantedKeys(user: User, permissionKeys: readonly string[]): Promise<Set<string>>
}
