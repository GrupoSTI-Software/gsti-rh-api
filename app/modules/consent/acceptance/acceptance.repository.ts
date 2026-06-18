import type UserConsent from '#models/user_consent'

/** Puerto de acceso a datos de consentimiento. */
export interface AcceptanceRepository {
  /**
   * Busca el registro de aceptación de una versión específica por usuario.
   * Devuelve null si el usuario no ha aceptado esa versión.
   */
  findByUserAndVersion(userId: number, version: string): Promise<UserConsent | null>

  /**
   * Crea un registro de aceptación.
   * Idempotente: si ya existe (user_id + version), devuelve el existente sin duplicar.
   */
  recordAcceptance(userId: number, version: string, acceptedAt: Date): Promise<UserConsent>
}
