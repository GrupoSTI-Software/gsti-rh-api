/**
 * Catálogo ÚNICO de códigos de error de escritura de datos sensibles
 * (cadena CAP-06-01-09, tramo API, orden 32 / USRH1787204602831).
 *
 * Convención: `EMP.SENS.WRITE.<SEMANTICO>` en SCREAMING_SNAKE, sin numeración.
 * Archivo propio: no mezclar con `EMP.SENS.READ.*`.
 * `EMP.SENS.WRITE.IMPORT_FORBIDDEN` lo agrega la orden 33; no se declara aquí.
 */
export const SENSITIVE_DATA_WRITE_ERROR_CODES = {
  /** Transición real de un dato sensible sin el permiso de su categoría — 403. */
  FORBIDDEN: 'EMP.SENS.WRITE.FORBIDDEN',
  /** El motor no pudo determinar el permiso; fail-closed — 403. */
  UNRESOLVED: 'EMP.SENS.WRITE.UNRESOLVED',
} as const

export type SensitiveDataWriteErrorCode =
  (typeof SENSITIVE_DATA_WRITE_ERROR_CODES)[keyof typeof SENSITIVE_DATA_WRITE_ERROR_CODES]
