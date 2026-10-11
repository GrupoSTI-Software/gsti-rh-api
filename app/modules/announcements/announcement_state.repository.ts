import type { DateTime } from 'luxon'

/** Puerto de acceso a la marca de anuncios por usuario. */
export interface AnnouncementStateRepository {
  /** Marca vigente del usuario; `null` si no tiene fila o nunca registró fecha. */
  findLastSeenByUser(userId: number): Promise<DateTime | null>

  /**
   * Crea o avanza la marca del usuario en una sola operación atómica y devuelve la
   * vigente. Nunca retrocede: si `lastSeenAt` es menor o igual a la guardada, la
   * guardada se conserva.
   */
  advanceLastSeen(userId: number, lastSeenAt: DateTime): Promise<DateTime | null>
}
