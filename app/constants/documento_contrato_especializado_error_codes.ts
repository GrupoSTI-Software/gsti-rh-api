/**
 * Catálogo estable de códigos de error del módulo de documentos
 * firmados de contratos de servicios especializados REPSE.
 */
export const DOCUMENTO_CONTRATO_ESPECIALIZADO_ERROR_CODES = {
  /** Validación VineJS o input fuera de rango */
  VAL_INPUT: 'DCE.VAL.001',
  /** Fechas de vigencia incoherentes (inicio posterior a vencimiento) */
  VAL_VIGENCIA: 'DCE.VAL.VIGENCIA.001',
  /** Archivo no PDF, tamaño excedido o fallo de almacenamiento */
  VAL_DOCUMENTO: 'DCE.VAL.DOC.001',
  /** Documento vigente inexistente para descarga */
  NOT_FOUND: 'DCE.NF.001',
  /** Error al subir a S3 */
  S3_UPLOAD_FAILED: 'DCE.S3.001',
  /** Sin permiso sobre el módulo */
  FORBIDDEN: 'DCE.FORBID.001',
  /** Error no clasificado del dominio */
  SYS_UNHANDLED: 'DCE.SYS.001',
} as const

export type DocumentoContratoEspecializadoErrorCode =
  (typeof DOCUMENTO_CONTRATO_ESPECIALIZADO_ERROR_CODES)[keyof typeof DOCUMENTO_CONTRATO_ESPECIALIZADO_ERROR_CODES]
