import { DateTime } from 'luxon'
import { BaseModel, beforeSave, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { compose } from '@adonisjs/core/helpers'
import WorkingTimeRuleError from '#exceptions/working_time_rule_error'

/**
 * @swagger
 * components:
 *   schemas:
 *      WorkingTimeRule:
 *        type: object
 *        properties:
 *          workingTimeRuleId:
 *            type: number
 *            description: Working time rule id
 *          workingTimeRuleCountryCode:
 *            type: string
 *            description: ISO 3166-1 alpha-2 country code (default MX)
 *          workingTimeRuleEffectiveYear:
 *            type: number
 *            description: Fiscal year the rule applies to
 *          workingTimeRuleValidFrom:
 *            type: string
 *            description: Date the rule starts being valid
 *          workingTimeRuleValidTo:
 *            type: string
 *            description: Date the rule stops being valid (null = indefinite)
 *          workingTimeRuleMaxWeeklyHours:
 *            type: number
 *            description: Maximum legal working hours per week
 *          workingTimeRuleMaxWeeklyOvertimeHours:
 *            type: number
 *            description: Maximum overtime hours per week
 *          workingTimeRuleMaxDailyOvertimeHours:
 *            type: number
 *            description: Maximum overtime hours per day
 *          workingTimeRuleMaxOvertimeDaysPerWeek:
 *            type: number
 *            description: Maximum overtime days per week
 *          workingTimeRuleDailyHoursDay:
 *            type: number
 *            description: Daily hours for a day shift (Art. 61)
 *          workingTimeRuleDailyHoursNight:
 *            type: number
 *            description: Daily hours for a night shift (Art. 61)
 *          workingTimeRuleDailyHoursMixed:
 *            type: number
 *            description: Daily hours for a mixed shift (Art. 61)
 *          workingTimeRuleWorkDaysPerRestDay:
 *            type: number
 *            description: Worked days per rest day (6x1 rule)
 *          workingTimeRuleSalaryProtection:
 *            type: boolean
 *            description: Whether salary protection applies
 *          workingTimeRuleCreatedAt:
 *            type: string
 *          workingTimeRuleUpdatedAt:
 *            type: string
 *          workingTimeRuleDeletedAt:
 *            type: string
 *
 */
export default class WorkingTimeRule extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare workingTimeRuleId: number

  @column()
  declare workingTimeRuleCountryCode: string

  @column()
  declare workingTimeRuleEffectiveYear: number

  @column.date()
  declare workingTimeRuleValidFrom: DateTime

  @column.date()
  declare workingTimeRuleValidTo: DateTime | null

  @column()
  declare workingTimeRuleMaxWeeklyHours: number

  @column()
  declare workingTimeRuleMaxWeeklyOvertimeHours: number

  @column()
  declare workingTimeRuleMaxDailyOvertimeHours: number

  @column()
  declare workingTimeRuleMaxOvertimeDaysPerWeek: number

  @column()
  declare workingTimeRuleDailyHoursDay: number

  @column()
  declare workingTimeRuleDailyHoursNight: number

  @column()
  declare workingTimeRuleDailyHoursMixed: number

  @column()
  declare workingTimeRuleWorkDaysPerRestDay: number

  @column()
  declare workingTimeRuleSalaryProtection: boolean

  @column.dateTime({ autoCreate: true, columnName: 'working_time_rule_created_at' })
  declare workingTimeRuleCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true, columnName: 'working_time_rule_updated_at' })
  declare workingTimeRuleUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'working_time_rule_deleted_at' })
  declare deletedAt: DateTime | null

  /**
   * Valida los valores antes de persistir: ningún parámetro numérico puede ser negativo
   * y la jornada semanal debe ser estrictamente mayor a cero.
   */
  @beforeSave()
  static async validateBeforeSave(rule: WorkingTimeRule) {
    WorkingTimeRule.assertValidValues(rule)
    await WorkingTimeRule.assertNoOverlap(rule)
  }

  /** Rechaza valores negativos o una jornada semanal en cero. */
  static assertValidValues(rule: WorkingTimeRule) {
    const weeklyHours = rule.workingTimeRuleMaxWeeklyHours
    if (weeklyHours === null || weeklyHours === undefined || weeklyHours <= 0) {
      throw new WorkingTimeRuleError(
        'valores-invalidos',
        'Valores inválidos',
        'La jornada semanal debe ser mayor a cero.'
      )
    }

    const nonNegativeValues: Array<[string, number]> = [
      ['horas extra por semana', rule.workingTimeRuleMaxWeeklyOvertimeHours],
      ['horas extra por día', rule.workingTimeRuleMaxDailyOvertimeHours],
      ['días con horas extra por semana', rule.workingTimeRuleMaxOvertimeDaysPerWeek],
      ['jornada diurna', rule.workingTimeRuleDailyHoursDay],
      ['jornada nocturna', rule.workingTimeRuleDailyHoursNight],
      ['jornada mixta', rule.workingTimeRuleDailyHoursMixed],
      ['días trabajados por descanso', rule.workingTimeRuleWorkDaysPerRestDay],
    ]

    for (const [label, value] of nonNegativeValues) {
      if (value === null || value === undefined || value < 0) {
        throw new WorkingTimeRuleError(
          'valores-invalidos',
          'Valores inválidos',
          `El valor de ${label} no puede ser negativo.`
        )
      }
    }
  }

  /**
   * Rechaza vigencias solapadas para el mismo country_code. Dos rangos se solapan cuando
   * el inicio de uno es anterior o igual al fin del otro y viceversa, tratando un
   * valid_to nulo como vigencia indefinida.
   */
  static async assertNoOverlap(rule: WorkingTimeRule) {
    const INFINITE_DATE = '9999-12-31'
    const validFrom = rule.workingTimeRuleValidFrom?.toISODate()
    const validTo = rule.workingTimeRuleValidTo?.toISODate() ?? INFINITE_DATE

    if (!validFrom) {
      throw new WorkingTimeRuleError(
        'valores-invalidos',
        'Valores inválidos',
        'La fecha de inicio de vigencia es obligatoria.'
      )
    }

    const query = WorkingTimeRule.query()
      .whereNull('working_time_rule_deleted_at')
      .where('working_time_rule_country_code', rule.workingTimeRuleCountryCode)
      .where('working_time_rule_valid_from', '<=', validTo)
      .where((sub) => {
        sub
          .whereNull('working_time_rule_valid_to')
          .orWhere('working_time_rule_valid_to', '>=', validFrom)
      })

    // Excluye el propio registro (por id en updates, por clave natural en upserts).
    if (rule.workingTimeRuleId) {
      query.whereNot('working_time_rule_id', rule.workingTimeRuleId)
    } else {
      query.whereNot('working_time_rule_effective_year', rule.workingTimeRuleEffectiveYear)
    }

    const overlapping = await query.first()
    if (overlapping) {
      throw new WorkingTimeRuleError(
        'vigencia-solapada',
        'Vigencia solapada',
        `Ya existe una regla vigente para ${rule.workingTimeRuleCountryCode} que se solapa con el rango indicado.`
      )
    }
  }
}
