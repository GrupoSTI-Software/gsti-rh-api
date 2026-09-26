/**
 * Catálogo estable de códigos de error del módulo de evidencias de reporte
 * de evento traumático (formato MOD.TYPE.NNN).
 *
 * Este módulo nace exponiendo el campo `code` (no `errorCode`).
 */
export const TERE_ERROR_CODES = {
  /** Error de validación VineJS o input fuera de rango */
  VAL_INPUT: 'TERE.VAL.001',
  /** Archivo ausente, vacío o con formato distinto a PDF/JPG/PNG */
  INVALID_FILE_TYPE: 'TERE.VAL.FILE.001',
  /** Archivo excede el tamaño máximo (10 MB) */
  FILE_TOO_LARGE: 'TERE.VAL.FILE.002',
  /** Categoría fuera del set permitido */
  VAL_CATEGORY: 'TERE.VAL.CAT.001',
  /** Evidencia inexistente o ajena al reporte indicado */
  EVIDENCE_NOT_FOUND: 'TERE.NF.EVID.001',
  /** Fallo al subir o firmar URL contra S3 */
  S3_OPERATION_FAILED: 'TERE.S3.001',
  /** Sin permisos sobre el módulo */
  FORBIDDEN: 'TERE.FORBID.001',
  /** Error no clasificado del dominio */
  SYS_UNHANDLED: 'TERE.SYS.001',
} as const

export type TereErrorCode = (typeof TERE_ERROR_CODES)[keyof typeof TERE_ERROR_CODES]
