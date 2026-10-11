import type User from '#models/user'
import type AnnouncementSlide from '#models/announcement_slide'
import AnnouncementSlideRepositoryMysql from './announcement_slide.repository.mysql.js'
import AnnouncementStateRepositoryMysql from './announcement_state.repository.mysql.js'
import AnnouncementBannerStorageS3 from './announcement_banner.storage.s3.js'
import AnnouncementPermissionResolverGate from './announcement_permission.resolver.gate.js'
import {
  latestPublishedAt,
  publishedPermissionKeys,
  selectDeckSlides,
  type DeckCandidate,
} from './domain/deck_selection.js'
import { toIsoUtc } from './domain/iso_date.js'
import type { AnnouncementSlideRepository } from './announcement_slide.repository.js'
import type { AnnouncementStateRepository } from './announcement_state.repository.js'
import type { AnnouncementBannerStorage } from './announcement_banner.storage.js'
import type { AnnouncementPermissionResolver } from './announcement_permission.resolver.js'
import type { AnnouncementDeckDto, AnnouncementDeckSlideDto } from './dto/announcement_slide.dto.js'

type SlideCandidate = DeckCandidate & { slide: AnnouncementSlide }

/**
 * Deck de anuncios del usuario autenticado (`GET /api/announcements/me/deck`).
 *
 * Orquesta: marca del usuario + slides publicados + permisos concedidos → la
 * selección pura de `domain/deck_selection.ts`. Solo resuelve los permisos que
 * aparecen en slides publicados, y solo firma los banners de lo seleccionado.
 *
 * Aislamiento: el usuario sale siempre de la sesión (anti-IDOR). Los slides son
 * globales de plataforma; la marca es personal: sin business scope.
 */
export default class AnnouncementDeckService {
  constructor(
    private readonly slides: AnnouncementSlideRepository = new AnnouncementSlideRepositoryMysql(),
    private readonly state: AnnouncementStateRepository = new AnnouncementStateRepositoryMysql(),
    private readonly permissions: AnnouncementPermissionResolver = new AnnouncementPermissionResolverGate(),
    private readonly bannerStorage: AnnouncementBannerStorage = new AnnouncementBannerStorageS3()
  ) {}

  async getDeck(user: User): Promise<AnnouncementDeckDto> {
    const [published, lastSeenAt] = await Promise.all([
      this.slides.listPublished(),
      this.state.findLastSeenByUser(user.userId),
    ])

    const candidates = published.map(toCandidate)
    const granted = await this.permissions.grantedKeys(user, publishedPermissionKeys(candidates))
    const selected = selectDeckSlides(candidates, lastSeenAt, granted)

    return {
      slides: await Promise.all(selected.map(({ slide }) => this.toDeckSlide(slide))),
      latestPublishedAt: toIsoUtc(latestPublishedAt(candidates)),
      lastSeenAt: toIsoUtc(lastSeenAt),
    }
  }

  private async toDeckSlide(slide: AnnouncementSlide): Promise<AnnouncementDeckSlideDto> {
    return {
      id: slide.announcementSlideId,
      type: slide.announcementSlideType,
      title: slide.announcementSlideTitle,
      bodyHtml: slide.announcementSlideBodyHtml,
      bannerUrl: slide.announcementSlideBannerPath
        ? await this.bannerStorage.signedUrl(slide.announcementSlideBannerPath)
        : null,
    }
  }
}

function toCandidate(slide: AnnouncementSlide): SlideCandidate {
  return {
    id: slide.announcementSlideId,
    type: slide.announcementSlideType,
    sortOrder: slide.announcementSlideSortOrder,
    status: slide.announcementSlideStatus,
    publishedAt: slide.announcementSlidePublishedAt,
    permissionKey: slide.announcementSlidePermissionKey,
    slide,
  }
}
