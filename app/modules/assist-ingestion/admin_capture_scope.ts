import { DateTime } from 'luxon'
import Role from '#models/role'
import type User from '#models/user'
import { ASSIST_INGESTION_PUNCH_TIME_ROLE_SCOPE } from './assist_ingestion.rejections.js'
import type { AssistIngestionRejection } from './dto/assist_ingestion.dto.js'

/**
 * Alcance hacia atrás de la captura administrativa.
 *
 * La ventana de `resolvePunchTime` existe para cerrar el hueco de conexión de
 * la app del colaborador: un equipo sin red entrega tarde una checada que
 * ocurrió hace poco. La captura desde el backoffice es lo contrario —alguien
 * corrige el pasado a propósito—, así que no se mide con esa ventana sino con
 * los días que el rol de quien captura tiene autorizado modificar.
 */

/** Slug del rol de plataforma, sin tope de días. */
const ROOT_ROLE_SLUG = 'root'

/** Rol del actor, reducido a lo que decide el alcance de la captura. */
export interface AdminCaptureRole {
  roleSlug?: string | null
  roleManagementDays?: number | null
}

/**
 * Instante más antiguo que el rol puede capturar, o `null` cuando no tiene tope.
 *
 * El rol raíz y un rol sin días declarados no tienen tope; `0` deja solo el día
 * en curso. El piso es el inicio del día en la zona del sitio, no la hora exacta
 * de ahora menos los días: "tres días atrás" son tres días completos y no
 * setenta y dos horas, que es como lo lee quien captura.
 *
 * @param params.role - Rol efectivo del actor en la empresa activa.
 * @param params.now - Instante de la captura.
 * @param params.zone - Zona IANA del sitio del colaborador.
 * @returns Piso en UTC, o `null` si el rol no tiene tope.
 */
export function resolveAdminCaptureFloor(params: {
  role: AdminCaptureRole | null | undefined
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
 * Indica si la checada cae dentro del alcance del rol.
 *
 * @param punchTimeUtc - Instante de la checada.
 * @param floor - Piso devuelto por `resolveAdminCaptureFloor`.
 */
export function isWithinAdminCaptureScope(
  punchTimeUtc: DateTime,
  floor: DateTime | null
): boolean {
  if (!floor) return true
  return punchTimeUtc >= floor
}

/**
 * Aplica el alcance del rol a una captura administrativa ya resuelta.
 *
 * Es el único punto del módulo que toca la base: carga el rol de quien captura
 * por `user.roleId`, igual que `ensureEmployeeAssistWrite`, porque el rol
 * efectivo de la empresa activa ya quedó escrito ahí por el middleware de
 * alcance y no siempre viene precargado como relación.
 *
 * @param params.user - Cuenta que está capturando.
 * @param params.punchTimeUtc - Instante ya normalizado de la checada.
 * @param params.zone - Zona IANA del sitio del colaborador.
 * @param params.now - Instante de la captura.
 * @returns El rechazo cuando la fecha excede el alcance, o `null` si procede.
 */
export async function resolveAdminCaptureRejection(params: {
  user: User | null | undefined
  punchTimeUtc: DateTime
  zone: string
  now: DateTime
}): Promise<AssistIngestionRejection | null> {
  const roleId = params.user?.roleId
  const role = roleId ? await Role.find(roleId) : null

  const floor = resolveAdminCaptureFloor({ role, now: params.now, zone: params.zone })

  return isWithinAdminCaptureScope(params.punchTimeUtc, floor)
    ? null
    : ASSIST_INGESTION_PUNCH_TIME_ROLE_SCOPE
}
