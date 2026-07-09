/**
 * Códigos estables para el cliente (consentimiento legal por documento).
 * Prefijo CSNT = Consent.
 */
export const CONSENT_ERROR_CODES = {
  /** `documentVersion` no coincide con la versión vigente del tipo (422). */
  INVALID_VERSION: 'CSNT.VAL.001',
  /** `type`/`audience` fuera del enum permitido, o error de validación genérico (422). */
  INVALID_TYPE: 'CSNT.VAL.002',
} as const

export type ConsentErrorCode = (typeof CONSENT_ERROR_CODES)[keyof typeof CONSENT_ERROR_CODES]
