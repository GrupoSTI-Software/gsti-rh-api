import WorkingTimeRule from '#models/working_time_rule'
import { workingTimeRuleCache } from '#services/working_time_rule_cache_service'
import EffectiveRepositoryMysql from './effective.repository.mysql.js'
import type { EffectiveRepository } from './effective.repository.js'
import type { EffectiveRuleCaps, EffectiveRuleResult } from './dto/effective.dto.js'

/** País por defecto de los topes federales. */
const DEFAULT_COUNTRY_CODE = 'MX'

/**
 * Resolución de la jornada efectiva por (empresa, fecha): `getRulesForDate`.
 *
 * Precedencia: si la empresa tiene un override vigente para la fecha gana el override;
 * si no, aplica el federal vigente; si tampoco hay federal, devuelve effective null
 * (sin lanzar excepción). Cachea el resultado y consulta primero la caché.
 */
export default class EffectiveService {
  private readonly repository: EffectiveRepository

  constructor(repository: EffectiveRepository = new EffectiveRepositoryMysql()) {
    this.repository = repository
  }

  /**
   * Resuelve la regla aplicable a una empresa en una fecha.
   *
   * @param businessUnitId Empresa (tenant) objetivo.
   * @param date Fecha consultada en formato YYYY-MM-DD.
   * @param countryCode País de los topes federales (default MX).
   */
  async getRulesForDate(
    businessUnitId: number,
    date: string,
    countryCode: string = DEFAULT_COUNTRY_CODE
  ): Promise<EffectiveRuleResult> {
    const cached = workingTimeRuleCache.get(businessUnitId, countryCode, date)
    if (cached) {
      return cached
    }

    const federal = await this.resolveFederalForDate(countryCode, date)
    const override = await this.repository.findOverrideForDate(businessUnitId, countryCode, date)

    let result: EffectiveRuleResult
    if (override) {
      result = {
        businessUnitId,
        countryCode,
        date,
        source: 'override',
        exceedsFederal: override.workingTimeRuleExceedsFederal === true,
        effective: this.toCaps(override),
        federalBaseline: federal ? this.toCaps(federal) : null,
      }
    } else if (federal) {
      const federalCaps = this.toCaps(federal)
      result = {
        businessUnitId,
        countryCode,
        date,
        source: 'federal',
        exceedsFederal: false,
        effective: federalCaps,
        federalBaseline: federalCaps,
      }
    } else {
      result = {
        businessUnitId,
        countryCode,
        date,
        source: null,
        exceedsFederal: false,
        effective: null,
        federalBaseline: null,
      }
    }

    workingTimeRuleCache.set(businessUnitId, countryCode, date, result)
    return result
  }

  /**
   * Selecciona el federal vigente a la fecha. Usa [valid_from, valid_to] y, como
   * fallback defensivo cuando una fila federal no trae fechas pobladas, deriva la
   * ventana como [01-01, 12-31] del effective_year.
   */
  private async resolveFederalForDate(
    countryCode: string,
    date: string
  ): Promise<WorkingTimeRule | null> {
    const candidates = await this.repository.findFederalCandidates(countryCode)

    for (const rule of candidates) {
      const from = rule.workingTimeRuleValidFrom?.toISODate() ?? `${rule.workingTimeRuleEffectiveYear}-01-01`
      const to =
        rule.workingTimeRuleValidTo?.toISODate() ??
        (rule.workingTimeRuleValidFrom ? null : `${rule.workingTimeRuleEffectiveYear}-12-31`)

      if (from <= date && (to === null || date <= to)) {
        return rule
      }
    }

    return null
  }

  /** Mapea un registro persistido a los topes normalizados de la respuesta. */
  private toCaps(rule: WorkingTimeRule): EffectiveRuleCaps {
    return {
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
