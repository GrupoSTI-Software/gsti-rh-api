import WorkingTimeRule from '#models/working_time_rule'
import type { EffectiveRepository } from './effective.repository.js'

/** Implementación Lucid/MySQL del repositorio de jornada efectiva (solo lectura). */
export default class EffectiveRepositoryMysql implements EffectiveRepository {
  async findOverrideForDate(
    businessUnitId: number,
    countryCode: string,
    date: string
  ): Promise<WorkingTimeRule | null> {
    return WorkingTimeRule.query()
      .whereNull('working_time_rule_deleted_at')
      .where('business_unit_id', businessUnitId)
      .where('working_time_rule_country_code', countryCode)
      .where('working_time_rule_valid_from', '<=', date)
      .where((sub) => {
        sub
          .whereNull('working_time_rule_valid_to')
          .orWhere('working_time_rule_valid_to', '>=', date)
      })
      .orderBy('working_time_rule_valid_from', 'desc')
      .first()
  }

  async findFederalCandidates(countryCode: string): Promise<WorkingTimeRule[]> {
    return WorkingTimeRule.query()
      .whereNull('working_time_rule_deleted_at')
      .whereNull('business_unit_id')
      .where('working_time_rule_country_code', countryCode)
      .orderBy('working_time_rule_valid_from', 'desc')
  }
}
