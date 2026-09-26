import { DateTime } from 'luxon'
import UserConsent from '#models/user_consent'
import type {
  AcceptanceDocumentInput,
  AcceptanceEvidence,
  AcceptanceRepository,
} from './acceptance.repository.js'

/**
 * Implementación Lucid del repositorio de consentimiento.
 *
 * Idempotencia en `recordAcceptances`: usa `fetchOrCreateMany` sobre la clave única
 * (user_id, legal_document_id); si ya existe, devuelve el registro sin modificarlo
 * (el registro es inmutable por diseño legal). `fetchOrCreateMany` envuelve la
 * creación de todo el payload en una única transacción administrada por Lucid, por
 * lo que el "paquete web" (aviso + términos) se registra atómicamente.
 */
export default class AcceptanceRepositoryMysql implements AcceptanceRepository {
  async findAcceptancesByUser(userId: number): Promise<UserConsent[]> {
    return UserConsent.query().where('user_id', userId)
  }

  async recordAcceptances(
    userId: number,
    documents: AcceptanceDocumentInput[],
    evidence: AcceptanceEvidence,
    acceptedAt: Date
  ): Promise<UserConsent[]> {
    const payload = documents.map((doc) => ({
      userId,
      legalDocumentId: doc.legalDocumentId,
      userConsentDocumentVersion: doc.documentVersion,
      userConsentAcceptedAt: DateTime.fromJSDate(acceptedAt),
      userConsentIp: evidence.ip,
      userConsentUserAgent: evidence.userAgent,
    }))

    return UserConsent.fetchOrCreateMany(['userId', 'legalDocumentId'], payload)
  }
}
