/**
 * Catálogo ÚNICO de códigos de error de escritura de datos sensibles
 * (cadena CAP-06-01-09, tramo API, orden 32 / USRH1787204602831;
 * IMPORT_FORBIDDEN: orden 34 / USRH1787433076990).
 *
 * Convención: `EMP.SENS.WRITE.<SEMANTICO>` en SCREAMING_SNAKE, sin numeración.
 * Archivo propio: no mezclar con `EMP.SENS.READ.*`.
 */
export const SENSITIVE_DATA_WRITE_ERROR_CODES = {
  /** Transición real de un dato sensible sin el permiso de su categoría — 403. */
  FORBIDDEN: 'EMP.SENS.WRITE.FORBIDDEN',
  /** El motor no pudo determinar el permiso; fail-closed — 403. */
  UNRESOLVED: 'EMP.SENS.WRITE.UNRESOLVED',
  /** Archivo Excel con columnas sensibles sin permiso de escritura — 403, rechazo total. */
  IMPORT_FORBIDDEN: 'EMP.SENS.WRITE.IMPORT_FORBIDDEN',
} as const

export type SensitiveDataWriteErrorCode =
  (typeof SENSITIVE_DATA_WRITE_ERROR_CODES)[keyof typeof SENSITIVE_DATA_WRITE_ERROR_CODES]
