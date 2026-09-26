import TeleworkPolicyAcknowledgement from '#models/telework_policy_acknowledgement'
import type { TeleworkPolicyAcknowledgementRepository } from './telework_policy_acknowledgement.repository.js'

export default class TeleworkPolicyAcknowledgementRepositoryMysql
  implements TeleworkPolicyAcknowledgementRepository
{
  /**
   * `TeleworkPolicyAcknowledgement` ya compone `withBusinessUnitScope()`
   * desde su creación — el `where('business_unit_id', ...)` manual era
   * redundante bajo contexto activo; se retiró (USRH1784259058567).
   */
  async listByBusinessUnit(_businessUnitId: number): Promise<TeleworkPolicyAcknowledgement[]> {
    return TeleworkPolicyAcknowledgement.query().preload('policy')
  }
}
