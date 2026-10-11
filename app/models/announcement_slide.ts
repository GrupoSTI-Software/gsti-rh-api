import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import type {
  AnnouncementSlideStatus,
  AnnouncementSlideType,
} from '#modules/announcements/announcements.constants'

/**
 * Slide del deck de anuncios del Backoffice (bienvenida y novedades).
 *
 * Catálogo global de plataforma: no lleva `business_unit_id` ni mixin de tenant,
 * igual que `LegalDocument`. Solo español. `announcementSlidePublishedAt` la fija
 * el API al publicar por primera vez y no vuelve a cambiar; `announcementSlideBodyHtml`
 * llega ya saneado; `announcementSlideBannerPath` es la llave privada en S3.
 */
export default class AnnouncementSlide extends BaseModel {
  static table = 'announcement_slides'

  @column({ isPrimary: true })
  declare announcementSlideId: number

  @column()
  declare announcementSlideType: AnnouncementSlideType

  @column()
  declare announcementSlideSortOrder: number

  @column()
  declare announcementSlideStatus: AnnouncementSlideStatus

  @column.dateTime()
  declare announcementSlidePublishedAt: DateTime | null

  @column()
  declare announcementSlideTitle: string

  @column()
  declare announcementSlideBodyHtml: string

  @column()
  declare announcementSlideBannerPath: string | null

  @column()
  declare announcementSlidePermissionKey: string | null

  @column.dateTime({ autoCreate: true })
  declare announcementSlideCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare announcementSlideUpdatedAt: DateTime | null
}
