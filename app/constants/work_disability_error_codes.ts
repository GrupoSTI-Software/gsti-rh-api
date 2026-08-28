/**
 * Códigos de error del dominio de incapacidades laborales.
 * USRH1784259058487 — 404 uniforme fuera de alcance (anti-IDOR).
 * USRH1787434050259 — validación de archivo y descarga privada.
 */
export const WORK_DISABILITY_ERROR_CODES = {
  NOT_FOUND: 'WD.NF.001',
  /** Archivo ausente o con formato/extensión no permitida. */
  INVALID_FILE: 'WD.VAL.FILE.001',
  /** Archivo excede el tamaño máximo permitido (10 MB). */
  FILE_TOO_LARGE: 'WD.VAL.FILE.002',
  /** Registrado en BD pero no encontrado en el almacenamiento (S3). */
  FILE_NOT_IN_STORAGE: 'WD.NF.FILE.001',
} as const
