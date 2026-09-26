/**
 * Códigos estables para el cliente (consulta/export de evidencia de aceptaciones).
 * Prefijo CEVI = Consent Evidence.
 */
export const CONSENT_EVIDENCE_ERROR_CODES = {
  /** Rol distinto de `root` (o sin el permiso `consent-evidence:read`) — 403. */
  FORBIDDEN: 'CEVI.FORB.001',
  /** Filtros de consulta/export inválidos (tipo, versión, ids, paginación) — 422. */
  VALIDATION: 'CEVI.VAL.001',
} as const

export type ConsentEvidenceErrorCode =
  (typeof CONSENT_EVIDENCE_ERROR_CODES)[keyof typeof CONSENT_EVIDENCE_ERROR_CODES]
