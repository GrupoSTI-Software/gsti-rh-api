import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import WorkingTimeRule from '#models/working_time_rule'

/**
 * Semilla idempotente con los topes legales federales de México del decreto de reforma
 * a la LFT (DOF 1-may-2026): reducción escalonada de la jornada semanal 2026-2030.
 *
 * Incluye además una regla pre-reforma (effective_year 2025) con vigencia abierta hacia
 * atrás (valid_from histórico) y cierre el 2025-12-31, para que los periodos anteriores
 * al primer escalón (p. ej. reportes históricos desde 2024) resuelvan el tope de 48 h
 * desde el motor (fuente única) y no por un fallback local.
 *
 * El upsert se acota a la clave natural (country_code, effective_year) para no pisar
 * registros futuros ni duplicar al re-ejecutar.
 */
export default class extends BaseSeeder {
  async run() {
    const countryCode = 'MX'

    // Vigencia histórica de la regla pre-reforma: cubre cualquier reporte anterior a 2026.
    const PRE_REFORM_VALID_FROM = '2000-01-01'

    // año / semanal / HE semana / HE día / días HE semana / diurna / nocturna / mixta / 6x1
    // `from`/`to` opcionales sobreescriben la vigencia derivada del año (ISO yyyy-mm-dd).
    const rules: Array<{
      year: number
      weekly: number
      weeklyOt: number
      dailyOt: number
      otDays: number
      day: number
      night: number
      mixed: number
      rest: number
      from?: string
      to?: string | null
    }> = [
      // Pre-reforma: régimen de 48 h vigente hasta el cierre de 2025 (sin hueco con 2026).
      { year: 2025, weekly: 48, weeklyOt: 9, dailyOt: 4, otDays: 4, day: 8, night: 7, mixed: 7.5, rest: 6, from: PRE_REFORM_VALID_FROM, to: '2025-12-31' },
      { year: 2026, weekly: 48, weeklyOt: 9, dailyOt: 4, otDays: 4, day: 8, night: 7, mixed: 7.5, rest: 6 },
      { year: 2027, weekly: 46, weeklyOt: 9, dailyOt: 4, otDays: 4, day: 8, night: 7, mixed: 7.5, rest: 6 },
      { year: 2028, weekly: 44, weeklyOt: 10, dailyOt: 4, otDays: 4, day: 8, night: 7, mixed: 7.5, rest: 6 },
      { year: 2029, weekly: 42, weeklyOt: 11, dailyOt: 4, otDays: 4, day: 8, night: 7, mixed: 7.5, rest: 6 },
      { year: 2030, weekly: 40, weeklyOt: 12, dailyOt: 4, otDays: 4, day: 8, night: 7, mixed: 7.5, rest: 6 },
    ]

    for (const rule of rules) {
      const validFrom = rule.from
        ? DateTime.fromISO(rule.from)
        : DateTime.fromObject({ year: rule.year, month: 1, day: 1 })

      const validTo = this.resolveValidTo(rule)

      // La clave natural incluye business_unit_id null: el par (país, año) NO es único
      // porque los overrides comparten effective_year; sin este filtro el upsert podría
      // enganchar un override en lugar de la regla federal.
      await WorkingTimeRule.updateOrCreate(
        {
          workingTimeRuleCountryCode: countryCode,
          workingTimeRuleEffectiveYear: rule.year,
          businessUnitId: null,
        },
        {
          workingTimeRuleValidFrom: validFrom,
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

  /**
   * Resuelve la fecha de fin de vigencia de una regla: usa el `to` explícito si se
   * declaró (incluido null = indefinido); si no, 2030 es indefinido y el resto cierra
   * el 31 de diciembre de su año.
   */
  private resolveValidTo(rule: { year: number; to?: string | null }): DateTime | null {
    if ('to' in rule) {
      return rule.to === null ? null : DateTime.fromISO(rule.to as string)
    }
    if (rule.year === 2030) {
      return null
    }
    return DateTime.fromObject({ year: rule.year, month: 12, day: 31 })
  }
}
