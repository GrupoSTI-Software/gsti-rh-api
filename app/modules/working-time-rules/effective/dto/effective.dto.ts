/**
 * DTOs y tipos del submódulo de jornada efectiva (`getRulesForDate`).
 *
 * La API expone camelCase; el mapeo desde las columnas prefijadas de
 * `working_time_rules` lo hace el service.
 */

/** Origen de la regla resuelta. */
export type EffectiveRuleSource = 'override' | 'federal'

/** Topes de jornada normalizados que devuelve el resolver. */
export interface EffectiveRuleCaps {
  effectiveYear: number
  validFrom: string | null
  validTo: string | null
  maxWeeklyHours: number
  maxWeeklyOvertimeHours: number
  maxDailyOvertimeHours: number
  maxOvertimeDaysPerWeek: number
  dailyHoursDay: number
  dailyHoursNight: number
  dailyHoursMixed: number
  workDaysPerRestDay: number
  salaryProtection: boolean
}

/**
 * Resultado de `getRulesForDate`.
 *
 * - `effective`/`source` null cuando no hay ni override ni federal vigente.
 * - `federalBaseline` es el federal del mismo periodo (igual a `effective` si la
 *   fuente es federal); null si tampoco hay federal.
 * - `exceedsFederal` solo es true cuando un override supera al federal vigente.
 */
export interface EffectiveRuleResult {
  businessUnitId: number
  countryCode: string
  date: string
  source: EffectiveRuleSource | null
  exceedsFederal: boolean
  effective: EffectiveRuleCaps | null
  federalBaseline: EffectiveRuleCaps | null
}
