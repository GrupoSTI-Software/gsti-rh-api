import { ANNOUNCEMENTS_ERROR_KEYS, type AnnouncementsErrorKey } from './announcements.constants.js'

/**
 * Error de dominio de la marca de anuncios. Lleva el status HTTP, la key semántica
 * y el prefijo i18n (`<prefijo>_title` / `<prefijo>_detail` en `resources/langs/*.json`);
 * el texto en español es el respaldo si falta la traducción.
 */
export class AnnouncementsError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly key: AnnouncementsErrorKey,
    readonly i18nPrefix: string,
    readonly fallbackTitle: string,
    readonly fallbackDetail: string
  ) {
    super(fallbackDetail)
    this.name = 'AnnouncementsError'
  }

  /** `lastSeenAt` está más allá de la tolerancia de reloj permitida. */
  static futureDate(): AnnouncementsError {
    return new AnnouncementsError(
      422,
      ANNOUNCEMENTS_ERROR_KEYS.FUTURE_DATE,
      'announcements_future_date',
      'Fecha en el futuro',
      'La fecha del último anuncio visto no puede estar en el futuro.'
    )
  }

  /** El slide no existe. */
  static slideNotFound(): AnnouncementsError {
    return new AnnouncementsError(
      404,
      ANNOUNCEMENTS_ERROR_KEYS.SLIDE_NOT_FOUND,
      'announcements_slide_not_found',
      'Slide no encontrado',
      'El slide de anuncios solicitado no existe.'
    )
  }

  /** `permissionKey` no apunta a un permiso declarado del catálogo. */
  static invalidPermissionKey(): AnnouncementsError {
    return new AnnouncementsError(
      422,
      ANNOUNCEMENTS_ERROR_KEYS.INVALID_PERMISSION_KEY,
      'announcements_invalid_permission_key',
      'Permiso inexistente',
      'La clave de permiso debe tener la forma módulo:permiso y existir en el catálogo de módulos.'
    )
  }

  /** El cuerpo quedó vacío después de sanear el HTML. */
  static emptyBody(): AnnouncementsError {
    return new AnnouncementsError(
      422,
      ANNOUNCEMENTS_ERROR_KEYS.EMPTY_BODY,
      'announcements_empty_body',
      'Cuerpo vacío',
      'El cuerpo del slide no tiene contenido permitido después de sanear el HTML.'
    )
  }
}
