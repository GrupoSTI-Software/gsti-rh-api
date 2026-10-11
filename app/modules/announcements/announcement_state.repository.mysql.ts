import type { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import UserAnnouncementState from '#models/user_announcement_state'
import type { AnnouncementStateRepository } from './announcement_state.repository.js'

/**
 * Implementación Lucid/MySQL de la marca de anuncios.
 *
 * `advanceLastSeen` es un upsert de una sola sentencia (`INSERT ... ON DUPLICATE KEY
 * UPDATE` sobre la clave única `user_id`) con `GREATEST`: dos pestañas que marcan a la
 * vez no pueden duplicar la fila ni hacer retroceder la marca, sin transacción ni
 * bloqueo explícito. `COALESCE` cubre una fila con fecha nula, porque `GREATEST` con
 * un `NULL` devuelve `NULL` en MySQL.
 */
export default class AnnouncementStateRepositoryMysql implements AnnouncementStateRepository {
  async findLastSeenByUser(userId: number): Promise<DateTime | null> {
    const row = await UserAnnouncementState.findBy('userId', userId)
    return row?.userAnnouncementStateLastSeenAt ?? null
  }

  async advanceLastSeen(userId: number, lastSeenAt: DateTime): Promise<DateTime | null> {
    const seenAt = lastSeenAt.toJSDate()
    const now = new Date()

    await db
      .knexQuery()
      .table(UserAnnouncementState.table)
      .insert({
        user_id: userId,
        user_announcement_state_last_seen_at: seenAt,
        user_announcement_state_created_at: now,
        user_announcement_state_updated_at: now,
      })
      .onConflict('user_id')
      .merge({
        user_announcement_state_last_seen_at: db.knexRawQuery(
          'GREATEST(COALESCE(user_announcement_state_last_seen_at, ?), ?)',
          [seenAt, seenAt]
        ),
        user_announcement_state_updated_at: now,
      })

    return this.findLastSeenByUser(userId)
  }
}
