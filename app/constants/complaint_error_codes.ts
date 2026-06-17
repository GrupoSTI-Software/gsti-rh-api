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
} as const

export type ComplaintErrorCode =
  (typeof COMPLAINT_ERROR_CODES)[keyof typeof COMPLAINT_ERROR_CODES]
