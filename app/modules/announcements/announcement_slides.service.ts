import type AnnouncementSlide from '#models/announcement_slide'
import type { IncomingFile } from '#services/file_intake_service'
import { AnnouncementsError } from './announcements.error.js'
import AnnouncementSlideRepositoryMysql from './announcement_slide.repository.mysql.js'
import AnnouncementBannerStorageS3 from './announcement_banner.storage.s3.js'
import { sanitizeAnnouncementSlideHtml } from './domain/announcement_slide_html.js'
import { isDeclaredPermissionKey } from './domain/permission_key.js'
import { toIsoUtc } from './domain/iso_date.js'
import type {
  AnnouncementSlideContent,
  AnnouncementSlideFilters,
  AnnouncementSlideRepository,
} from './announcement_slide.repository.js'
import type { AnnouncementBannerStorage } from './announcement_banner.storage.js'
import type { AnnouncementSlideAdminDto } from './dto/announcement_slide.dto.js'

export type CreateAnnouncementSlideInput = AnnouncementSlideContent
export type UpdateAnnouncementSlideInput = Partial<AnnouncementSlideContent>

/**
 * Administración de los slides del deck desde la consola de plataforma.
 *
 * Reglas de negocio:
 *  - Se crea siempre en borrador; nada se borra (retirar es archivar).
 *  - El HTML del cuerpo se sanea al guardar; si no queda contenido, 422.
 *  - `permissionKey` debe existir en el catálogo de módulos; si no, 422.
 *  - Editar un slide publicado está permitido y no cambia `publishedAt`.
 *  - Publicar fija `publishedAt` solo la primera vez; republicar un archivado
 *    conserva la fecha original.
 */
export default class AnnouncementSlidesService {
  constructor(
    private readonly repository: AnnouncementSlideRepository = new AnnouncementSlideRepositoryMysql(),
    private readonly bannerStorage: AnnouncementBannerStorage = new AnnouncementBannerStorageS3()
  ) {}

  async list(filters: AnnouncementSlideFilters): Promise<AnnouncementSlideAdminDto[]> {
    const slides = await this.repository.list(filters)
    return Promise.all(slides.map((slide) => this.toAdminDto(slide)))
  }

  async getById(slideId: number): Promise<AnnouncementSlideAdminDto> {
    return this.toAdminDto(this.found(await this.repository.findById(slideId)))
  }

  async create(input: CreateAnnouncementSlideInput): Promise<AnnouncementSlideAdminDto> {
    const content = this.normalize(input)
    return this.toAdminDto(await this.repository.createDraft({ ...input, ...content }))
  }

  async update(
    slideId: number,
    input: UpdateAnnouncementSlideInput
  ): Promise<AnnouncementSlideAdminDto> {
    const content = this.normalize(input)
    const slide = await this.repository.updateContent(slideId, { ...input, ...content })
    return this.toAdminDto(this.found(slide))
  }

  async publish(slideId: number): Promise<AnnouncementSlideAdminDto> {
    return this.toAdminDto(this.found(await this.repository.publish(slideId)))
  }

  async archive(slideId: number): Promise<AnnouncementSlideAdminDto> {
    return this.toAdminDto(this.found(await this.repository.archive(slideId)))
  }

  /**
   * Sube el banner y guarda su llave. Se verifica el slide antes de subir para no
   * dejar objetos huérfanos por un id inexistente. El banner anterior no se borra.
   */
  async uploadBanner(
    slideId: number,
    file: IncomingFile | null
  ): Promise<AnnouncementSlideAdminDto> {
    this.found(await this.repository.findById(slideId))
    const bannerPath = await this.bannerStorage.upload(file)
    return this.toAdminDto(this.found(await this.repository.setBannerPath(slideId, bannerPath)))
  }

  /**
   * Sanea el cuerpo y valida la clave de permiso de lo que venga en el input. Una
   * clave vacía equivale a "sin permiso" (`null`).
   */
  private normalize(
    input: Partial<AnnouncementSlideContent>
  ): Pick<Partial<AnnouncementSlideContent>, 'bodyHtml' | 'permissionKey'> {
    const normalized: Pick<Partial<AnnouncementSlideContent>, 'bodyHtml' | 'permissionKey'> = {}

    if (input.permissionKey !== undefined) {
      const permissionKey = input.permissionKey || null
      if (permissionKey !== null && !isDeclaredPermissionKey(permissionKey)) {
        throw AnnouncementsError.invalidPermissionKey()
      }
      normalized.permissionKey = permissionKey
    }

    if (input.bodyHtml !== undefined) {
      const bodyHtml = sanitizeAnnouncementSlideHtml(input.bodyHtml)
      if (!bodyHtml) throw AnnouncementsError.emptyBody()
      normalized.bodyHtml = bodyHtml
    }

    return normalized
  }

  private found(slide: AnnouncementSlide | null): AnnouncementSlide {
    if (!slide) throw AnnouncementsError.slideNotFound()
    return slide
  }

  private async toAdminDto(slide: AnnouncementSlide): Promise<AnnouncementSlideAdminDto> {
    return {
      id: slide.announcementSlideId,
      type: slide.announcementSlideType,
      sortOrder: slide.announcementSlideSortOrder,
      status: slide.announcementSlideStatus,
      publishedAt: toIsoUtc(slide.announcementSlidePublishedAt),
      title: slide.announcementSlideTitle,
      bodyHtml: slide.announcementSlideBodyHtml,
      bannerPath: slide.announcementSlideBannerPath,
      bannerUrl: slide.announcementSlideBannerPath
        ? await this.bannerStorage.signedUrl(slide.announcementSlideBannerPath)
        : null,
      permissionKey: slide.announcementSlidePermissionKey,
      createdAt: toIsoUtc(slide.announcementSlideCreatedAt),
      updatedAt: toIsoUtc(slide.announcementSlideUpdatedAt),
    }
  }
}
