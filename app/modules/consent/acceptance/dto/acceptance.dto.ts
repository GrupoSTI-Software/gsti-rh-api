import type { LegalDocumentType } from '#models/legal_document'

/** Documento vigente que al usuario todavía le falta aceptar, para su audiencia. */
export interface PendingDocumentDto {
  legalDocumentId: number
  type: LegalDocumentType
  version: string
}

/**
 * Respuesta de GET /api/consent/me y POST /api/consent/me.
 *
 * - `accepted`: RETROCOMPAT — true ⟺ `pendingDocuments.length === 0` para la audiencia
 *   de la sesión. Los clientes que solo miran este campo (guard binario) siguen verdes.
 * - `pendingDocuments`: NUEVO — documentos vigentes que le faltan aceptar al usuario,
 *   filtrados por audiencia (web: aviso+términos; app: +biométrico). Si un tipo aún no
 *   tiene versión vigente (p.ej. biométrico recién declarado), no aparece aquí.
 * - `currentVersion`/`acceptedVersion`: DEPRECATED conservados — versión vigente/aceptada
 *   del `privacy_notice` (ancla histórica), para no romper el onboarding actual.
 * - `acceptedAt`: ISO 8601 de la aceptación más reciente (null si nunca aceptó nada).
 */
export interface ConsentStatusDto {
  accepted: boolean
  pendingDocuments: PendingDocumentDto[]
  currentVersion: string | null
  acceptedVersion: string | null
  acceptedAt: string | null
}
