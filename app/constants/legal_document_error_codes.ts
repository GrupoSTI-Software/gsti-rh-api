/**
 * Códigos estables para el cliente (documentos legales versionados: aviso de
 * privacidad, términos y condiciones, consentimiento biométrico).
 * Prefijo LGDOC = Legal Document.
 *
 * NOT_CURRENT / INVALID_TYPE se usan en el cimiento (`GET /current`). El resto
 * los añade la gestión desde backoffice GSTI (ESB-08-09-03-01).
 */
export const LEGAL_DOCUMENT_ERROR_CODES = {
  /** El tipo consultado no tiene ninguna versión vigente (`is_current = true`). */
  NOT_CURRENT: 'LGDOC.NF.001',
  /** El `type` recibido no pertenece al enum de tipos de documento legal. */
  INVALID_TYPE: 'LGDOC.VAL.001',
  /** No existe ninguna versión con el `id` puntual solicitado. */
  NOT_FOUND: 'LGDOC.NF.002',
  /** Se intentó editar o publicar una versión que ya está `published` (inmutable). */
  PUBLISHED_IMMUTABLE: 'LGDOC.CONF.001',
  /** La combinación `(type, version)` ya existe (choca `unique`). */
  VERSION_COLLISION: 'LGDOC.CONF.002',
  /** Un usuario no-root intentó acceder a la gestión de documentos legales. */
  FORBIDDEN_PLATFORM: 'LGDOC.FORB.001',
  /** Se intentó publicar un borrador sin contenido en español o en inglés. */
  INCOMPLETE_LOCALE: 'LGDOC.VAL.002',
} as const

export type LegalDocumentErrorCode =
  (typeof LEGAL_DOCUMENT_ERROR_CODES)[keyof typeof LEGAL_DOCUMENT_ERROR_CODES]
