/**
 * Catalogo estable de códigos de rechazo de la entrada de archivos.
 * Transversal: lo comparten todos los modulos que suben archivos.
 */
export const FILE_INTAKE_ERROR_CODES = {
  /** No llego archivo o llego sin ruta temporal. */
  FILE_MISSING: 'FILE.VAL.001',
  /** Alguna extensión del nombre esta en la blocklist (incluye doble extensión). */
  EXTENSION_BLOCKED: 'FILE.VAL.002',
  /** La extensión final no pertenece al perfil. */
  EXTENSION_NOT_ALLOWED: 'FILE.VAL.003',
  /** El contenido real no corresponde a ningún formato que el perfil acepte. */
  CONTENT_TYPE_INVALID: 'FILE.VAL.004',
  /** Excede el tope del perfil. */
  FILE_TOO_LARGE: 'FILE.VAL.005',
  /** El archivo esta corrupto o la transformación no pudo completarse. */
  SANITIZATION_FAILED: 'FILE.VAL.006',
  /** Error no clasificado de la entrada de archivos. */
  SYS_UNHANDLED: 'FILE.SYS.001',
} as const

export type FileIntakeErrorCode =
  (typeof FILE_INTAKE_ERROR_CODES)[keyof typeof FILE_INTAKE_ERROR_CODES]
