/**
 * Respuesta de GET y PUT /api/announcements/me.
 *
 * - `lastSeenAt`: ISO 8601 en UTC del último anuncio que el usuario vio en el
 *   Backoffice; `null` si nunca ha registrado ninguno.
 */
export interface AnnouncementStateDto {
  lastSeenAt: string | null
}
