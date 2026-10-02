import {
  EXPIRATION_MATRIX_ERROR_KEYS,
  type ExpirationMatrixErrorKey,
} from './documents_expiration_matrix.constants.js'

/**
 * Error de dominio de la Matriz de vencimientos. Lleva el status HTTP, la key
 * semántica y el prefijo i18n (`<prefijo>_title` / `<prefijo>_detail` en
 * `resources/langs/*.json`); el texto en español es el respaldo si falta la
 * traducción.
 */
export class ExpirationMatrixError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly key: ExpirationMatrixErrorKey,
    readonly i18nPrefix: string,
    readonly fallbackTitle: string,
    readonly fallbackDetail: string
  ) {
    super(fallbackDetail)
    this.name = 'ExpirationMatrixError'
  }

  /** La llave no existe, no es visible para la sesión o salió de la ventana. */
  static itemNotFound(): ExpirationMatrixError {
    return new ExpirationMatrixError(
      404,
      EXPIRATION_MATRIX_ERROR_KEYS.ITEM_NOT_FOUND,
      'expiration_matrix_item_not_found',
      'Vencimiento no encontrado',
      'El vencimiento no existe o no está disponible para tu cuenta.'
    )
  }

  /** El vencimiento existe pero no tiene archivo (o no está en el almacenamiento). */
  static fileNotFound(): ExpirationMatrixError {
    return new ExpirationMatrixError(
      404,
      EXPIRATION_MATRIX_ERROR_KEYS.FILE_NOT_FOUND,
      'expiration_matrix_file_not_found',
      'Archivo no encontrado',
      'El vencimiento no tiene un archivo disponible.'
    )
  }

  /** La sesión ve el vencimiento pero no puede descargar archivos de su fuente. */
  static downloadForbidden(): ExpirationMatrixError {
    return new ExpirationMatrixError(
      403,
      EXPIRATION_MATRIX_ERROR_KEYS.DOWNLOAD_FORBIDDEN,
      'expiration_matrix_download_forbidden',
      'Sin permiso de descarga',
      'Tu rol no permite abrir los archivos de este tipo de vencimiento.'
    )
  }
}
