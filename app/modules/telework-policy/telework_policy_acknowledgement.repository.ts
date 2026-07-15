import type TeleworkPolicyAcknowledgement from '#models/telework_policy_acknowledgement'

/**
 * Solo lectura (USRH1783547655377): el INSERT del acuse lo hace la HU
 * hermana ESB-08-07-02-03 desde la app del teletrabajador. Esta HU nunca
 * escribe acuses (regla de negocio 11) — por eso no hay `create`/`update`/
 * `delete` en la interfaz: sin método, sin superficie.
 */
export interface TeleworkPolicyAcknowledgementRepository {
  /** Todos los acuses de la empresa (para el seguimiento), con la versión precargada. */
  listByBusinessUnit(businessUnitId: number): Promise<TeleworkPolicyAcknowledgement[]>
}
