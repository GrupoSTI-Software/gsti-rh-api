import { LogStore } from '#models/MongoDB/log_store'
import { DateTime } from 'luxon'

/**
 * Log de auditoría para intentos de acceso directo (por id) a un registro
 * fuera del scope de empresa del usuario, o inexistente.
 *
 * USRH1783372659486 §"Qué información hay que guardar": se conserva el
 * registro de accesos bloqueados a nivel de log técnico para auditar
 * intentos de acceso cruzado, sin exponer el contenido del registro ajeno.
 *
 * No distingue "no existe" de "no es tuyo" en el log tampoco — solo registra
 * que un id solicitado no resolvió dentro del scope del actor.
 */
export interface ScopeDeniedLogEntry {
  /** Dominio del recurso solicitado (p. ej. "position", "department", "employee_proceeding_file"). */
  domain: string
  /** Acción intentada (show|update|delete|store|getProceedingFiles). */
  action: string
  /** Id solicitado por el cliente. Nunca se registra el contenido del registro. */
  requestedId: number | string
  /** Id del usuario autenticado que hizo la petición. */
  actorUserId: number | null
  /** Scope de unidades de negocio del actor al momento de la petición. */
  businessUnitScope: number[]
}

export default class ScopeDeniedLogService {
  static async log(entry: ScopeDeniedLogEntry): Promise<void> {
    try {
      await LogStore.set('log_scope_denied', {
        domain: entry.domain,
        action: entry.action,
        requested_id: entry.requestedId,
        actor_user_id: entry.actorUserId,
        business_unit_scope: entry.businessUnitScope,
        date: DateTime.local().setZone('utc').toISO(),
      })
    } catch {
      // El log es best-effort: nunca debe romper la respuesta 404 al cliente.
    }
  }
}
