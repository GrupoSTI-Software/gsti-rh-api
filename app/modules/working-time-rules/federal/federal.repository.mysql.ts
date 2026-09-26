import WorkingTimeRule from '#models/working_time_rule'
import type { FederalRepository } from './federal.repository.js'

/** Implementación Lucid/MySQL del repositorio del catálogo federal (solo lectura). */
export default class FederalRepositoryMysql implements FederalRepository {
  async listFederalRules(countryCode: string): Promise<WorkingTimeRule[]> {
    return WorkingTimeRule.query()
      .whereNull('working_time_rule_deleted_at')
      .whereNull('business_unit_id')
      .where('working_time_rule_country_code', countryCode)
      .orderBy('working_time_rule_valid_from', 'asc')
  }
}
