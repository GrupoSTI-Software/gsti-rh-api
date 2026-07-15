import TeleworkPolicyAcknowledgement from '#models/telework_policy_acknowledgement'
import type { TeleworkPolicyAcknowledgementRepository } from './telework_policy_acknowledgement.repository.js'

export default class TeleworkPolicyAcknowledgementRepositoryMysql
  implements TeleworkPolicyAcknowledgementRepository
{
  async listByBusinessUnit(businessUnitId: number): Promise<TeleworkPolicyAcknowledgement[]> {
    return TeleworkPolicyAcknowledgement.query()
      .where('business_unit_id', businessUnitId)
      .preload('policy')
  }
}
