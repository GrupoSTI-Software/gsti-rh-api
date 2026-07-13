import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import BusinessUnit from '#models/business_unit'
import Employee from '#models/employee'
import WorkingTimeRule from '#models/working_time_rule'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'

/**
 * @swagger
 * components:
 *   schemas:
 *     OvertimeWeeklyDetail:
 *       type: object
 *       properties:
 *         overtimeWeeklyDetailId:
 *           type: number
 *           description: Identificador del desglose semanal de horas extra
 *         employeeId:
 *           type: number
 *           description: Empleado al que pertenece el agregado
 *         businessUnitId:
 *           type: number
 *           description: Empresa operativa (aislamiento por tenant)
 *         payrollBusinessUnitId:
 *           type: number
 *           description: Empresa de nómina (cuadre con el reporte)
 *         overtimeWeeklyDetailIsoYear:
 *           type: number
 *           description: Año ISO de la semana (weekYear)
 *         overtimeWeeklyDetailIsoWeek:
 *           type: number
 *           description: Número de semana ISO (1-53)
 *         overtimeWeeklyDetailDoubleMinutes:
 *           type: number
 *           description: Minutos de horas extra pagadas al doble en la semana
 *         overtimeWeeklyDetailTripleMinutes:
 *           type: number
 *           description: Minutos de horas extra pagadas al triple en la semana
 *         overtimeWeeklyDetailWeeklyCapHours:
 *           type: number
 *           description: Tope semanal de horas extra usado para el reparto
 *         workingTimeRuleId:
 *           type: number
 *           description: Regla de jornada que definió el tope semanal
 *         overtimeWeeklyDetailCreatedAt:
 *           type: string
 *           description: Fecha de creación del registro
 *         overtimeWeeklyDetailUpdatedAt:
 *           type: string
 *           description: Fecha de última actualización
 *         overtimeWeeklyDetailDeletedAt:
 *           type: string
 *           description: Fecha de eliminación lógica
 */

export default class OvertimeWeeklyDetail extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  static table = 'overtime_weekly_details'

  @column({ isPrimary: true })
  declare overtimeWeeklyDetailId: number

  @column()
  declare employeeId: number

  @column()
  declare businessUnitId: number

  @column()
  declare payrollBusinessUnitId: number

  @column()
  declare overtimeWeeklyDetailIsoYear: number

  @column()
  declare overtimeWeeklyDetailIsoWeek: number

  @column()
  declare overtimeWeeklyDetailDoubleMinutes: number

  @column()
  declare overtimeWeeklyDetailTripleMinutes: number

  @column({ consume: (value: number | string) => Number(value) })
  declare overtimeWeeklyDetailWeeklyCapHours: number

  @column()
  declare workingTimeRuleId: number | null

  @column.dateTime({ autoCreate: true })
  declare overtimeWeeklyDetailCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare overtimeWeeklyDetailUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'overtime_weekly_detail_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
    localKey: 'employeeId',
  })
  declare employee: BelongsTo<typeof Employee>

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'businessUnitId',
    localKey: 'businessUnitId',
  })
  declare businessUnit: BelongsTo<typeof BusinessUnit>

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'payrollBusinessUnitId',
    localKey: 'businessUnitId',
  })
  declare payrollBusinessUnit: BelongsTo<typeof BusinessUnit>

  @belongsTo(() => WorkingTimeRule, {
    foreignKey: 'workingTimeRuleId',
    localKey: 'workingTimeRuleId',
  })
  declare workingTimeRule: BelongsTo<typeof WorkingTimeRule>
}
