/**
 * DTOs y tipos del submódulo de catálogo federal de jornada (solo lectura).
 *
 * La API expone camelCase; el mapeo desde las columnas prefijadas de
 * `working_time_rules` lo hace el service. Incluye `workingTimeRuleId` y
 * `countryCode` porque el front necesita identificar cada escalón de la ley.
 */

/** Regla federal del catálogo de gradualidad (business_unit_id null). */
export interface FederalRule {
  workingTimeRuleId: number
  countryCode: string
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
