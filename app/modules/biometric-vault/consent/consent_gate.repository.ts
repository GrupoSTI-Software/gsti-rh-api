import type { DateTime } from 'luxon'
import type { UserConsentChannel } from '#models/user_consent'

/** Consentimiento biometrico encontrado para un colaborador. */
export interface ConsentRecord {
  userConsentId: number
  legalDocumentId: number
  channel: UserConsentChannel
  grantedAt: DateTime
}

/** Puerto de lectura del consentimiento. El dominio no toca Lucid. */
export interface ConsentGateRepository {
  /** Version vigente del documento de consentimiento biometrico, o `null`. */
  findCurrentBiometricDocumentId(): Promise<number | null>
  /**
   * Consentimiento de ese documento para el colaborador, por cualquier canal.
   *
   * Se busca por `employee_id` y tambien por el `user_id` de su persona: el
   * digital lo firma el usuario y el fisico se asienta contra el colaborador,
   * y una persona puede tener solo uno de los dos anclajes.
   */
  findConsentFor(employeeId: number, legalDocumentId: number): Promise<ConsentRecord | null>
}
