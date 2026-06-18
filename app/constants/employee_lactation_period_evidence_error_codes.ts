/**
 * Catálogo estable de códigos de error del módulo de evidencias de periodo de
 * lactancia. Los códigos son estables y los clientes pueden reaccionar a ellos
 * de forma programática sin parsear mensajes localizados.
 */
export const ELPE_ERROR_CODES = {
  /** Error de validación VineJS o input fuera de rango */
  VAL_INPUT: 'ELPE.VAL.001',
  /** Categoría fuera del set 'agreement' | 'birth_support' | 'other' */
  VAL_CATEGORY: 'ELPE.VAL.CAT.001',
  /** Identificador en la URL inválido */
  VAL_ID: 'ELPE.VAL.ID.001',
  /** Archivo ausente, vacío o con formato distinto a PDF */
  INVALID_FILE_TYPE: 'ELPE.VAL.FILE.001',
  /** Archivo excede el tamaño máximo (10 MB) */
  FILE_TOO_LARGE: 'ELPE.VAL.FILE.002',
  /** Periodo inexistente o ajeno a la empresa del usuario */
  PERIOD_NOT_FOUND: 'ELPE.NF.PERIOD.001',
  /** Evidencia inexistente o ajena al periodo indicado */
  EVIDENCE_NOT_FOUND: 'ELPE.NF.EVID.001',
  /** Fallo al subir o firmar URL contra S3 */
  S3_OPERATION_FAILED: 'ELPE.S3.001',
  /** Sin permisos sobre el módulo */
  FORBIDDEN: 'ELPE.FORBID.001',
  /** Error no clasificado del dominio */
  SYS_UNHANDLED: 'ELPE.SYS.001',
} as const

export type ElpeErrorCode = (typeof ELPE_ERROR_CODES)[keyof typeof ELPE_ERROR_CODES]
