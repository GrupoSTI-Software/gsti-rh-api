export const EC_ERROR_CODES = {
  /** Vine / parámetro inválido */
  VAL_INPUT: 'EC.VAL.001',
  /** Empleado inexistente o dado de baja */
  EMPLOYEE_NOT_FOUND: 'EC.NF.EMP.001',
  /** Certificación inexistente en el catálogo */
  CERTIFICATION_NOT_FOUND: 'EC.NF.CERT.001',
  /** Cumplimiento específico no encontrado o no pertenece al par empleado/certificación */
  UPLOAD_NOT_FOUND: 'EC.NF.UPL.001',
  /** Tipo de archivo no permitido (solo PDF, JPG, JPEG, PNG) */
  INVALID_FILE_TYPE: 'EC.VAL.FILE.001',
  /** Archivo supera el tamaño máximo de 10 MB */
  FILE_TOO_LARGE: 'EC.VAL.FILE.002',
  /** Fecha de cumplimiento es futura */
  FUTURE_DATE: 'EC.VAL.DATE.001',
  /** Solo se puede borrar el cumplimiento más reciente */
  DELETE_NOT_LATEST: 'EC.FORBID.001',
  /** Certificación no aplicable a la BU del puesto del empleado */
  CERTIFICATION_NOT_APPLICABLE: 'EC.UNAP.001',
  /** Error al subir a S3 */
  S3_UPLOAD_FAILED: 'EC.S3.001',
  /** Error no clasificado del dominio */
  SYS_UNHANDLED: 'EC.SYS.001',
} as const

export type EcErrorCode = (typeof EC_ERROR_CODES)[keyof typeof EC_ERROR_CODES]
