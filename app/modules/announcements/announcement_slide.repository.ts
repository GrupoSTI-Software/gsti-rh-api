import type AnnouncementSlide from '#models/announcement_slide'
import type { AnnouncementSlideStatus, AnnouncementSlideType } from './announcements.constants.js'

export interface AnnouncementSlideFilters {
  type?: AnnouncementSlideType
  status?: AnnouncementSlideStatus
}

/** Campos que la consola edita. El HTML llega ya saneado y la clave ya validada. */
export interface AnnouncementSlideContent {
  type: AnnouncementSlideType
  sortOrder: number
  title: string
  bodyHtml: string
  permissionKey: string | null
}

/** Puerto de acceso a los slides del deck de anuncios. */
export interface AnnouncementSlideRepository {
  /** Listado de la consola, por tipo, orden e id. */
  list(filters: AnnouncementSlideFilters): Promise<AnnouncementSlide[]>

  findById(slideId: number): Promise<AnnouncementSlide | null>

  /** Todos los slides publicados (insumo del deck y de `latestPublishedAt`). */
  listPublished(): Promise<AnnouncementSlide[]>

  /** Crea el slide en borrador, sin fecha de publicación ni banner. */
  createDraft(content: AnnouncementSlideContent): Promise<AnnouncementSlide>

  /** Edita el contenido sin tocar estado ni fecha de publicación. `null` si no existe. */
  updateContent(
    slideId: number,
    content: Partial<AnnouncementSlideContent>
  ): Promise<AnnouncementSlide | null>

  /**
   * Publica en una sola sentencia: `status = published` y `published_at = now` solo si
   * era `null`. `null` si no existe.
   */
  publish(slideId: number): Promise<AnnouncementSlide | null>

  /** `status = archived`; la fecha de publicación se conserva. `null` si no existe. */
  archive(slideId: number): Promise<AnnouncementSlide | null>

  /** Guarda la llave del banner. `null` si no existe. */
  setBannerPath(slideId: number, bannerPath: string): Promise<AnnouncementSlide | null>
}
