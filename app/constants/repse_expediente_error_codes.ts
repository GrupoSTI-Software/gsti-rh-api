/**
 * Catálogo estable de códigos de error del expediente documental REPSE.
 */
export const REPSE_EXPEDIENTE_ERROR_CODES = {
  /** Validación VineJS o input fuera de rango */
  VAL_INPUT: 'REXP.VAL.001',
  /** Archivo no PDF, tamaño excedido o fallo de almacenamiento */
  VAL_DOCUMENTO: 'REXP.VAL.DOC.001',
  /** Documento o proveedor inexistente o ajeno al tenant */
  NOT_FOUND: 'REXP.NF.001',
  /** Error al subir a S3 */
  S3_UPLOAD_FAILED: 'REXP.S3.001',
  /** Sin permiso sobre el módulo */
  FORBIDDEN: 'REXP.FORBID.001',
  /** Borrado bloqueado por retención vigente */
  FORBIDDEN_RETENTION: 'REXP.FORBID.RET.001',
  /** Error no clasificado del dominio */
  SYS_UNHANDLED: 'REXP.SYS.001',
} as const

export type RepseExpedienteErrorCode =
  (typeof REPSE_EXPEDIENTE_ERROR_CODES)[keyof typeof REPSE_EXPEDIENTE_ERROR_CODES]
