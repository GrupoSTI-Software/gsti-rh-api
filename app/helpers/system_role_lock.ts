import type { HttpContext } from '@adonisjs/core/http'
import Role from '#models/role'

/**
 * Slugs que sí pueden reconfigurar su propio rol: la cuenta de plataforma y el
 * dueño de la empresa. Son la salida del tenant; si se bloquearan a sí mismos
 * nadie podría corregir su configuración.
 */
const OWN_ROLE_EDITOR_SLUGS: readonly string[] = ['root', 'owner']

/**
 * Determina si el usuario actual puede reconfigurar un rol de plataforma.
 *
 * Lo que se protege es el rol SIN empresa dueña (`business_unit_id` NULL): hoy
 * solo `root`. Antes la lista eran `owner` y `empleado`, porque eran filas
 * globales que todos los clientes compartían y tocarlas afectaba a los demás;
 * desde que cada empresa tiene las suyas, esos roles son del cliente y él los
 * administra. Lo que sigue sin poder hacer es fabricar o renombrar un rol con
 * un slug reservado (`RESERVED_ROLE_IDENTITY_SLUGS`), que es otra guarda.
 */
export async function isSystemRoleLockedForUser(
  auth: HttpContext['auth'],
  role: Role
): Promise<boolean> {
  if (role.businessUnitId !== null && role.businessUnitId !== undefined) {
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
