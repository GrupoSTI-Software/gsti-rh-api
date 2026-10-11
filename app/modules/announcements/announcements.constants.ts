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
  INVALID_INPUT: 'datos-invalidos',
  SLIDE_NOT_FOUND: 'slide-inexistente',
  INVALID_PERMISSION_KEY: 'permiso-inexistente',
} as const

export type AnnouncementsErrorKey =
  (typeof ANNOUNCEMENTS_ERROR_KEYS)[keyof typeof ANNOUNCEMENTS_ERROR_KEYS]

/** Tipos de slide del deck: bienvenida (primer ingreso) y novedades (tras la marca). */
export const ANNOUNCEMENT_SLIDE_TYPES = ['onboarding', 'feature'] as const
export type AnnouncementSlideType = (typeof ANNOUNCEMENT_SLIDE_TYPES)[number]

/** Ciclo de vida de un slide. Nada se borra: retirar un slide es archivarlo. */
export const ANNOUNCEMENT_SLIDE_STATUSES = ['draft', 'published', 'archived'] as const
export type AnnouncementSlideStatus = (typeof ANNOUNCEMENT_SLIDE_STATUSES)[number]

/** Largo máximo del título; coincide con la columna `announcement_slide_title`. */
export const ANNOUNCEMENT_SLIDE_TITLE_MAX_LENGTH = 120

/** Largo máximo del HTML del cuerpo antes de sanear (64 KB: un slide es texto corto). */
export const ANNOUNCEMENT_SLIDE_BODY_MAX_LENGTH = 65_535

/**
 * Tope de slides por deck. Si pasan, se conservan los más recientes (novedades)
 * o los primeros por orden (bienvenida): un overlay de más de cinco pasos se cierra
 * sin leerse.
 */
export const ANNOUNCEMENT_DECK_MAX_SLIDES = 5

/**
 * Vigencia, en segundos, de la URL firmada del banner. Mismo valor que las firmas
 * de vacaciones (`vacation_day_feed.service.ts`): el BO pinta el deck al cargar,
 * y una hora cubre la sesión en la que se muestra sin dejar enlaces de larga vida.
 */
export const ANNOUNCEMENT_BANNER_URL_TTL_SECONDS = 60 * 60

/** Carpeta lógica de los banners bajo `{AWS_ROOT_PATH}/`. */
export const ANNOUNCEMENT_BANNER_FOLDER = 'announcement-slides'
