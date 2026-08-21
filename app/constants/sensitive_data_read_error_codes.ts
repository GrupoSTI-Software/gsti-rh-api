/**
 * Catálogo ÚNICO de códigos de error de lectura de datos sensibles
 * (cadena CAP-06-01-09, tramo API). Lo crea "Decidir con el permiso de
 * categoría las columnas ya enmascaradas" (USRH1787204602825) y lo
 * extienden las hermanas — USRH1787204602828 agrega las dos constantes
 * que sí se emiten; no se declaran aquí para no dejar constantes muertas.
 *
 * Convención vigente para toda la cadena: `EMP.SENS.READ.<SEMANTICO>` en
 * SCREAMING_SNAKE, sin numeración (estilo `employee_offboarding_error_codes.ts`).
 * El BO ramifica su UI por `key`; estos códigos quedan para trazabilidad.
 *
 * `key` = slug del título en kebab-case español.
 */
export const SENSITIVE_DATA_READ_ERROR_CODES = {
  /** Columna clasificada pero fuera del registry de PiiRevealService — 422. */
  NOT_REVEALABLE: 'EMP.SENS.READ.NOT_REVEALABLE',
  /** Par modelo/columna ausente del catálogo de campos sensibles — 422. */
  NOT_CLASSIFIED: 'EMP.SENS.READ.NOT_CLASSIFIED',
} as const

export type SensitiveDataReadErrorCode =
  (typeof SENSITIVE_DATA_READ_ERROR_CODES)[keyof typeof SENSITIVE_DATA_READ_ERROR_CODES]
