/**
 * Códigos estables para el cliente (documentos legales versionados: aviso de
 * privacidad, términos y condiciones, consentimiento biométrico).
 * Prefijo LGDOC = Legal Document.
 *
 * NOT_CURRENT / INVALID_TYPE se usan en esta hermana A (cimiento). Los códigos
 * de gestión (NOT_FOUND de versión puntual, conflicto de publicación, etc.)
 * los añade la hermana de gestión ESB-08-09-03-01.
 */
export const LEGAL_DOCUMENT_ERROR_CODES = {
  /** El tipo consultado no tiene ninguna versión vigente (`is_current = true`). */
  NOT_CURRENT: 'LGDOC.NF.001',
  /** El `type` recibido no pertenece al enum de tipos de documento legal. */
  INVALID_TYPE: 'LGDOC.VAL.001',
} as const

export type LegalDocumentErrorCode =
  (typeof LEGAL_DOCUMENT_ERROR_CODES)[keyof typeof LEGAL_DOCUMENT_ERROR_CODES]
