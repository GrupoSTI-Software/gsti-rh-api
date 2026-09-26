import WorkingTimeRule from '#models/working_time_rule'
import type { OverridesRepository } from './overrides.repository.js'

/** Implementación Lucid/MySQL del repositorio de overrides. */
export default class OverridesRepositoryMysql implements OverridesRepository {
  async listByBusinessUnit(businessUnitId: number): Promise<WorkingTimeRule[]> {
    return WorkingTimeRule.query()
      .whereNull('working_time_rule_deleted_at')
      .where('business_unit_id', businessUnitId)
      .orderBy('working_time_rule_valid_from', 'desc')
  }

  async findOverrideById(id: number): Promise<WorkingTimeRule | null> {
    return WorkingTimeRule.query()
      .whereNull('working_time_rule_deleted_at')
      .whereNotNull('business_unit_id')
      .where('working_time_rule_id', id)
      .first()
  }

  async findFederalForDate(countryCode: string, date: string): Promise<WorkingTimeRule | null> {
    return WorkingTimeRule.query()
      .whereNull('working_time_rule_deleted_at')
      .whereNull('business_unit_id')
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

  async create(attributes: Partial<WorkingTimeRule>): Promise<WorkingTimeRule> {
    return WorkingTimeRule.create(attributes)
  }

  async update(
    rule: WorkingTimeRule,
    attributes: Partial<WorkingTimeRule>
  ): Promise<WorkingTimeRule> {
    rule.merge(attributes)
    await rule.save()
    return rule
  }

  async softDelete(rule: WorkingTimeRule): Promise<void> {
    await rule.delete()
  }
}
