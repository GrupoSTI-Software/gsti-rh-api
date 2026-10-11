import type { AnnouncementSlideStatus, AnnouncementSlideType } from '../announcements.constants.js'

/**
 * Slide tal como lo administra la consola de plataforma
 * (`/api/platform/announcement-slides`). Fechas en ISO 8601 UTC con milisegundos.
 * `bannerUrl` es la URL firmada para previsualizar el banner (misma vigencia que
 * en el deck); `bannerPath` es la llave del objeto.
 */
export interface AnnouncementSlideAdminDto {
  id: number
  type: AnnouncementSlideType
  sortOrder: number
  status: AnnouncementSlideStatus
  publishedAt: string | null
  title: string
  bodyHtml: string
  bannerPath: string | null
  bannerUrl: string | null
  permissionKey: string | null
  createdAt: string | null
  updatedAt: string | null
}

/** Slide del deck que pinta el Backoffice. */
export interface AnnouncementDeckSlideDto {
  id: number
  type: AnnouncementSlideType
  title: string
  bodyHtml: string
  /** URL firmada de lectura, lista para `<img src>`; `null` si el slide no tiene banner. */
  bannerUrl: string | null
}

/**
 * Respuesta de `GET /api/announcements/me/deck`.
 *
 * - `slides`: lo que le toca ver al usuario (ver `domain/deck_selection.ts`).
 * - `latestPublishedAt`: máximo `published_at` de TODOS los slides publicados, sin
 *   filtrar por tipo ni permiso. El BO la manda en el PUT al cerrar.
 * - `lastSeenAt`: marca vigente del usuario (misma forma que `GET /me`). Con ella el
 *   BO decide si avanza la marca cuando no le tocó ningún slide.
 */
export interface AnnouncementDeckDto {
  slides: AnnouncementDeckSlideDto[]
  latestPublishedAt: string | null
  lastSeenAt: string | null
}
