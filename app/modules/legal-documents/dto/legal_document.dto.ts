import type { LegalDocumentType } from '#models/legal_document'

/**
 * Forma pública del documento legal vigente.
 *
 * Deliberadamente NO incluye `publishedByUserId` ni histórico: es solo lectura
 * para las pantallas de aceptación (regla de seguridad del spec).
 */
export interface LegalDocumentDto {
  type: LegalDocumentType
  version: string
  content: string
  publishedAt: string | null
}
