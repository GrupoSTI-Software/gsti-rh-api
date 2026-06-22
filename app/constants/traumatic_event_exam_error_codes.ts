/**
 * Catálogo estable de códigos de error del módulo de resultados de examen de
 * evento traumático (formato MOD.TYPE.NNN).
 *
 * El módulo nace exponiendo el campo `code` (el hermano del reporte aún usa
 * `errorCode`; su homologación queda fuera de esta HU).
 */
export const TEX_ERROR_CODES = {
  /** Error de validación VineJS o input fuera de rango */
  VAL_INPUT: 'TEX.VAL.001',
  /** Fecha de examen anterior a la ocurrencia del evento */
  DATE_BEFORE_EVENT: 'TEX.VAL.DATE.001',
  /** Fecha de examen futura */
  DATE_FUTURE: 'TEX.VAL.DATE.002',
  /** Examen inexistente o ajeno al reporte */
  EXAM_NOT_FOUND: 'TEX.NF.EXAM.001',
  /** Sin permisos sobre el módulo */
  FORBIDDEN: 'TEX.FORBID.001',
  /** Error no clasificado del dominio */
  SYS_UNHANDLED: 'TEX.SYS.001',
} as const

export type TexErrorCode = (typeof TEX_ERROR_CODES)[keyof typeof TEX_ERROR_CODES]
