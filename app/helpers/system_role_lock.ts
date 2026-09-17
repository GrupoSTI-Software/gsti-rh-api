import type { HttpContext } from '@adonisjs/core/http'
import Role from '#models/role'
import { isSystemRoleSlug } from '#constants/system_roles'

/**
 * Slugs que sí pueden reconfigurar su propio rol: la cuenta de plataforma y el
 * dueño de la empresa. Son la salida del tenant; si se bloquearan a sí mismos
 * nadie podría corregir su configuración.
 */
const OWN_ROLE_EDITOR_SLUGS: readonly string[] = ['root', 'owner']

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

/**
 * Determina si la operación toca el rol del propio actor y debe rechazarse.
 *
 * Por qué existe: quien administra roles podría editar, borrar o concederse
 * permisos sobre el rol con el que inició sesión y escalar sus propios
 * privilegios. El gate de `roles-and-permissions` solo dice si puede
 * administrar roles, no cuáles. Solo `root` y `owner` quedan fuera de la
 * regla (ver `OWN_ROLE_EDITOR_SLUGS`).
 *
 * No depende de la exigencia del módulo: es una regla de identidad, así que
 * apagar la exigencia desde el landlord no reabre este camino.
 *
 * @param targetRoleId  Id del rol que la operación modifica (del path o del lote).
 * @returns `true` si el rol objetivo es el del actor y el actor no es root ni owner;
 *   también `true` si no hay sesión (ante la duda, se niega).
 */
export async function isOwnRoleLockedForUser(
  auth: HttpContext['auth'],
  targetRoleId: number | string
): Promise<boolean> {
  await auth.check()
  const user = auth.user
  if (!user) {
    return true
  }

  if (user.roleId !== Number(targetRoleId)) {
    return false
  }

  if (!user.role) {
    await user.load('role')
  }

  return !OWN_ROLE_EDITOR_SLUGS.includes(user.role?.roleSlug ?? '')
}
