/**
 * Reglas fijas de la marca de anuncios por usuario (`/api/announcements/me`).
 */

/**
 * Tolerancia de reloj, en minutos, para `lastSeenAt` en el futuro. Absorbe el
 * desfase entre el reloj del navegador y el del servidor; más allá de eso la fecha
 * se rechaza, porque una marca adelantada ocultaría anuncios que aún no existen.
 */
export const ANNOUNCEMENTS_FUTURE_TOLERANCE_MINUTES = 5

/** Keys semánticas de error del módulo (contrato título/detalle/key). */
export const ANNOUNCEMENTS_ERROR_KEYS = {
  INVALID_DATE: 'fecha-invalida',
  FUTURE_DATE: 'fecha-en-el-futuro',
  UNEXPECTED: 'error-inesperado',
} as const

export type AnnouncementsErrorKey =
  (typeof ANNOUNCEMENTS_ERROR_KEYS)[keyof typeof ANNOUNCEMENTS_ERROR_KEYS]
