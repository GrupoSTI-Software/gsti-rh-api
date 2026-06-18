import { DateTime } from 'luxon'
import UserConsent from '#models/user_consent'
import type { AcceptanceRepository } from './acceptance.repository.js'

/**
 * Implementación Lucid del repositorio de consentimiento.
 *
 * Idempotencia en `recordAcceptance`: usa `firstOrCreate` sobre la clave única
 * (user_id, document_version); si ya existe, devuelve el registro sin modificarlo
 * (el registro es inmutable por diseño legal).
 */
export default class AcceptanceRepositoryMysql implements AcceptanceRepository {
  async findByUserAndVersion(userId: number, version: string): Promise<UserConsent | null> {
    return UserConsent.query()
      .where('user_id', userId)
      .where('user_consent_document_version', version)
      .first()
  }

  async recordAcceptance(userId: number, version: string, acceptedAt: Date): Promise<UserConsent> {
    const [record] = await UserConsent.fetchOrCreateMany(
      ['userId', 'userConsentDocumentVersion'],
      [
        {
          userId,
          userConsentDocumentVersion: version,
          userConsentAcceptedAt: DateTime.fromJSDate(acceptedAt),
        },
      ]
    )
    return record
  }
}
