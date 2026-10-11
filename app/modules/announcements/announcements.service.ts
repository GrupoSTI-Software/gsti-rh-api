import { DateTime } from 'luxon'
import { ANNOUNCEMENTS_FUTURE_TOLERANCE_MINUTES } from './announcements.constants.js'
import { AnnouncementsError } from './announcements.error.js'
import AnnouncementStateRepositoryMysql from './announcement_state.repository.mysql.js'
import type { AnnouncementStateRepository } from './announcement_state.repository.js'
import type { AnnouncementStateDto } from './dto/announcement_state.dto.js'

/**
 * Marca de agua del último anuncio de producto que el usuario vio en el Backoffice.
 * El contenido de los anuncios vive en el Backoffice; aquí solo se guarda la fecha.
 *
 * Reglas de negocio:
 *  - La consulta nunca crea fila: sin registro, `lastSeenAt` es `null`.
 *  - La marca nunca retrocede: una fecha menor o igual a la guardada se ignora y se
 *    responde la vigente.
 *  - Una fecha más allá de `ANNOUNCEMENTS_FUTURE_TOLERANCE_MINUTES` en el futuro se
 *    rechaza (422).
 *
 * Aislamiento: el userId siempre viene de auth.user.userId, nunca del body (anti-IDOR).
 * La marca es personal del usuario, no de la empresa: sin business scope.
 */
export default class AnnouncementsService {
  constructor(
    private readonly repository: AnnouncementStateRepository = new AnnouncementStateRepositoryMysql()
  ) {}

  /** GET /api/announcements/me */
  async getState(userId: number): Promise<AnnouncementStateDto> {
    return this.toDto(await this.repository.findLastSeenByUser(userId))
  }

  /**
   * PUT /api/announcements/me
   *
   * @throws AnnouncementsError 422 si `lastSeenAt` está demasiado en el futuro.
   */
  async markSeen(userId: number, lastSeenAt: DateTime): Promise<AnnouncementStateDto> {
    const limit = DateTime.now().plus({ minutes: ANNOUNCEMENTS_FUTURE_TOLERANCE_MINUTES })
    if (lastSeenAt > limit) {
      throw AnnouncementsError.futureDate()
    }

    return this.toDto(await this.repository.advanceLastSeen(userId, lastSeenAt))
  }

  private toDto(lastSeenAt: DateTime | null): AnnouncementStateDto {
    return { lastSeenAt: lastSeenAt ? lastSeenAt.toUTC().toISO() : null }
  }
}
