import WorkingTimeRule from '#models/working_time_rule'
import { DEFAULT_COUNTRY_CODE } from '#modules/working-time-rules/working_time_rule.constants'
import FederalRepositoryMysql from './federal.repository.mysql.js'
import type { FederalRepository } from './federal.repository.js'
import type { FederalRule } from './dto/federal.dto.js'

/**
 * Lectura del catálogo federal de jornada.
 *
 * Devuelve los escalones de la gradualidad de la reforma (reglas con
 * business_unit_id null) ordenados cronológicamente. No expone datos de tenant.
 */
export default class FederalService {
  private readonly repository: FederalRepository

  constructor(repository: FederalRepository = new FederalRepositoryMysql()) {
    this.repository = repository
  }

  /** Lista las reglas federales del país, de la más antigua a la más reciente. */
  async listFederalRules(countryCode: string = DEFAULT_COUNTRY_CODE): Promise<FederalRule[]> {
    const rules = await this.repository.listFederalRules(countryCode)
    return rules.map((rule) => this.toFederalRule(rule))
  }

  /** Mapea un registro persistido al DTO normalizado de la respuesta. */
  private toFederalRule(rule: WorkingTimeRule): FederalRule {
    return {
      workingTimeRuleId: rule.workingTimeRuleId,
      countryCode: rule.workingTimeRuleCountryCode,
      effectiveYear: rule.workingTimeRuleEffectiveYear,
      validFrom: rule.workingTimeRuleValidFrom?.toISODate() ?? null,
      validTo: rule.workingTimeRuleValidTo?.toISODate() ?? null,
      maxWeeklyHours: rule.workingTimeRuleMaxWeeklyHours,
      maxWeeklyOvertimeHours: rule.workingTimeRuleMaxWeeklyOvertimeHours,
      maxDailyOvertimeHours: rule.workingTimeRuleMaxDailyOvertimeHours,
      maxOvertimeDaysPerWeek: rule.workingTimeRuleMaxOvertimeDaysPerWeek,
      dailyHoursDay: rule.workingTimeRuleDailyHoursDay,
      dailyHoursNight: rule.workingTimeRuleDailyHoursNight,
      dailyHoursMixed: rule.workingTimeRuleDailyHoursMixed,
      workDaysPerRestDay: rule.workingTimeRuleWorkDaysPerRestDay,
      salaryProtection: rule.workingTimeRuleSalaryProtection === true,
    }
  }
}
