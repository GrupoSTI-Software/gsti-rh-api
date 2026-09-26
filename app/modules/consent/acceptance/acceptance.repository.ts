import type UserConsent from '#models/user_consent'

/** Documento a aceptar: resuelto por el service desde `legal_documents`, nunca del cliente. */
export interface AcceptanceDocumentInput {
  legalDocumentId: number
  documentVersion: string
}

/** Evidencia de origen de la aceptación (se cifra en el modelo vía prepare/consume). */
export interface AcceptanceEvidence {
  ip: string | null
  userAgent: string | null
}

/** Puerto de acceso a datos de consentimiento. */
export interface AcceptanceRepository {
  /** Todas las aceptaciones vigentes del usuario (evidencia existente, un asiento por documento). */
  findAcceptancesByUser(userId: number): Promise<UserConsent[]>

  /**
   * Registra la aceptación de uno o más documentos en una sola operación atómica.
   * Idempotente: si `(user_id, legal_document_id)` ya existe, devuelve el registro
   * existente sin duplicar ni re-fechar (evidencia inmutable).
   */
  recordAcceptances(
    userId: number,
    documents: AcceptanceDocumentInput[],
    evidence: AcceptanceEvidence,
    acceptedAt: Date
  ): Promise<UserConsent[]>
}
