import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import WorkingTimeRule from '#models/working_time_rule'

/**
 * Semilla idempotente con los topes legales federales de México del decreto de reforma
 * a la LFT (DOF 1-may-2026): reducción escalonada de la jornada semanal 2026-2030.
 * El upsert se acota a la clave natural (country_code, effective_year) para no pisar
 * registros futuros ni duplicar al re-ejecutar.
 */
export default class extends BaseSeeder {
  async run() {
    const countryCode = 'MX'

    // año / semanal / HE semana / HE día / días HE semana / diurna / nocturna / mixta / 6x1
    const rules = [
      { year: 2026, weekly: 48, weeklyOt: 9, dailyOt: 4, otDays: 4, day: 8, night: 7, mixed: 7.5, rest: 6 },
      { year: 2027, weekly: 46, weeklyOt: 9, dailyOt: 4, otDays: 4, day: 8, night: 7, mixed: 7.5, rest: 6 },
      { year: 2028, weekly: 44, weeklyOt: 10, dailyOt: 4, otDays: 4, day: 8, night: 7, mixed: 7.5, rest: 6 },
      { year: 2029, weekly: 42, weeklyOt: 11, dailyOt: 4, otDays: 4, day: 8, night: 7, mixed: 7.5, rest: 6 },
      { year: 2030, weekly: 40, weeklyOt: 12, dailyOt: 4, otDays: 4, day: 8, night: 7, mixed: 7.5, rest: 6 },
    ]

    for (const rule of rules) {
      // 2030 es la última etapa de la reforma: vigente de forma indefinida (valid_to nulo).
      const validTo = rule.year === 2030 ? null : DateTime.fromObject({ year: rule.year, month: 12, day: 31 })

      await WorkingTimeRule.updateOrCreate(
        {
          workingTimeRuleCountryCode: countryCode,
          workingTimeRuleEffectiveYear: rule.year,
        },
        {
          workingTimeRuleValidFrom: DateTime.fromObject({ year: rule.year, month: 1, day: 1 }),
          workingTimeRuleValidTo: validTo,
          workingTimeRuleMaxWeeklyHours: rule.weekly,
          workingTimeRuleMaxWeeklyOvertimeHours: rule.weeklyOt,
          workingTimeRuleMaxDailyOvertimeHours: rule.dailyOt,
          workingTimeRuleMaxOvertimeDaysPerWeek: rule.otDays,
          workingTimeRuleDailyHoursDay: rule.day,
          workingTimeRuleDailyHoursNight: rule.night,
          workingTimeRuleDailyHoursMixed: rule.mixed,
          workingTimeRuleWorkDaysPerRestDay: rule.rest,
          workingTimeRuleSalaryProtection: true,
        }
      )
    }
  }
}
