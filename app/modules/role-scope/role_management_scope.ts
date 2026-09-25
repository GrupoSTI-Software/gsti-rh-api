import { DateTime } from 'luxon'
import Role from '#models/role'
import type User from '#models/user'

/**
 * Cuántos días hacia atrás puede un rol tocar la asistencia de alguien.
 *
 * Nació para la captura administrativa de checadas y hoy rige también las
 * excepciones de turno y los cambios de turno: las tres escriben sobre un día
 * concreto del pasado y el tope es el mismo, así que vive fuera del módulo de
 * ingesta para que ninguna lo copie.
 *
 * El dato es `roles.role_management_days`.
 */

/** Slug del rol de plataforma, sin tope de días. */
const ROOT_ROLE_SLUG = 'root'

/** Rol del actor, reducido a lo que decide el alcance. */
export interface RoleManagementScopeRole {
  roleSlug?: string | null
  roleManagementDays?: number | null
}

/**
 * Instante más antiguo que el rol puede tocar, o `null` cuando no tiene tope.
 *
 * El rol raíz y un rol sin días declarados no tienen tope; `0` deja solo el día
 * en curso. El piso es el inicio del día en la zona del sitio, no la hora exacta
 * de ahora menos los días: "tres días atrás" son tres días completos y no
 * setenta y dos horas, que es como lo lee quien captura.
 *
 * El dueño de la empresa NO queda exento. Los clientes lo tratan como
 * privilegiado para los permisos de módulo, pero el alcance en días es una
 * configuración explícita de su rol y aquí se respeta.
 *
 * @param params.role - Rol efectivo del actor en la empresa activa.
 * @param params.now - Instante de la operación.
 * @param params.zone - Zona IANA del sitio del colaborador.
 * @returns Piso en UTC, o `null` si el rol no tiene tope.
 */
export function resolveRoleManagementFloor(params: {
  role: RoleManagementScopeRole | null | undefined
  now: DateTime
  zone: string
}): DateTime | null {
  const role = params.role

  if (!role || role.roleSlug === ROOT_ROLE_SLUG) return null

  const declaredDays = role.roleManagementDays
  if (declaredDays === null || declaredDays === undefined) return null

  const days = Number.isFinite(declaredDays) && declaredDays > 0 ? Math.trunc(declaredDays) : 0

  return params.now.setZone(params.zone).startOf('day').minus({ days }).toUTC()
}

/**
 * Indica si el instante cae dentro del alcance del rol.
 *
 * @param instant - Momento sobre el que se quiere escribir.
 * @param floor - Piso devuelto por `resolveRoleManagementFloor`.
 */
export function isWithinRoleManagementScope(
  instant: DateTime,
  floor: DateTime | null
): boolean {
  if (!floor) return true
  return instant >= floor
}

/**
 * Piso del actor de la petición, cargando su rol.
 *
 * Es el único punto del módulo que toca la base. Carga por `user.roleId`, igual
 * que `ensureEmployeeAssistWrite`, porque el rol efectivo de la empresa activa
 * ya quedó escrito ahí por el middleware de alcance y no siempre viene
 * precargado como relación.
 *
 * @param params.user - Cuenta que ejecuta la operación.
 * @param params.zone - Zona IANA del sitio del colaborador.
 * @param params.now - Instante de la operación.
 * @returns Piso en UTC, o `null` si el rol no tiene tope.
 */
export async function resolveRoleManagementFloorForUser(params: {
  user: User | null | undefined
  zone: string
  now: DateTime
}): Promise<DateTime | null> {
  const roleId = params.user?.roleId
  const role = roleId ? await Role.find(roleId) : null

  return resolveRoleManagementFloor({ role, now: params.now, zone: params.zone })
}

/**
 * Indica si una fecha civil (`YYYY-MM-DD`) cae dentro del alcance del rol.
 *
 * Las excepciones y los cambios de turno se registran sobre un día, no sobre un
 * instante, así que el día se ancla al inicio de su jornada en la zona del
 * sitio antes de compararlo con el piso.
 *
 * @param day - Fecha civil del registro.
 * @param floor - Piso devuelto por `resolveRoleManagementFloor`.
 * @param zone - Zona IANA del sitio del colaborador.
 */
export function isDayWithinRoleManagementScope(
  day: string,
  floor: DateTime | null,
  zone: string
): boolean {
  if (!floor) return true

  const dayStart = DateTime.fromISO(day, { zone }).startOf('day')
  if (!dayStart.isValid) return true

  return dayStart.toUTC() >= floor
}
