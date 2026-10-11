import db from '@adonisjs/lucid/services/db'
import AnnouncementSlide from '#models/announcement_slide'
import type {
  AnnouncementSlideContent,
  AnnouncementSlideFilters,
  AnnouncementSlideRepository,
} from './announcement_slide.repository.js'

/** Columnas físicas de cada campo editable (prefijo de la tabla). */
const CONTENT_COLUMNS: Readonly<Record<keyof AnnouncementSlideContent, string>> = {
  type: 'announcement_slide_type',
  sortOrder: 'announcement_slide_sort_order',
  title: 'announcement_slide_title',
  bodyHtml: 'announcement_slide_body_html',
  permissionKey: 'announcement_slide_permission_key',
}

/**
 * Implementación Lucid/MySQL de los slides del deck.
 *
 * Las escrituras de estado van con knex y `Date` de JS en lugar de `model.save()`:
 * Lucid serializa `DateTime` al segundo y `announcement_slide_published_at` guarda
 * milisegundos (misma razón que `announcement_state.repository.mysql.ts`).
 */
export default class AnnouncementSlideRepositoryMysql implements AnnouncementSlideRepository {
  async list(filters: AnnouncementSlideFilters): Promise<AnnouncementSlide[]> {
    const query = AnnouncementSlide.query()
    if (filters.type) query.where('announcement_slide_type', filters.type)
    if (filters.status) query.where('announcement_slide_status', filters.status)
    return query
      .orderBy('announcement_slide_type', 'asc')
      .orderBy('announcement_slide_sort_order', 'asc')
      .orderBy('announcement_slide_id', 'asc')
  }

  async findById(slideId: number): Promise<AnnouncementSlide | null> {
    return AnnouncementSlide.find(slideId)
  }

  async listPublished(): Promise<AnnouncementSlide[]> {
    return AnnouncementSlide.query().where('announcement_slide_status', 'published')
  }

  async createDraft(content: AnnouncementSlideContent): Promise<AnnouncementSlide> {
    return AnnouncementSlide.create({
      announcementSlideType: content.type,
      announcementSlideSortOrder: content.sortOrder,
      announcementSlideTitle: content.title,
      announcementSlideBodyHtml: content.bodyHtml,
      announcementSlidePermissionKey: content.permissionKey,
      announcementSlideStatus: 'draft',
      announcementSlidePublishedAt: null,
      announcementSlideBannerPath: null,
    })
  }

  async updateContent(
    slideId: number,
    content: Partial<AnnouncementSlideContent>
  ): Promise<AnnouncementSlide | null> {
    const changes: Record<string, string | number | null> = {}
    for (const field of Object.keys(CONTENT_COLUMNS) as Array<keyof AnnouncementSlideContent>) {
      const value = content[field]
      if (value !== undefined) changes[CONTENT_COLUMNS[field]] = value
    }
    return this.updateColumns(slideId, changes)
  }

  async publish(slideId: number): Promise<AnnouncementSlide | null> {
    return this.updateColumns(slideId, {
      announcement_slide_status: 'published',
      announcement_slide_published_at: db.knexRawQuery(
        'COALESCE(announcement_slide_published_at, ?)',
        [new Date()]
      ),
    })
  }

  async archive(slideId: number): Promise<AnnouncementSlide | null> {
    return this.updateColumns(slideId, { announcement_slide_status: 'archived' })
  }

  async setBannerPath(slideId: number, bannerPath: string): Promise<AnnouncementSlide | null> {
    return this.updateColumns(slideId, { announcement_slide_banner_path: bannerPath })
  }

  /** Actualiza columnas por id, siempre con `updated_at`, y devuelve la fila vigente. */
  private async updateColumns(
    slideId: number,
    changes: Record<string, unknown>
  ): Promise<AnnouncementSlide | null> {
    const existing = await this.findById(slideId)
    if (!existing) return null

    await db
      .knexQuery()
      .table(AnnouncementSlide.table)
      .where('announcement_slide_id', slideId)
      .update({ ...changes, announcement_slide_updated_at: new Date() })

    return this.findById(slideId)
  }
}
