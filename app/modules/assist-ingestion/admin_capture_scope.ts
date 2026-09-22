import { DateTime } from 'luxon'
import type User from '#models/user'
import {
  isWithinRoleManagementScope,
  resolveRoleManagementFloorForUser,
} from '#modules/role-scope/role_management_scope'
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
 *
 * El cálculo del piso vive en `#modules/role-scope`, porque las excepciones de
 * turno y los cambios de turno se miden con el mismo tope. Aquí solo queda la
 * traducción a un rechazo de este canal.
 */

/**
 * Aplica el alcance del rol a una captura administrativa ya resuelta.
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
  const floor = await resolveRoleManagementFloorForUser({
    user: params.user,
    zone: params.zone,
    now: params.now,
  })

  return isWithinRoleManagementScope(params.punchTimeUtc, floor)
    ? null
    : ASSIST_INGESTION_PUNCH_TIME_ROLE_SCOPE
}
