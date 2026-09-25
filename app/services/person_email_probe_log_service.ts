import { LogStore } from '#models/MongoDB/log_store'
import { DateTime } from 'luxon'

/**
 * Bitácora de intentos de captura de correo personal (USRH1789762889970).
 *
 * El correo personal es único GLOBAL por decisión (puede ser credencial), así
 * que su rechazo es un oráculo de existencia por construcción. El mensaje no
 * confirma nada; esta bitácora es lo que permite reconocer el sondeo después y
 * atribuirlo a un cliente con nombre.
 *
 * NUNCA se registra el correo en claro: se guarda su `blindIndex` (HMAC-SHA256
 * con `BLIND_INDEX_KEY`, `app/utils/blind_index.ts:27-30`), NO reversible por
 * diccionario. Es el MISMO hash que persiste `people.person_email_hash`
 * (`app/models/person.ts:230-232`, `:265`), de modo que la bitácora es unible al
 * expediente: es SEUDONIMIZADA, NO ANÓNIMA, y por tanto DATO PERSONAL bajo
 * LFPDPPP. Necesita retención declarada en la política.
 *
 * El correo tampoco puede ir a `logger.*` ni al mensaje de un `throw`: el
 * `redact` de pino cubre 8 rutas bajo `err.*` y NO cubre `err.message`
 * (`app/constants/log_redact_paths.ts:21`).
 *
 * FUERA de esta bitácora, por diseño: el correo en claro, y el `person_id`,
 * el `business_unit_id` y el nombre del TITULAR COLISIONADO. Registrarlos la
 * convertiría en un mapa entre clientes de quién tiene a quién — peor que el
 * oráculo que la HU encarece.
 */
export type PersonEmailProbeOutcome = 'accepted' | 'rejected_not_available' | 'rate_limited'

export interface PersonEmailProbeLogEntry {
  /** Camino que originó el intento. */
  path: 'store' | 'update' | 'import'
  /** `blindIndex(correo)`. NUNCA el correo en claro. */
  personEmailHash: string
  /** Desenlace. Se registran los TRES: sin los aceptados, 200 sondeos con 3 choques se ven igual que un capturista honesto. */
  outcome: PersonEmailProbeOutcome
  /** Usuario autenticado que hizo el intento. */
  actorUserId: number | null
  /** Scope de empresas DEL ACTOR al momento del intento. Nunca el del titular colisionado. */
  businessUnitScope: number[]
  /** Expediente sobre el que se escribe; `null` en el alta. Nunca el expediente ajeno. */
  targetPersonId: number | null
}

export default class PersonEmailProbeLogService {
  static async log(entry: PersonEmailProbeLogEntry): Promise<void> {
    try {
      await LogStore.set('log_person_email_probe', {
        path: entry.path,
        email_hash: entry.personEmailHash,
        outcome: entry.outcome,
        actor_user_id: entry.actorUserId,
        business_unit_scope: entry.businessUnitScope,
        target_person_id: entry.targetPersonId,
        date: DateTime.local().setZone('utc').toISO(),
      })
    } catch {
      // Best-effort: la bitácora nunca debe romper NI CAMBIAR la respuesta al
      // cliente. Una diferencia de comportamiento con Mongo caído sería otro canal.
    }
  }
}
