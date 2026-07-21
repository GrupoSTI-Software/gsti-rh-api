/**
 * Códigos estables para el cliente (buzón de quejas NOM-035).
 * Prefijo CMPL = Complaint.
 */
export const COMPLAINT_ERROR_CODES = {
  /** Parámetros de body inválidos (Vine) */
  VAL_INPUT: 'CMPL.VAL.001',
  /** Usuario autenticado sin registro de empleado asociado */
  EMPLOYEE_NOT_FOUND: 'CMPL.EMP.001',
  /** Folio + passphrase no coinciden, o queja inexistente/fuera de alcance */
  STATUS_NOT_FOUND: 'CMP.NF.001',
  /** Sin permiso sobre el módulo de quejas */
  FORBIDDEN: 'CMPL.FORB.001',
  /** No se pudo generar un folio único */
  FOLIO_GENERATION_FAILED: 'CMPL.SYS.001',
  /** Error no tipado */
  SYS_UNHANDLED: 'CMPL.SYS.002',
  /** Archivo inválido (tipo, tamaño o contenido) */
  INVALID_FILE: 'CMPL.VAL.FILE.001',
  /** Adjunto inexistente o fuera del alcance */
  ATTACHMENT_NOT_FOUND: 'CMP.NF.002',
  /** Error al subir o firmar URL en S3 */
  S3_OPERATION_FAILED: 'CMPL.S3.001',
  /** Nota obligatoria ausente en transición de estatus */
  NOTE_REQUIRED: 'CMPL.VAL.NOTE.001',
  /** Justificación obligatoria ausente al revelar identidad */
  JUSTIFICATION_REQUIRED: 'CMPL.VAL.JUST.001',
  /** Sin permiso complaint.reveal_identity */
  REVEAL_FORBIDDEN: 'CMPL.FORB.REVEAL.001',
  /** Rango de fechas invertido o inválido en reporte */
  DATE_RANGE_INVALID: 'CMPL.VAL.DATE.001',
  /** Slug de categoría inexistente o inactivo en el catálogo */
  CATEGORY_NOT_FOUND: 'CMPL.VAL.CATEGORY.001',
} as const

export type ComplaintErrorCode =
  (typeof COMPLAINT_ERROR_CODES)[keyof typeof COMPLAINT_ERROR_CODES]
