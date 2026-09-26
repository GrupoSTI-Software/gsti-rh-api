import type { LegalDocumentContent, LegalDocumentStatus, LegalDocumentType } from '#models/legal_document'

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

/** Quien publicó la versión, resuelto a un nombre visible en UI (no solo el id crudo). */
export interface LegalDocumentPublishedByDto {
  userId: number
  name: string
  email: string
}

/**
 * Forma administrativa de una versión (gestión reservada a `root`).
 *
 * A diferencia de `LegalDocumentDto`, expone el contenido completo por idioma
 * (`content: { es, en }`, no resuelto a un solo locale) y los metadatos de
 * auditoría (`publishedBy`), necesarios para el histórico y el detalle de
 * gestión. Nunca se devuelve a un usuario no-root (lo garantiza el controller).
 */
export interface LegalDocumentAdminDto {
  id: number
  type: LegalDocumentType
  version: string
  content: LegalDocumentContent
  status: LegalDocumentStatus
  isCurrent: boolean
  publishedAt: string | null
  publishedBy: LegalDocumentPublishedByDto | null
}
